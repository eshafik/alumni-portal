-- Core identity & institution
CREATE TABLE institutions (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    institution_type TEXT NOT NULL DEFAULT 'university', -- school|college|university|institute
    description TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    logo_attachment_id INTEGER,
    favicon_attachment_id INTEGER,
    theme_color TEXT NOT NULL DEFAULT '#1e3a8a',
    social_links TEXT NOT NULL DEFAULT '{}', -- json
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE roles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE -- superadmin|admin|moderator|alumni|student
);
INSERT INTO roles (id, name) VALUES
    (1, 'superadmin'), (2, 'admin'), (3, 'moderator'), (4, 'alumni'), (5, 'student');

CREATE TABLE departments (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    name TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_departments_institution ON departments(institution_id);

CREATE TABLE programs (
    id INTEGER PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id),
    name TEXT NOT NULL,
    degree_level TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_programs_department ON programs(department_id);

CREATE TABLE batches (
    id INTEGER PRIMARY KEY,
    program_id INTEGER NOT NULL REFERENCES programs(id),
    start_year INTEGER NOT NULL,
    end_year INTEGER NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_batches_program ON batches(program_id);

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    role_id INTEGER NOT NULL REFERENCES roles(id),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending_verification',
        -- pending_verification|pending_approval|approved|rejected|suspended
    moderator_scope_department_id INTEGER REFERENCES departments(id),
    moderator_scope_batch_id INTEGER REFERENCES batches(id),
    rejection_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT,
    UNIQUE(institution_id, email),
    UNIQUE(institution_id, phone)
);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role_id);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY, -- opaque random token, hashed
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_agent TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE attachments (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    storage_key TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_by_user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE student_profiles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES programs(id),
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    roll_number TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active', -- active|converted
    blood_group TEXT NOT NULL DEFAULT '',
    current_location TEXT NOT NULL DEFAULT '',
    avatar_attachment_id INTEGER REFERENCES attachments(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_student_profiles_batch ON student_profiles(batch_id);

CREATE TABLE alumni_profiles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES programs(id),
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    graduation_year INTEGER,
    blood_group TEXT NOT NULL DEFAULT '',
    current_location TEXT NOT NULL DEFAULT '',
    current_designation TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    avatar_attachment_id INTEGER REFERENCES attachments(id),
    linkedin_url TEXT NOT NULL DEFAULT '',
    whatsapp_number TEXT NOT NULL DEFAULT '',
    website_url TEXT NOT NULL DEFAULT '',
    -- privacy flags: 1 = visible to other approved members, 0 = private
    privacy_email INTEGER NOT NULL DEFAULT 0,
    privacy_phone INTEGER NOT NULL DEFAULT 0,
    privacy_whatsapp INTEGER NOT NULL DEFAULT 0,
    privacy_location INTEGER NOT NULL DEFAULT 1,
    privacy_company INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_alumni_profiles_batch ON alumni_profiles(batch_id);
CREATE INDEX idx_alumni_profiles_program ON alumni_profiles(program_id);

CREATE TABLE companies (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    industry TEXT NOT NULL DEFAULT ''
);

CREATE TABLE employment_history (
    id INTEGER PRIMARY KEY,
    alumni_profile_id INTEGER NOT NULL REFERENCES alumni_profiles(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    title TEXT NOT NULL DEFAULT '',
    start_date TEXT,
    end_date TEXT,
    is_current INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_employment_alumni ON employment_history(alumni_profile_id);
CREATE INDEX idx_employment_company ON employment_history(company_id);

CREATE TABLE skills (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE alumni_skills (
    alumni_profile_id INTEGER NOT NULL REFERENCES alumni_profiles(id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (alumni_profile_id, skill_id)
);

-- Committees
CREATE TABLE committees (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    term_start INTEGER NOT NULL,
    term_end INTEGER NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_committees_institution ON committees(institution_id);

CREATE TABLE committee_positions (
    id INTEGER PRIMARY KEY,
    committee_id INTEGER NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_default_admin INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_committee_positions_committee ON committee_positions(committee_id);

CREATE TABLE committee_members (
    id INTEGER PRIMARY KEY,
    committee_position_id INTEGER NOT NULL REFERENCES committee_positions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    appointed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_committee_members_position ON committee_members(committee_position_id);
CREATE INDEX idx_committee_members_user ON committee_members(user_id);

-- Content
CREATE TABLE posts (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    author_user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published', -- draft|pending|published
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_posts_institution ON posts(institution_id, status, created_at);

CREATE TABLE job_posts (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    posted_by_user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    company_name TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    employment_type TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    salary TEXT NOT NULL DEFAULT '',
    apply_url TEXT NOT NULL DEFAULT '',
    apply_email TEXT NOT NULL DEFAULT '',
    image_attachment_id INTEGER REFERENCES attachments(id),
    deadline TEXT,
    status TEXT NOT NULL DEFAULT 'published', -- published|closed|expired
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_jobs_institution ON job_posts(institution_id, status, created_at);

CREATE TABLE notices (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    author_user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    importance TEXT NOT NULL DEFAULT 'normal', -- normal|important|urgent
    pinned INTEGER NOT NULL DEFAULT 0,
    published_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notices_institution ON notices(institution_id, published_at);

CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cover_attachment_id INTEGER REFERENCES attachments(id),
    start_at TEXT NOT NULL,
    end_at TEXT,
    venue TEXT NOT NULL DEFAULT '',
    online_url TEXT NOT NULL DEFAULT '',
    registration_deadline TEXT,
    capacity INTEGER,
    status TEXT NOT NULL DEFAULT 'published', -- draft|published|cancelled
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_institution ON events(institution_id, start_at);

CREATE TABLE event_registrations (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'registered', -- registered|cancelled|waitlisted
    registered_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(event_id, user_id)
);
CREATE INDEX idx_event_registrations_event ON event_registrations(event_id);

CREATE TABLE businesses (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    owner_user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    logo_attachment_id INTEGER REFERENCES attachments(id),
    social_links TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_businesses_institution ON businesses(institution_id, status);

-- Notifications
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    related_entity_type TEXT NOT NULL DEFAULT '',
    related_entity_id INTEGER,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE notification_preferences (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- job_alert|important_notice|event
    channel TEXT NOT NULL,  -- email|in_app
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, category, channel)
);

-- Auth support
CREATE TABLE otps (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL, -- verify|password_reset
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_at TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_otps_email_purpose ON otps(email, purpose);

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    actor_user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    before_json TEXT NOT NULL DEFAULT '{}',
    after_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_logs_institution ON audit_logs(institution_id, created_at);

CREATE TABLE email_outbox (
    id INTEGER PRIMARY KEY,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT
);
CREATE INDEX idx_email_outbox_status ON email_outbox(status, created_at);

-- Full-text search over alumni directory
CREATE VIRTUAL TABLE alumni_fts USING fts5(
    full_name, bio, current_location, current_designation, company_names, skill_names,
    content='',
    tokenize='porter unicode61'
);

-- Default committee seeded per-institution at creation time (in app code, not here)
