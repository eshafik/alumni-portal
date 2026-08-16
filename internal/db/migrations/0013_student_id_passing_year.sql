-- student_id (roll number) + passing_year become first-class user fields, captured at signup
-- (student_id required for students/optional for alumni, passing_year required for alumni/
-- hidden for students) and by the legacy CSV import. Kept on `users` directly (matching the
-- existing pattern of user-level fields like current_designation/current_company_name) rather
-- than only on the profile tables, since both alumni and student accounts need them.
ALTER TABLE users ADD COLUMN student_id TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN passing_year INTEGER;

-- Batch start_year/end_year become optional: the legacy CSV import only gives us an ordinal
-- batch number (1st..15th Batch), not real years. sort_order is the new explicit ordering
-- column the directory ORDER BY switches to, backfilled from start_year for existing rows so
-- current ordering is unaffected; NOT NULL DEFAULT 0 avoids NULL-ordering ambiguity.
-- SQLite can't drop a NOT NULL constraint in place — rebuild the table. alumni_profiles/
-- student_profiles/users(moderator_scope_batch_id) all reference batches(id); db.Migrate runs
-- every migration with foreign_keys=OFF for exactly this reason (see db.go).
CREATE TABLE batches_new (
    id INTEGER PRIMARY KEY,
    program_id INTEGER NOT NULL REFERENCES programs(id),
    start_year INTEGER,
    end_year INTEGER,
    label TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO batches_new (id, program_id, start_year, end_year, label, is_active, sort_order, created_at)
    SELECT id, program_id, start_year, end_year, label, is_active, start_year, created_at FROM batches;
DROP TABLE batches;
ALTER TABLE batches_new RENAME TO batches;
CREATE INDEX idx_batches_program ON batches(program_id);
