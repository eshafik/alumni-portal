ALTER TABLE notices ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notices ADD COLUMN image_attachment_id INTEGER REFERENCES attachments(id);
