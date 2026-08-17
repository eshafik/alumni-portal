#!/usr/bin/env bash
# Nightly SQLite backup — safe to run against a live WAL database. Installed via the
# alumni-portal-backup@.timer/@.service template pair (systemctl enable/disable via
# enable-backup.sh/disable-backup.sh). Keeps 14 days locally, then — if S3_BACKUP_BUCKET is set
# in this instance's .env — hands off to alumni-backup-sync, which independently syncs DB_PATH
# and STORAGE_LOCAL_PATH (both read straight from .env, not this script's own BACKUP_DIR) to S3.
# That step is entirely optional and best-effort: no S3 bucket configured, or a sync failure,
# both just log and move on — this script's own exit status only reflects the local backup,
# which always runs regardless of what S3 does.
#
# Runnable directly any time ("cd /opt/alumni-portal-<instance> && ./backup.sh"), not just via
# the timer — sources its own .env (colocated next to this script) if DB_PATH isn't already set
# in the environment, so it works the same whether systemd's EnvironmentFile= set the vars or
# you're just running it by hand.
set -euo pipefail

if [ -z "${DB_PATH:-}" ] && [ -f "$(dirname "$0")/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$(dirname "$0")/.env"
  set +a
fi

DB_PATH="${DB_PATH:-/var/lib/alumni-portal/data.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/alumni-portal}"
RETAIN_DAYS=14

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F)
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/data-$STAMP.db'"

find "$BACKUP_DIR" -name 'data-*.db' -mtime +$RETAIN_DAYS -delete

echo "Backup written: $BACKUP_DIR/data-$STAMP.db"

SYNC_BIN="$(dirname "$0")/alumni-backup-sync"
if [ -x "$SYNC_BIN" ]; then
  "$SYNC_BIN" || echo "backup.sh: S3 sync failed or skipped — local backup above is unaffected."
fi
