# Alumni Portal

Lightweight alumni association portal: Go backend (SQLite + FTS5), React/Vite CSR frontend,
single-binary deployment.

## Local development

Backend:

```
cp .env.example .env
go run ./cmd/server
```

Frontend (separate terminal, proxies `/api`, `/share`, `/files` to `:8080`):

```
cd web
npm install
npm run dev
```

First run auto-seeds one institution and, if `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` are set,
the initial SuperAdmin account — the only way into the admin UI, since there's no public
"become admin" endpoint. Log in with those credentials, then create departments/programs/
batches (or use `alumni-import` to bulk-load them, see below) so signups have somewhere to go.

Without `SMTP_HOST` set, outgoing emails (OTP codes, approvals, notices) are logged to stdout
instead of sent — check the server log for the verification code during local signup testing.

## Bulk importing existing alumni/students

```
go run ./cmd/import -file alumni.csv
```

CSV columns (header required): `fullName,email,phone,accountType,department,program,batchStartYear,batchEndYear,batchLabel,graduationYear`.
`accountType` is `alumni` or `student`. Missing departments/programs/batches are created
automatically. Imported accounts get a random password — instruct users to use "forgot
password" on first login.

## Build & deploy (local build, scp ship, nginx serve)

No CI, no on-server build. Everything is built on your machine and shipped as a binary.

```
./build.sh                              # builds web/dist + dist/alumni-portal (linux/amd64)
SERVER_HOST=user@your-vps ./deploy/deploy.sh
```

One-time server setup (run once on a fresh VPS):

```
scp deploy/*.sh deploy/*.service deploy/*.timer deploy/nginx.conf user@your-vps:/tmp/
ssh user@your-vps 'sudo mkdir -p /opt/alumni-portal && sudo mv /tmp/*.sh /tmp/*.service /tmp/*.timer /opt/alumni-portal/ && sudo bash /opt/alumni-portal/setup-server.sh'
```

Then edit `/opt/alumni-portal/.env` on the server (secrets, SMTP, SuperAdmin credentials),
install `deploy/nginx.conf` (see comments in that file for certbot TLS setup), and:

```
ssh user@your-vps 'sudo systemctl start alumni-portal'
```

Every subsequent deploy is just `./build.sh && SERVER_HOST=... ./deploy/deploy.sh` — binary
swap + `systemctl restart`, nothing else touches the server. Roll back with
`./deploy/rollback.sh`.

## Backups

`deploy/backup.sh` runs `sqlite3 .backup` (safe against a live WAL database) nightly via the
included systemd timer, retaining 14 days in `/var/backups/alumni-portal`. Install it during
server setup:

```
ssh user@your-vps 'sudo cp /opt/alumni-portal/alumni-portal-backup.* /etc/systemd/system/ && sudo systemctl enable --now alumni-portal-backup.timer'
```

If `STORAGE_DRIVER=local`, also back up `/var/lib/alumni-portal/uploads` (e.g. periodic
`rsync` offsite) — if `STORAGE_DRIVER=s3`, the bucket is already durable and needs no separate
backup here.

**Restore**: stop the service, copy a backup file over `/var/lib/alumni-portal/data.db`
(remove any `-wal`/`-shm` sidecar files first), restart.

**Moving to a new server**: copy `/var/lib/alumni-portal/` (or just `data.db` + `uploads/` if
using S3) and `/opt/alumni-portal/.env` to the new host, run `setup-server.sh` there, deploy
the binary, done.

## Storage: switching local → S3

Attachments are referenced in the DB only by their `storage_key` — never a full URL — so every
existing job image/event cover/avatar/logo/gallery image keeps working automatically once the
files are physically moved and `STORAGE_DRIVER` is flipped. No DB migration needed either way.

1. Add `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` (and `S3_ENDPOINT` for non-AWS
   S3-compatible providers, e.g. DigitalOcean Spaces or MinIO) to `.env` — keep
   `STORAGE_DRIVER=local` for now.
2. Run the migration command (built by `build.sh`, uses the same `.env` as the server, no
   separate credentials):
   ```
   ./dist/alumni-migrate-storage -dry-run   # preview what would move
   ./dist/alumni-migrate-storage            # actually upload
   ```
   It's idempotent/resumable — safe to re-run if interrupted, already-uploaded files are
   skipped. On success it prints the exact next steps.
3. Set `STORAGE_DRIVER=s3` in `.env` and restart (`systemctl restart alumni-portal` — binary
   swap, no rebuild).
4. Spot-check a few known image URLs load, then it's safe to delete `STORAGE_LOCAL_PATH`.

**Serving performance**: local mode sets `Cache-Control: public, max-age=31536000, immutable`
on `/files/*` (safe — storage keys are opaque UUIDs minted once, content never changes for a
given key). In S3 mode, `Driver.URL()` returns a direct bucket URL, so the browser fetches
straight from S3/your CDN instead of proxying through the Go process at all — for production
traffic, pairing the bucket with a CDN (CloudFront, Cloudflare, or the provider's built-in CDN
for Spaces/R2) is the recommended next step, though that's an infra choice outside this repo.
