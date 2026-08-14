ALTER TABLE institutions ADD COLUMN about_text TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN mission_text TEXT NOT NULL DEFAULT '';

CREATE TABLE home_gallery_images (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    attachment_id INTEGER NOT NULL REFERENCES attachments(id),
    caption TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_home_gallery_institution ON home_gallery_images(institution_id, is_active, sort_order);
