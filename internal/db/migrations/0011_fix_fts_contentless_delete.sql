-- Fixes a real bug: SQLite refuses plain `DELETE FROM ... WHERE rowid = ?` on contentless FTS5
-- tables (content=''), which is exactly what every syncXxxFTS() helper in
-- internal/handlers/search_fts.go and alumni_handler.go does on every edit. The delete silently
-- errors (Go code ignores the error), so only the very first INSERT per rowid ever lands —
-- any subsequent profile/job/notice/event edit leaves stale search content behind forever.
-- Fix: drop content='' so these become normal, self-contained FTS5 tables that support
-- DELETE/UPDATE/INSERT by rowid the ordinary way. No application code changes needed — the
-- existing DELETE-then-INSERT pattern in search_fts.go just starts working correctly.

DROP TABLE alumni_fts;
CREATE VIRTUAL TABLE alumni_fts USING fts5(
    full_name, bio, current_location, current_designation, company_names, skill_names,
    tokenize='porter unicode61'
);
INSERT INTO alumni_fts (rowid, full_name, bio, current_location, current_designation, company_names, skill_names)
SELECT
    u.id,
    u.full_name,
    ap.bio,
    ap.current_location,
    ap.current_designation,
    COALESCE((SELECT GROUP_CONCAT(DISTINCT c.name) FROM employment_history eh
        JOIN companies c ON c.id = eh.company_id WHERE eh.alumni_profile_id = ap.id), ''),
    COALESCE((SELECT GROUP_CONCAT(DISTINCT s.name) FROM alumni_skills ask
        JOIN skills s ON s.id = ask.skill_id WHERE ask.alumni_profile_id = ap.id), '')
FROM alumni_profiles ap JOIN users u ON u.id = ap.user_id;

DROP TABLE job_posts_fts;
CREATE VIRTUAL TABLE job_posts_fts USING fts5(
    title, company_name, location, description,
    tokenize='porter unicode61'
);
INSERT INTO job_posts_fts(rowid, title, company_name, location, description)
SELECT id, title, company_name, location, description FROM job_posts;

DROP TABLE notices_fts;
CREATE VIRTUAL TABLE notices_fts USING fts5(
    title,
    tokenize='porter unicode61'
);
INSERT INTO notices_fts(rowid, title)
SELECT id, title FROM notices;

DROP TABLE events_fts;
CREATE VIRTUAL TABLE events_fts USING fts5(
    title, description, venue,
    tokenize='porter unicode61'
);
INSERT INTO events_fts(rowid, title, description, venue)
SELECT id, title, description, venue FROM events;

DROP TABLE students_fts;
CREATE VIRTUAL TABLE students_fts USING fts5(
    full_name,
    tokenize='porter unicode61'
);
INSERT INTO students_fts(rowid, full_name)
SELECT sp.user_id, u.full_name FROM student_profiles sp JOIN users u ON u.id = sp.user_id;
