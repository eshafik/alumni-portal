-- Extends the users-table profile fields added in 0008 with a job-title field and contact
-- privacy toggles, so Admin/SuperAdmin/Moderator have the same designation/privacy controls
-- alumni already have via alumni_profiles. No WhatsApp/company privacy columns here — those
-- fields don't exist for non-alumni roles, so there's nothing to toggle.
ALTER TABLE users ADD COLUMN current_designation TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN privacy_email INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN privacy_phone INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN privacy_location INTEGER NOT NULL DEFAULT 1;
