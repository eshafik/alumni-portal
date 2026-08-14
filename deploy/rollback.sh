#!/usr/bin/env bash
# Swaps back to the previous binary saved by deploy.sh and restarts.
# Usage: SERVER_HOST=user@1.2.3.4 ./deploy/rollback.sh
set -euo pipefail

: "${SERVER_HOST:?Set SERVER_HOST=user@host}"
REMOTE_DIR="${REMOTE_DIR:-/opt/alumni-portal}"

ssh "$SERVER_HOST" "sudo test -f $REMOTE_DIR/alumni-portal.prev" || {
  echo "No previous binary found on server ($REMOTE_DIR/alumni-portal.prev)" >&2
  exit 1
}

ssh "$SERVER_HOST" "sudo mv $REMOTE_DIR/alumni-portal $REMOTE_DIR/alumni-portal.rolled-back && \
  sudo mv $REMOTE_DIR/alumni-portal.prev $REMOTE_DIR/alumni-portal && \
  sudo systemctl restart alumni-portal && \
  sleep 1 && sudo systemctl status alumni-portal --no-pager -l | head -15"

echo "==> Rolled back"
