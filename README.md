# Alumni Portal

A self-hostable alumni association portal: member directory, job board, events with
registration, notices, an alumni business directory, and a committee/leadership page —
all served from a single Go binary with an embedded React frontend and a SQLite database.

No external services required to run it. No Docker, no Kubernetes, no managed database — copy
the binary to a VPS, point it at a `.env` file, and it's live.

## Features

- **Member directory** — searchable, filterable (department, batch, blood group) alumni and
  student directories with per-field privacy controls (a member chooses what's visible to
  others: email, phone, WhatsApp, location, current company).
- **Role-based access** — SuperAdmin, Admin, Moderator, Alumni, Student, each with a distinct
  set of permissions. New signups go through OTP email verification and moderator/admin
  approval before they can log in.
- **Job board** — alumni can post openings with an optional cover image; posts are searchable
  and show the poster's name and avatar.
- **Events** — cover image, public/private visibility, full-text search, capacity + waitlist,
  CSV export of registrants, and either in-app RSVP or a link to an external registration form
  (e.g. Google Forms). A dedicated crawler-friendly share endpoint gives every event proper
  Open Graph/Twitter Card previews when pasted into WhatsApp, Slack, LinkedIn, etc.
- **Notices** — public notices are visible to anyone with the link; private notices are visible
  only to approved, logged-in members. Pinning and importance levels (normal/important/urgent)
  trigger in-app and email notifications.
- **Alumni Business Directory** — members can list a business with a logo, category, and
  contact details.
- **Committee / leadership page** — current committee plus full historical terms. Assigning
  someone to a designated leadership position (President, Secretary, Organizing Secretary)
  automatically grants them Admin access.
- **Admin console** — institution branding (logo, theme color, homepage hero tagline/gallery),
  taxonomy management (departments/programs/batches/blood groups), user approval queue, audit
  log, and content moderation for every section above.
- **Bulk CSV import** for onboarding an institution's existing alumni/student records without
  making everyone self-register.
- **PWA** — installable, works offline for previously-visited pages.
- **Pluggable storage** — local disk or S3-compatible object storage (AWS S3, DigitalOcean
  Spaces, MinIO, Cloudflare R2), switchable with one config value and a provided migration tool.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Go 1.25, [chi](https://github.com/go-chi/chi) router, [sqlx](https://github.com/jmoiron/sqlx) |
| Database | SQLite via [modernc.org/sqlite](https://gitlab.com/cznic/sqlite) (pure Go, no cgo) with FTS5 full-text search, WAL mode |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router |
| Auth | Session cookies, bcrypt password hashing, OTP email verification |
| Storage | Local filesystem or S3 (`aws-sdk-go-v2`), selectable via env var |
| Deployment | `go:embed` bundles the built frontend into one binary — copy, run, done |

## Quick start

Requires Go 1.25+ and Node 20+.

```bash
git clone https://github.com/eshafik/alumni-portal.git
cd alumni-portal

# Backend
cp .env.example .env
go run ./cmd/server

# Frontend (separate terminal — proxies /api, /share, /files to :8080)
cd web
npm install
npm run dev
```

Open `http://localhost:5173`. The first run auto-creates one institution row. Set
`SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` in `.env` before first boot to also bootstrap the
initial SuperAdmin account — there's no public "become admin" endpoint, so this is the only way
in. Log in with those credentials, then add at least one department/program/batch (Admin →
Manage Dropdowns) so new signups have somewhere to attach.

Without `SMTP_HOST` set, outgoing email (OTP codes, approval notices) is logged to the server
console instead of sent — check the terminal for the verification code while testing signup
locally.

### Seeding demo data

To populate the portal with realistic demo content (alumni, students, admins, jobs, notices,
events, committee history) for local testing:

```bash
go run ./cmd/seed
```

Every seeded account shares one password, printed at the end of the run (override with
`-password`). Safe to re-run — it tops up existing data rather than duplicating it.

### Bulk importing real alumni/student records

```bash
go run ./cmd/import -file alumni.csv
```

CSV columns (header row required): `fullName,email,phone,accountType,department,program,batchStartYear,batchEndYear,batchLabel,graduationYear,bloodGroup`.
`accountType` is `alumni` or `student`. Missing departments/programs/batches/blood groups are
created automatically. Imported accounts get a random password — instruct users to use "forgot
password" on first login.

## Project structure

```
cmd/
  server/           entrypoint — wires routes, middleware, and starts the HTTP server
  seed/              demo data generator
  import/            CSV bulk-import tool
  migrate-storage/   local → S3 file migration tool
  backup-sync/       S3 backup sync tool (see DEPLOYMENT.md)
internal/
  auth/              session/password/OTP handling, RBAC middleware
  db/                connection setup + migrations (sequential .sql files, auto-applied)
  handlers/          one file per resource (alumni, events, jobs, notices, committees, ...)
  httpx/             shared request/response helpers, pagination
  models/            database row structs
  storage/           local/S3 driver abstraction
web/
  src/routes/        public/, protected/, and admin/ route components
  src/components/    shared UI primitives and layout shells
  src/api/           typed fetch wrappers per resource
  embed.go           go:embed directive that bundles web/dist into the server binary
```

## Configuration

All configuration is environment variables, loaded from `.env` automatically on startup (see
`.env.example` for the full list with comments). Key ones:

| Variable | Purpose |
|---|---|
| `DB_PATH` | SQLite file path |
| `SESSION_SECRET` | Cookie signing secret — set a real random value in production |
| `STORAGE_DRIVER` | `local` or `s3` |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | First-boot bootstrap credentials |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Outgoing email — leave `SMTP_HOST` empty to log emails instead of sending |
| `PUBLIC_BASE_URL` | Used to build absolute links in emails and social share previews |

## Deployment

No CI, no on-server build — everything is built on your machine and shipped as a binary. The
deploy scripts support running multiple institutions side by side on one server, each as its own
named instance (own directory, system user, port, and nginx server block).

**See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full step-by-step guide** — server bootstrap,
building and deploying, nginx setup, managing the running service, rollback, enabling/disabling
nightly backups, running a backup or S3 sync manually, restoring from a backup, adding another
institution, and switching storage from local disk to S3.

## Contributing

Issues and pull requests are welcome. For anything beyond a small fix, please open an issue
first to discuss the approach. Before submitting a PR:

```bash
go build ./... && go vet ./...
cd web && npx tsc -b --noEmit && npx vite build
```

## License

[MIT](LICENSE)
