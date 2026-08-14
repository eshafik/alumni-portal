#!/usr/bin/env bash
# One-time server bootstrap. Run ONCE on a fresh VPS as root (or with sudo) before the first
# deploy.sh. Creates the service user, directories, and installs the systemd unit — does NOT
# install nginx/certbot or build any code (that stays on your local machine).
set -euo pipefail

APP_DIR=/opt/alumni-portal
DATA_DIR=/var/lib/alumni-portal

id -u alumni-portal &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin alumni-portal

mkdir -p "$APP_DIR" "$DATA_DIR/uploads" /var/backups/alumni-portal
chown -R alumni-portal:alumni-portal "$APP_DIR" "$DATA_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<'EOF'
APP_ENV=production
PORT=8080
DB_PATH=/var/lib/alumni-portal/data.db
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=/var/lib/alumni-portal/uploads
PUBLIC_BASE_URL=https://alumni.example.edu
SESSION_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_VALUE
SUPERADMIN_EMAIL=admin@example.edu
SUPERADMIN_PASSWORD=CHANGE_ME
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@alumni.example.edu
SMTP_FROM_NAME=Alumni Portal
EOF
  chown alumni-portal:alumni-portal "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "Wrote $APP_DIR/.env — EDIT IT before starting the service (secrets, SMTP, superadmin)."
fi

cp "$(dirname "$0")/alumni-portal.service" /etc/systemd/system/alumni-portal.service
systemctl daemon-reload
systemctl enable alumni-portal

echo "==> Server bootstrap complete."
echo "==> Edit $APP_DIR/.env, then run deploy.sh from your local machine, then:"
echo "      systemctl start alumni-portal"
