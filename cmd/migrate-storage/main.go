// Command migrate-storage copies every attachment from local disk storage into an S3(-compatible)
// bucket, preserving each file's storage_key exactly. Because attachments are referenced in the
// DB only by storage_key — never by a persisted full URL (Driver.URL(key) computes the servable
// URL at request time) — no database changes are needed here: once files are copied and
// STORAGE_DRIVER is flipped to "s3" in .env, every existing job image/event cover/avatar/logo/
// gallery image URL resolves correctly on its own.
//
// Reads DB_PATH, STORAGE_LOCAL_PATH (source), and S3_* (destination) from the same .env the
// server uses via internal/config — no separate credentials or flags needed beyond -dry-run.
// Safe to interrupt and re-run: already-uploaded keys are skipped (checked via S3 HeadObject).
package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"os"

	"alumni-portal/internal/config"
	"alumni-portal/internal/db"
	"alumni-portal/internal/storage"
)

func main() {
	dryRun := flag.Bool("dry-run", false, "report what would be migrated without uploading anything")
	flag.Parse()

	cfg := config.Load()
	if cfg.S3Bucket == "" {
		log.Fatal("S3_BUCKET (and related S3_* vars) must be set in .env before running this command")
	}

	dbx, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	defer dbx.Close()

	local, err := storage.NewLocal(cfg)
	if err != nil {
		log.Fatalf("local storage init: %v", err)
	}
	s3, err := storage.NewS3(cfg)
	if err != nil {
		log.Fatalf("s3 storage init: %v", err)
	}

	type attachmentRow struct {
		StorageKey string `db:"storage_key"`
		MimeType   string `db:"mime_type"`
	}
	var rows []attachmentRow
	if err := dbx.Select(&rows, `SELECT DISTINCT storage_key, mime_type FROM attachments`); err != nil {
		log.Fatalf("query attachments: %v", err)
	}

	ctx := context.Background()
	migrated, skipped, failed := 0, 0, 0

	for i, row := range rows {
		exists, err := s3.Exists(ctx, row.StorageKey)
		if err != nil {
			log.Printf("[%d/%d] %s: check failed: %v", i+1, len(rows), row.StorageKey, err)
			failed++
			continue
		}
		if exists {
			skipped++
			log.Printf("[%d/%d] %s: already present, skipping", i+1, len(rows), row.StorageKey)
			continue
		}

		if *dryRun {
			log.Printf("[%d/%d] %s: would migrate (dry-run)", i+1, len(rows), row.StorageKey)
			migrated++
			continue
		}

		if err := copyOne(ctx, local, s3, row.StorageKey, row.MimeType); err != nil {
			log.Printf("[%d/%d] %s: FAILED: %v", i+1, len(rows), row.StorageKey, err)
			failed++
			continue
		}
		migrated++
		log.Printf("[%d/%d] %s: migrated", i+1, len(rows), row.StorageKey)
	}

	fmt.Printf("\nDone: %d migrated, %d skipped (already present), %d failed, %d total.\n", migrated, skipped, failed, len(rows))

	if failed > 0 {
		fmt.Println("Some files failed to migrate — already-migrated files are safe, re-run this command to retry the rest.")
		os.Exit(1)
	}
	if *dryRun {
		fmt.Println("Dry run only — re-run without -dry-run to actually upload.")
		return
	}
	fmt.Println("\nAll attachments migrated. Next steps:")
	fmt.Println("  1. Set STORAGE_DRIVER=s3 in .env")
	fmt.Println("  2. Redeploy (binary swap + restart — no rebuild needed)")
	fmt.Println("  3. Spot-check a few known image URLs load correctly")
	fmt.Println("  4. Once confirmed, it's safe to delete the local uploads/ directory")
}

// copyOne reads the local file fully into memory before uploading — fine here since uploads
// are capped at a few MB by internal/storage/validate.go, and Driver.Put needs a known size
// upfront (required for S3's Content-Length), so a single-pass streaming copy isn't possible
// without buffering somewhere regardless.
func copyOne(ctx context.Context, local, s3 storage.Driver, key, mimeType string) error {
	r, err := local.Get(ctx, key)
	if err != nil {
		return fmt.Errorf("read local file: %w", err)
	}
	defer r.Close()

	data, err := io.ReadAll(r)
	if err != nil {
		return fmt.Errorf("buffer local file: %w", err)
	}

	if err := s3.Put(ctx, key, bytes.NewReader(data), mimeType, int64(len(data))); err != nil {
		return fmt.Errorf("upload to s3: %w", err)
	}
	return nil
}
