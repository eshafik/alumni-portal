-- Admin bulk outreach (email/SMS broadcasts to alumni/students). Kept as its own pair of
-- tables rather than reusing email_outbox — outreach needs campaign grouping, an SMS channel,
-- and per-recipient provider status codes that email_outbox has no room for. No institution_id
-- column, matching email_outbox's existing single-institution-per-deployment precedent.
CREATE TABLE outreach_campaigns (
    id INTEGER PRIMARY KEY,
    channel TEXT NOT NULL,              -- 'email' | 'sms'
    subject TEXT NOT NULL DEFAULT '',   -- email only
    message TEXT NOT NULL,              -- HTML body (email) or plain text (sms)
    target_alumni INTEGER NOT NULL DEFAULT 0,
    target_students INTEGER NOT NULL DEFAULT 0,
    filters_json TEXT NOT NULL DEFAULT '{}',
    sms_segments INTEGER NOT NULL DEFAULT 1,
    recipient_count INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'BDT',
    status TEXT NOT NULL DEFAULT 'queued', -- queued|processing|completed|completed_with_errors
    success_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    created_by_user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

-- Recipient rows snapshot name/email/phone at creation time rather than joining live — the log
-- stays accurate even if the user later edits their profile or is deleted (user_id -> NULL on
-- delete, the snapshot fields remain for historical record).
CREATE TABLE outreach_recipients (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    recipient_name TEXT NOT NULL DEFAULT '',
    recipient_email TEXT NOT NULL DEFAULT '',
    recipient_phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed
    status_code TEXT NOT NULL DEFAULT '',   -- driver-native code (SMS: provider response code; Email: smtp result marker)
    error_message TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT
);
CREATE INDEX idx_outreach_recipients_campaign ON outreach_recipients(campaign_id, status);
