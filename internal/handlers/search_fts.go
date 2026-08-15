package handlers

import "github.com/jmoiron/sqlx"

// syncJobFTS rebuilds the FTS5 row for a single job post. Called after any write that touches
// searchable fields (create/update); Delete removes the row directly.
func syncJobFTS(db *sqlx.DB, jobID int64) {
	var row struct {
		Title       string `db:"title"`
		CompanyName string `db:"company_name"`
		Location    string `db:"location"`
		Description string `db:"description"`
	}
	if err := db.Get(&row, `SELECT title, company_name, location, description FROM job_posts WHERE id = ?`, jobID); err != nil {
		return
	}
	_, _ = db.Exec(`DELETE FROM job_posts_fts WHERE rowid = ?`, jobID)
	_, _ = db.Exec(`INSERT INTO job_posts_fts (rowid, title, company_name, location, description) VALUES (?, ?, ?, ?, ?)`,
		jobID, row.Title, row.CompanyName, row.Location, row.Description)
}

// syncNoticeFTS rebuilds the FTS5 row for a single notice. Title only — matches the product
// decision that notice search excludes body text.
func syncNoticeFTS(db *sqlx.DB, noticeID int64) {
	var title string
	if err := db.Get(&title, `SELECT title FROM notices WHERE id = ?`, noticeID); err != nil {
		return
	}
	_, _ = db.Exec(`DELETE FROM notices_fts WHERE rowid = ?`, noticeID)
	_, _ = db.Exec(`INSERT INTO notices_fts (rowid, title) VALUES (?, ?)`, noticeID, title)
}

// syncEventFTS rebuilds the FTS5 row for a single event. Called after create/update; cancelled
// events are left indexed since List already filters status = 'published' regardless.
func syncEventFTS(db *sqlx.DB, eventID int64) {
	var row struct {
		Title       string `db:"title"`
		Description string `db:"description"`
		Venue       string `db:"venue"`
	}
	if err := db.Get(&row, `SELECT title, description, venue FROM events WHERE id = ?`, eventID); err != nil {
		return
	}
	_, _ = db.Exec(`DELETE FROM events_fts WHERE rowid = ?`, eventID)
	_, _ = db.Exec(`INSERT INTO events_fts (rowid, title, description, venue) VALUES (?, ?, ?, ?)`,
		eventID, row.Title, row.Description, row.Venue)
}

// syncStudentFTS rebuilds the FTS5 row for a single student, keyed by user_id (matches
// syncAlumniFTS's convention). Joins through student_profiles so calling this for a non-student
// user_id (e.g. from the role-agnostic registration-approval path) is a safe no-op.
func syncStudentFTS(db *sqlx.DB, userID int64) {
	var fullName string
	if err := db.Get(&fullName, `SELECT u.full_name FROM student_profiles sp JOIN users u ON u.id = sp.user_id WHERE sp.user_id = ?`, userID); err != nil {
		return
	}
	_, _ = db.Exec(`DELETE FROM students_fts WHERE rowid = ?`, userID)
	_, _ = db.Exec(`INSERT INTO students_fts (rowid, full_name) VALUES (?, ?)`, userID, fullName)
}
