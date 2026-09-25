-- Life membership: one row per life member; no row = not a life member. Kept as its own table
-- (not a users column) so existing SELECT * FROM users scans into models.User are untouched and
-- rolling back to an older binary stays safe — the old code simply never reads this table.
CREATE TABLE IF NOT EXISTS life_members (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    member_no TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
