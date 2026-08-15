-- Full parity with alumni_profiles for Admin/SuperAdmin/Moderator: organization, LinkedIn,
-- WhatsApp, website, and their privacy toggles — every field alumni can edit, these roles can
-- edit too (only email stays read-only for everyone). Students remain unaffected/unchanged.
ALTER TABLE users ADD COLUMN current_company_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN linkedin_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN whatsapp_number TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN website_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN privacy_whatsapp INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN privacy_company INTEGER NOT NULL DEFAULT 1;
