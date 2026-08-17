#!/usr/bin/env bash
# Local build script: produces Linux binaries (server + CLI tools) with the frontend embedded,
# ready to scp to the VPS. Run this on your dev machine — nothing builds on the server.
# Usage: ./build.sh [GOOS] [GOARCH]  (defaults to linux/amd64)
set -euo pipefail

GOOS_TARGET="${1:-linux}"
GOARCH_TARGET="${2:-amd64}"

cd "$(dirname "$0")"

echo "==> Building frontend"
(cd web && npm ci && npm run build)

echo "==> Building server binary (GOOS=$GOOS_TARGET GOARCH=$GOARCH_TARGET)"
mkdir -p dist
GOOS="$GOOS_TARGET" GOARCH="$GOARCH_TARGET" go build -o dist/alumni-portal ./cmd/server

echo "==> Building import CLI"
GOOS="$GOOS_TARGET" GOARCH="$GOARCH_TARGET" go build -o dist/alumni-import ./cmd/import

echo "==> Building storage migration CLI"
GOOS="$GOOS_TARGET" GOARCH="$GOARCH_TARGET" go build -o dist/alumni-migrate-storage ./cmd/migrate-storage

echo "==> Building backup-sync CLI"
GOOS="$GOOS_TARGET" GOARCH="$GOARCH_TARGET" go build -o dist/alumni-backup-sync ./cmd/backup-sync

echo "==> Done. Artifacts in ./dist/"
ls -la dist/
