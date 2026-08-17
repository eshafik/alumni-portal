#!/usr/bin/env bash
# Turns off the nightly backup timer for THIS instance, enabled by enable-backup.sh. Existing
# local backups (and anything already synced to S3) are left untouched — this only stops future
# runs. Run from this instance's own directory: cd /opt/alumni-portal-<instance> && sudo ./disable-backup.sh
set -euo pipefail

INSTANCE="$(basename "$(cd "$(dirname "$0")" && pwd)" | sed 's/^alumni-portal-//')"
TIMER="alumni-portal-backup@$INSTANCE.timer"

systemctl disable --now "$TIMER"
echo "==> Nightly backup disabled for instance '$INSTANCE'."
