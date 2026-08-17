// Command backup-sync uploads the live database (DB_PATH) and, if file storage is local
// (STORAGE_LOCAL_PATH), the uploads directory to S3 — both paths read straight from .env, the
// same config the running server itself uses, not a separate local-backup directory. Gated
// entirely by S3_BACKUP_BUCKET: unset/empty means "do nothing" (exit 0, not an error) so a
// deployment with no S3 backup configured never even tries. Any failure here (bad credentials,
// network, bucket typo, missing sqlite3 binary) is logged and this command exits non-zero, but
// it never touches or deletes any local file either way — a failed S3 sync can never put local
// data at risk.
//
// The database is never uploaded as a raw copy of the live file — SQLite in WAL mode can be
// mid-write at any moment, so a plain file copy risks an inconsistent snapshot. This shells out
// to `sqlite3 $DB_PATH ".backup"` (the same safe mechanism deploy/backup.sh already uses for its
// local copy) to produce one consistent temp snapshot immediately before upload, then removes
// the temp file. sqlite3 is already a required binary on the server for that reason.
//
// Uses this app's own aws-sdk-go-v2 dependency (already required for STORAGE_DRIVER=s3) rather
// than the `aws` CLI — nothing extra to install on the server.
//
// Runnable any time as its own command ("./alumni-backup-sync" on the server, or
// "go run ./cmd/backup-sync" locally), and also invoked automatically at the end of every
// nightly run by deploy/backup.sh.
package main

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"os"
	"os/exec"
	"path/filepath"

	"alumni-portal/internal/config"
	"alumni-portal/internal/storage"
)

func main() {
	// config.Load() reads .env from the current working directory — chdir to wherever this
	// binary actually lives first, so "run this any time" works regardless of the caller's own
	// CWD (deploy.sh always places .env alongside the binaries in the same directory). Capture
	// the original CWD first so any *relative* DB_PATH/STORAGE_LOCAL_PATH in .env (common in
	// dev; production .env always uses absolute paths) still resolves against where the caller
	// actually ran this from, not the binary's own directory.
	origWD, _ := os.Getwd()
	if exe, err := os.Executable(); err == nil {
		_ = os.Chdir(filepath.Dir(exe))
	}

	cfg := config.Load()
	cfg.DBPath = resolvePath(origWD, cfg.DBPath)
	cfg.LocalPath = resolvePath(origWD, cfg.LocalPath)
	if cfg.S3BackupBucket == "" {
		log.Println("backup-sync: S3_BACKUP_BUCKET not set — skipping (local backup only)")
		return
	}

	// storage.NewS3 validates/builds the client from cfg.S3Bucket — point that at the backup
	// bucket specifically, since it may differ from the live-storage bucket (or there may be no
	// live S3 storage at all, e.g. STORAGE_DRIVER=local).
	backupCfg := cfg
	backupCfg.S3Bucket = cfg.S3BackupBucket
	driver, err := storage.NewS3(backupCfg)
	if err != nil {
		log.Printf("backup-sync: failed to init S3 client, skipping: %v", err)
		os.Exit(1)
	}

	ctx := context.Background()
	ok := true

	if err := syncDatabase(ctx, driver, cfg.DBPath); err != nil {
		log.Printf("backup-sync: FAILED syncing database to S3: %v", err)
		ok = false
	} else {
		log.Printf("backup-sync: synced %s -> s3://%s/db/", cfg.DBPath, cfg.S3BackupBucket)
	}

	// Only the uploads directory needs syncing when files live on local disk — with
	// STORAGE_DRIVER=s3, the live storage bucket is already the durable copy.
	if cfg.StorageDriver == "local" {
		if info, statErr := os.Stat(cfg.LocalPath); statErr == nil && info.IsDir() {
			if err := uploadDir(ctx, driver, cfg.LocalPath, "uploads"); err != nil {
				log.Printf("backup-sync: FAILED syncing uploads to S3: %v", err)
				ok = false
			} else {
				log.Printf("backup-sync: synced %s -> s3://%s/uploads/", cfg.LocalPath, cfg.S3BackupBucket)
			}
		}
	}

	if !ok {
		os.Exit(1)
	}
	log.Println("backup-sync: done")
}

// resolvePath joins a relative path against base (the CWD this process actually started in),
// leaving an already-absolute path untouched.
func resolvePath(base, path string) string {
	if path == "" || filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(base, path)
}

// syncDatabase takes a consistent snapshot of dbPath via sqlite3's own ".backup" command (safe
// against a live WAL-mode database) into a temp file, uploads that, then removes the temp file
// regardless of outcome.
func syncDatabase(ctx context.Context, driver storage.Driver, dbPath string) error {
	tmp, err := os.CreateTemp("", "backup-sync-*.db")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmp.Name()
	tmp.Close()
	defer os.Remove(tmpPath)

	cmd := exec.Command("sqlite3", dbPath, fmt.Sprintf(".backup '%s'", tmpPath))
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("sqlite3 backup failed: %w (%s)", err, string(out))
	}

	f, err := os.Open(tmpPath)
	if err != nil {
		return fmt.Errorf("open snapshot: %w", err)
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return fmt.Errorf("stat snapshot: %w", err)
	}

	key := "db/" + filepath.Base(dbPath)
	if err := driver.Put(ctx, key, f, "application/octet-stream", info.Size()); err != nil {
		return fmt.Errorf("upload snapshot: %w", err)
	}
	return nil
}

// uploadDir mirrors every regular file under localDir to keyPrefix/<relative path> in the
// backup bucket. This re-uploads every file on every run rather than diffing against what's
// already in S3 (no ETag/mtime comparison) — simpler and dependency-free, and at this app's
// scale (an uploads folder of profile photos etc.) the extra transfer is negligible for a
// nightly job.
func uploadDir(ctx context.Context, driver storage.Driver, localDir, keyPrefix string) error {
	return filepath.WalkDir(localDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(localDir, path)
		if err != nil {
			return err
		}
		key := keyPrefix + "/" + filepath.ToSlash(rel)

		f, err := os.Open(path)
		if err != nil {
			return fmt.Errorf("open %s: %w", path, err)
		}
		defer f.Close()

		info, err := f.Stat()
		if err != nil {
			return fmt.Errorf("stat %s: %w", path, err)
		}

		contentType := mime.TypeByExtension(filepath.Ext(path))
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		if err := driver.Put(ctx, key, f, contentType, info.Size()); err != nil {
			return fmt.Errorf("upload %s: %w", path, err)
		}
		return nil
	})
}
