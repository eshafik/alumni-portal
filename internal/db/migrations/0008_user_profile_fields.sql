-- Admin/SuperAdmin/Moderator accounts have no alumni_profiles/student_profiles row, so they had
-- nowhere to store a photo, bio, location, or blood group. Give every user account these fields
-- directly so the profile page works uniformly regardless of role.
ALTER TABLE users ADD COLUMN avatar_attachment_id INTEGER REFERENCES attachments(id);
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN current_location TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN blood_group_id INTEGER REFERENCES blood_groups(id);
