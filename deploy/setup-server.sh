#!/usr/bin/env bash
# One-time bootstrap for a SINGLE instance of Alumni Portal on a shared server. Run this once
# per institution you host (each gets its own directory, dedicated system user, and port — so
# many instances can run side by side on one VPS behind nginx, one server block per domain).
#
# Usage: sudo ./setup-server.sh <instance-name>
#   e.g. sudo ./setup-server.sh aated      -> /opt/alumni-portal-aated, user alumni-portal-aated
#
# Installs the shared systemd *template* units (alumni-portal@.service, the backup
# service/timer pair) once — reused by every instance via "@<instance-name>" — then creates
# this specific instance's user/directories/.env and enables its service. Does NOT install
# nginx/certbot, build any code, or start the nightly backup (see enable-backup.sh) — those stay
# manual/opt-in.
set -euo pipefail

INSTANCE="${1:?Usage: sudo ./setup-server.sh <instance-name>  (e.g. aated)}"
if ! [[ "$INSTANCE" =~ ^[a-z0-9-]+$ ]]; then
  echo "Instance name must be lowercase letters/numbers/hyphens only (used in usernames/paths)." >&2
  exit 1
fi

APP_DIR="/opt/alumni-portal-$INSTANCE"
DATA_DIR="/var/lib/alumni-portal-$INSTANCE"
BACKUP_DIR="/var/backups/alumni-portal-$INSTANCE"
SERVICE_USER="alumni-portal-$INSTANCE"

id -u "$SERVICE_USER" &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"

mkdir -p "$APP_DIR" "$DATA_DIR/uploads" "$BACKUP_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<EOF
APP_ENV=production
# Pick any free port on this server — nginx will reverse-proxy this instance's domain to it.
PORT=8080
DB_PATH=$DATA_DIR/data.db
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=$DATA_DIR/uploads
BACKUP_DIR=$BACKUP_DIR
PUBLIC_BASE_URL=https://$INSTANCE.example.edu
SESSION_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_VALUE
SUPERADMIN_EMAIL=admin@example.edu
SUPERADMIN_PASSWORD=CHANGE_ME
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@$INSTANCE.example.edu
SMTP_FROM_NAME=Alumni Portal
EOF
  chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "Wrote $APP_DIR/.env — EDIT IT (PORT, secrets, SMTP, superadmin, domain) before starting."
fi

DEPLOY_SRC="$(dirname "$0")"

# Shared template units — installing again on a second/third instance is a harmless no-op
# (identical file content each time).
cp "$DEPLOY_SRC/alumni-portal@.service" /etc/systemd/system/alumni-portal@.service
cp "$DEPLOY_SRC/alumni-portal-backup@.service" /etc/systemd/system/alumni-portal-backup@.service
cp "$DEPLOY_SRC/alumni-portal-backup@.timer" /etc/systemd/system/alumni-portal-backup@.timer

cp "$DEPLOY_SRC/backup.sh" "$APP_DIR/backup.sh"
cp "$DEPLOY_SRC/enable-backup.sh" "$APP_DIR/enable-backup.sh"
cp "$DEPLOY_SRC/disable-backup.sh" "$APP_DIR/disable-backup.sh"
chmod +x "$APP_DIR/backup.sh" "$APP_DIR/enable-backup.sh" "$APP_DIR/disable-backup.sh"
chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/backup.sh" "$APP_DIR/enable-backup.sh" "$APP_DIR/disable-backup.sh"

systemctl daemon-reload
systemctl enable "alumni-portal@$INSTANCE"

echo "==> Bootstrap complete for instance '$INSTANCE'."
echo "==> Edit $APP_DIR/.env (PORT, secrets, SMTP, superadmin, domain), then from your local machine:"
echo "      ./build.sh && ./deploy/deploy.sh $INSTANCE"
echo "==> Then point an nginx server block at 127.0.0.1:<the PORT you chose> — see deploy/nginx-instance.conf.template."
echo "==> Nightly backup is installed but NOT enabled by default:"
echo "      cd $APP_DIR && sudo ./enable-backup.sh"
