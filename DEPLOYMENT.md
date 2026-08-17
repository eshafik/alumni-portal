# Deployment Guide

Everything here assumes a plain Linux VPS with `systemd` (Ubuntu/Debian assumed in examples).
No Docker, no CI, no build step on the server — you build a binary on your own machine and ship
it over. The frontend is embedded inside that one binary (`go:embed`), so "deploy" really just
means "copy one file, plus a couple of small CLI tools, and restart a service."

The deploy scripts support running **multiple separate institutions on one server**, each as its
own **instance** — its own directory, own Linux user, own port, own systemd service, own nginx
server block. Everywhere below, replace `aated` with whatever short name you pick for that
institution (lowercase letters/numbers/hyphens only — it becomes part of usernames and paths).

Nothing here covers bulk CSV import — see the README's "Bulk importing real alumni/student
records" section for that, it's unrelated to deployment.

## Prerequisites

**On your local machine** (where you build): Go 1.25+, Node 20+.

**On the server**: `systemd`, `nginx`, `certbot` (for TLS), and `sqlite3` (the CLI — used by the
backup scripts; **not** the same thing as this app's pure-Go SQLite driver, which needs nothing
installed). Nothing else — no Go, no Node, no database server.

## 1. One-time server bootstrap (per instance)

From your local machine, copy the deploy scripts and systemd unit files to the server:

```bash
scp deploy/*.service deploy/*.timer deploy/*.sh you@your-server:/tmp/deploy/
ssh you@your-server
```

On the server:

```bash
cd /tmp/deploy
sudo ./setup-server.sh aated
```

This creates, for the `aated` instance:
- System user `alumni-portal-aated` (no login shell, no home directory — service account only).
- `/opt/alumni-portal-aated/` — binaries + `.env` live here.
- `/var/lib/alumni-portal-aated/` — the SQLite database and `uploads/` (uploaded avatars/logos/etc.).
- `/var/backups/alumni-portal-aated/` — local nightly backup snapshots (once you enable them, see below).
- The shared systemd **template** units (`alumni-portal@.service`, `alumni-portal-backup@.service`/`.timer`) installed at `/etc/systemd/system/` — installing these again for a second/third instance later is a harmless no-op, they're identical every time.
- `alumni-portal@aated` marked `enabled` (starts on boot) — but it isn't running yet, since there's no binary there yet.

Now edit the generated `.env`:

```bash
sudo nano /opt/alumni-portal-aated/.env
```

At minimum, set: `PORT` (any free port on this server — see the "Port & nginx" section below),
`PUBLIC_BASE_URL`, `SESSION_SECRET` (a long random value), `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`,
and the `SMTP_*` block (leave `SMTP_HOST` empty for now if you don't have SMTP creds yet — outgoing
email just gets logged instead of sent, nothing else breaks).

## 2. Build locally

```bash
./build.sh
```

Builds the frontend (`npm ci && npm run build` inside `web/`) and four Linux binaries into
`./dist/`:

```
dist/alumni-portal            # the server (frontend is embedded inside this one binary)
dist/alumni-import            # CSV bulk-import CLI (not covered here)
dist/alumni-migrate-storage   # local-disk -> S3 migration CLI
dist/alumni-backup-sync       # S3 backup sync CLI (see Backups section)
```

`dist/` as a whole is what gets shipped — you never copy `web/dist` or any other folder
separately, and you never build anything on the server itself.

## 3. Deploy

```bash
SERVER_HOST=you@your-server ./deploy/deploy.sh aated
```

This copies all four binaries into `/opt/alumni-portal-aated/` (keeping the previous
`alumni-portal` binary as `alumni-portal.prev` for `rollback.sh`), then runs
`sudo systemctl restart alumni-portal@aated` on the server — **this is what actually starts it**
the first time (a `restart` on a service that was `enabled` but never started just starts it
fresh).

Confirm it's up:

```bash
ssh you@your-server "sudo systemctl status alumni-portal@aated --no-pager"
ssh you@your-server "curl -s localhost:8081/api/health"   # use your actual PORT
```

Every future code update is just: `./build.sh && SERVER_HOST=... ./deploy/deploy.sh aated` again.

**Gotcha**: if you hand-edit `.env` on the server *after* it's already running (e.g. change the
port), systemd won't notice by itself — env vars are only read at process start. Run
`sudo systemctl restart alumni-portal@aated` yourself in that case; every normal `deploy.sh` run
already does this for you.

## 4. Port & nginx

`PORT` in `.env` is read directly by the app (`internal/config`) — nothing else needs editing for
a new port. Go's `":8081"`-style listen address binds **all interfaces** (same as `0.0.0.0:8081`),
so once you set `PORT=8081` and redeploy, it's listening on `0.0.0.0:8081` immediately.

Since it's on `0.0.0.0`, that port is technically reachable directly from the internet, bypassing
nginx — worth closing off with a firewall rule so only localhost (where nginx's `proxy_pass`
connects from) can reach it:

```bash
sudo ufw allow from 127.0.0.1 to any port 8081
sudo ufw deny 8081
```

Set up the nginx server block:

```bash
cp deploy/nginx-instance.conf.template /etc/nginx/sites-available/alumni-portal-aated
```

This template also includes a per-IP rate limit (10 requests/second, burst 20) applied to every
reverse-proxied request — each client IP gets its own independent bucket, so one abusive IP
never affects anyone else. Tune the `rate=`/`burst=` values in the template if 10r/s is too
tight/loose for your traffic.

Fill in the four placeholders in that file:
- `__DOMAIN__` — e.g. `aated.example.edu`
- `__PORT__` — the `PORT` from this instance's `.env`
- `__UPLOADS_DIR__` — this instance's `STORAGE_LOCAL_PATH`, e.g. `/var/lib/alumni-portal-aated/uploads`
- `__INSTANCE__` — the same instance name you gave `setup-server.sh` (e.g. `aated`) — only used to
  keep this instance's per-IP rate-limit zone name unique from any other instance's on the same
  server

```bash
sudo ln -s /etc/nginx/sites-available/alumni-portal-aated /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d aated.example.edu
```

**Do you need to grant nginx any permission on `/opt`?** No — nginx never touches `/opt` at all,
it only reverse-proxies to `127.0.0.1:<port>` over plain TCP (no filesystem access involved).
`/opt/alumni-portal-aated/.env` (which holds your secrets) stays private, mode `600`, owned by
the `alumni-portal-aated` user — leave it that way.

The one thing nginx *does* read directly off disk is uploaded files, via the `/files/` location
block pointing at `STORAGE_LOCAL_PATH` (only relevant when `STORAGE_DRIVER=local` — with
`STORAGE_DRIVER=s3` that directory won't exist and the block simply never matches). Directories
there are created `755` and files `644` by the app (`internal/storage/local.go`), which is
already world-readable, so nginx (running as `www-data`) can read them with zero extra setup in
the common case. To double check on your actual server:

```bash
sudo -u www-data test -r /var/lib/alumni-portal-aated/uploads && echo "nginx can read it" || echo "needs a chmod"
```

If that ever prints "needs a chmod" (e.g. a stricter umask on this box), fix it with:

```bash
sudo chmod o+rx /var/lib/alumni-portal-aated /var/lib/alumni-portal-aated/uploads
```

**If you change `STORAGE_LOCAL_PATH` later**: nginx doesn't read `.env` — its `/files/` `alias`
is a literal path baked into the config file you already filled in. Update that line too and
`sudo nginx -t && sudo systemctl reload nginx`, or nginx keeps serving from the old (now stale)
directory while the app writes new uploads somewhere else.

## 5. Managing the running service

```bash
sudo systemctl status alumni-portal@aated --no-pager    # is it up?
sudo systemctl restart alumni-portal@aated               # restart (e.g. after editing .env)
sudo systemctl stop alumni-portal@aated                  # stop
sudo journalctl -u alumni-portal@aated -f                # tail live logs
sudo journalctl -u alumni-portal@aated -n 200 --no-pager # last 200 log lines
```

`Restart=on-failure` is set in the unit file — if the process crashes, systemd restarts it
automatically; `enable` (done once by `setup-server.sh`) means it also comes back up after a
server reboot.

## 6. Rollback

```bash
SERVER_HOST=you@your-server ./deploy/rollback.sh aated
```

Swaps the current `alumni-portal` binary back for the one `deploy.sh` saved as `.prev` before its
last update, and restarts the service. Only one level of rollback is kept — there's no history
beyond the immediately previous binary.

## 7. Backups

Local backup (`sqlite3 .backup` — safe to run against a live WAL-mode database) is installed by
`setup-server.sh` but runs on its own schedule only if you enable the timer. **Not automatic.**

### Enable / disable the nightly backup

```bash
ssh you@your-server "cd /opt/alumni-portal-aated && sudo ./enable-backup.sh"
```
```bash
ssh you@your-server "cd /opt/alumni-portal-aated && sudo ./disable-backup.sh"
```

`enable-backup.sh` turns on `alumni-portal-backup@aated.timer`, which fires `backup.sh` daily at
02:30. It figures out which instance it belongs to from its own directory name, so you always run
it from inside that instance's folder, no arguments needed. Disabling only stops *future* runs —
existing local/S3 backups are untouched.

### Run a backup manually, any time

```bash
ssh you@your-server "cd /opt/alumni-portal-aated && sudo ./backup.sh"
```

Works identically whether the nightly timer is enabled or not — writes
`/var/backups/alumni-portal-aated/data-<YYYY-MM-DD>.db`, prunes anything older than 14 days, then
(see below) also attempts an S3 sync if configured.

### Offsite S3 sync (optional, on top of the local backup)

Set `S3_BACKUP_BUCKET` in `.env` (reusing the same `S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_REGION`/
`S3_ENDPOINT` already used for `STORAGE_DRIVER=s3`, if any — can be a dedicated bucket or the same
one). Leave it empty/unset to skip S3 entirely and keep local-disk backups only.

`backup.sh` calls `alumni-backup-sync` automatically at the end of every run — but you can also
run the sync **on its own, any time, independent of the nightly job or its enabled/disabled
state**:

```bash
ssh you@your-server "cd /opt/alumni-portal-aated && sudo ./alumni-backup-sync"
```

What it does: takes a fresh, consistent `sqlite3 .backup` snapshot of `DB_PATH` (a temp file, not
a raw copy of the live database) and uploads it to `s3://$S3_BACKUP_BUCKET/db/`, then — if
`STORAGE_DRIVER=local` — uploads the whole `STORAGE_LOCAL_PATH` directory to
`s3://$S3_BACKUP_BUCKET/uploads/`. No `aws` CLI needed (uses this app's own `aws-sdk-go-v2`
dependency). If `S3_BACKUP_BUCKET` is unset it just logs "skipping" and exits `0`; if the upload
fails for any reason (bad credentials, network, wrong bucket name) it logs the error and exits
non-zero — either way, your local backup file is never touched or deleted because of an S3
failure.

### Restore from a backup

```bash
sudo systemctl stop alumni-portal@aated
sudo rm -f /var/lib/alumni-portal-aated/data.db-wal /var/lib/alumni-portal-aated/data.db-shm
sudo cp /var/backups/alumni-portal-aated/data-2026-01-15.db /var/lib/alumni-portal-aated/data.db
sudo chown alumni-portal-aated:alumni-portal-aated /var/lib/alumni-portal-aated/data.db
sudo systemctl start alumni-portal@aated
```

(If restoring from an S3-synced snapshot instead, download it from `s3://$S3_BACKUP_BUCKET/db/`
first, then follow the same steps.)

## 8. Adding another institution / moving an instance to a new server

**New institution on the same server**: just repeat steps 1–4 with a different instance name,
port, and domain — `setup-server.sh` re-installing the shared template units is a no-op, so
nothing about the existing instance(s) is disturbed.

**Moving one instance to a different server**: copy `/var/lib/alumni-portal-aated/` (or just
`data.db` + `uploads/` if you're on S3 storage) and `/opt/alumni-portal-aated/.env` to the new
host, run `setup-server.sh aated` there, deploy the binaries, done.

## 9. Switching file storage from local disk to S3

Attachments are referenced in the database only by their storage key, never a full URL, so every
existing image keeps working once files are moved and `STORAGE_DRIVER` is flipped — no database
migration needed.

1. Add `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` (and `S3_ENDPOINT` for non-AWS
   providers) to `.env`, keeping `STORAGE_DRIVER=local` for now.
2. Run the migration tool from the instance's directory (idempotent — safe to re-run if
   interrupted):
   ```bash
   cd /opt/alumni-portal-aated
   ./alumni-migrate-storage -dry-run   # preview
   ./alumni-migrate-storage            # actually upload
   ```
3. Set `STORAGE_DRIVER=s3` in `.env` and `sudo systemctl restart alumni-portal@aated`.
4. Spot-check a few image URLs load, then it's safe to delete the old local upload directory —
   and remember to update/remove the `/files/` block in this instance's nginx config, since that
   directory won't exist anymore.
