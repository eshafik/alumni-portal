-- Full-text search for job posts, notices, events, and students — same contentless
-- external-content FTS5 pattern as alumni_fts (0001_init.sql), synced manually in application
-- code on every write. Backfills existing rows so search works immediately after migrating.

CREATE VIRTUAL TABLE job_posts_fts USING fts5(
    title, company_name, location, description,
    content='', tokenize='porter unicode61'
);
INSERT INTO job_posts_fts(rowid, title, company_name, location, description)
SELECT id, title, company_name, location, description FROM job_posts;

-- Notice search is title-only by product decision (body excluded on purpose).
CREATE VIRTUAL TABLE notices_fts USING fts5(
    title,
    content='', tokenize='porter unicode61'
);
INSERT INTO notices_fts(rowid, title)
SELECT id, title FROM notices;

CREATE VIRTUAL TABLE events_fts USING fts5(
    title, description, venue,
    content='', tokenize='porter unicode61'
);
INSERT INTO events_fts(rowid, title, description, venue)
SELECT id, title, description, venue FROM events;

-- Keyed by user_id, matching alumni_fts's convention.
CREATE VIRTUAL TABLE students_fts USING fts5(
    full_name,
    content='', tokenize='porter unicode61'
);
INSERT INTO students_fts(rowid, full_name)
SELECT sp.user_id, u.full_name FROM student_profiles sp JOIN users u ON u.id = sp.user_id;
