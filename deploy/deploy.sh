#!/usr/bin/env bash
# Ships the locally built binary to the server and restarts the service. Run ./build.sh first.
# Usage: SERVER_HOST=user@1.2.3.4 ./deploy/deploy.sh
set -euo pipefail

: "${SERVER_HOST:?Set SERVER_HOST=user@host}"
REMOTE_DIR="${REMOTE_DIR:-/opt/alumni-portal}"

cd "$(dirname "$0")/.."

if [ ! -f dist/alumni-portal ]; then
  echo "dist/alumni-portal not found — run ./build.sh first" >&2
  exit 1
fi

echo "==> Backing up current binary on server"
ssh "$SERVER_HOST" "[ -f $REMOTE_DIR/alumni-portal ] && sudo cp $REMOTE_DIR/alumni-portal $REMOTE_DIR/alumni-portal.prev || true"

echo "==> Uploading new binaries"
scp dist/alumni-portal "$SERVER_HOST:$REMOTE_DIR/alumni-portal.new"
scp dist/alumni-import "$SERVER_HOST:$REMOTE_DIR/alumni-import.new"
scp dist/alumni-migrate-storage "$SERVER_HOST:$REMOTE_DIR/alumni-migrate-storage.new"

echo "==> Swapping in and restarting"
ssh "$SERVER_HOST" "sudo mv $REMOTE_DIR/alumni-portal.new $REMOTE_DIR/alumni-portal && \
  sudo mv $REMOTE_DIR/alumni-import.new $REMOTE_DIR/alumni-import && \
  sudo mv $REMOTE_DIR/alumni-migrate-storage.new $REMOTE_DIR/alumni-migrate-storage && \
  sudo chmod +x $REMOTE_DIR/alumni-portal $REMOTE_DIR/alumni-import $REMOTE_DIR/alumni-migrate-storage && \
  sudo systemctl restart alumni-portal && \
  sleep 1 && sudo systemctl status alumni-portal --no-pager -l | head -15"

echo "==> Deploy complete"
