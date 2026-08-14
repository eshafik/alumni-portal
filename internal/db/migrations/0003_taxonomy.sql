CREATE TABLE blood_groups (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_blood_groups_institution ON blood_groups(institution_id, is_active, sort_order);

-- Standard 8 values are seeded in Go (internal/db/seed.go's SeedInstitution), not here — this
-- migration runs before the institution row exists on a fresh install, so a data INSERT tied
-- to `institutions` here would silently seed nothing.

ALTER TABLE alumni_profiles ADD COLUMN blood_group_id INTEGER REFERENCES blood_groups(id);
ALTER TABLE student_profiles ADD COLUMN blood_group_id INTEGER REFERENCES blood_groups(id);
ALTER TABLE alumni_profiles DROP COLUMN blood_group;
ALTER TABLE student_profiles DROP COLUMN blood_group;
