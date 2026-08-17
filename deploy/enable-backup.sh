#!/usr/bin/env bash
# Turns on the nightly backup for THIS instance (local SQLite snapshot always, plus S3 sync via
# alumni-backup-sync if S3_BACKUP_BUCKET is set in .env). NOT enabled by setup-server.sh — the
# template units are installed but inactive for this instance until you run this, so nightly
# backups are opt-in per instance, not something that starts running the moment you deploy.
#
# Run from this instance's own directory: cd /opt/alumni-portal-<instance> && sudo ./enable-backup.sh
# To turn it back off:                    sudo ./disable-backup.sh
set -euo pipefail

INSTANCE="$(basename "$(cd "$(dirname "$0")" && pwd)" | sed 's/^alumni-portal-//')"
TIMER="alumni-portal-backup@$INSTANCE.timer"

systemctl enable --now "$TIMER"

echo "==> Nightly backup enabled for instance '$INSTANCE' (fires daily at 02:30)."
systemctl list-timers "$TIMER" --no-pager
