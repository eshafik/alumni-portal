#!/usr/bin/env bash
# Nightly SQLite backup — safe to run against a live WAL database. Installed via the
# alumni-portal-backup.timer/service pair below. Keeps 14 days locally; if STORAGE_DRIVER=s3
# the uploads dir doesn't need backing up here (S3 is already durable) — if local storage is
# in use, rsync /var/lib/alumni-portal/uploads to your own offsite target separately.
set -euo pipefail

DB_PATH="${DB_PATH:-/var/lib/alumni-portal/data.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/alumni-portal}"
RETAIN_DAYS=14

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F)
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/data-$STAMP.db'"

find "$BACKUP_DIR" -name 'data-*.db' -mtime +$RETAIN_DAYS -delete

echo "Backup written: $BACKUP_DIR/data-$STAMP.db"
