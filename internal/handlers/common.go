package handlers

import (
	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/storage"
)

// attachmentURL resolves an attachment FK to a servable URL through the storage abstraction.
// Handlers never construct file paths/URLs themselves — this is the one place that does,
// keeping local vs S3 differences invisible to API response shaping.
func attachmentURL(db *sqlx.DB, store storage.Driver, attachmentID *int64) string {
	if attachmentID == nil {
		return ""
	}
	var key string
	if err := db.Get(&key, `SELECT storage_key FROM attachments WHERE id = ?`, *attachmentID); err != nil {
		return ""
	}
	return store.URL(key)
}

// findOrCreateCompany resolves a free-text company name to a companies.id, creating the row
// if it doesn't exist yet. Shared by signup and profile-update so a company entered either way
// lands in the same normalized table the directory's company filter and FTS index read from.
func findOrCreateCompany(db *sqlx.DB, name string) (int64, error) {
	var id int64
	if err := db.Get(&id, `SELECT id FROM companies WHERE name = ?`, name); err == nil {
		return id, nil
	}
	res, err := db.Exec(`INSERT INTO companies (name) VALUES (?)`, name)
	if err != nil {
		// Likely a concurrent insert of the same name (UNIQUE constraint) — re-read.
		if err2 := db.Get(&id, `SELECT id FROM companies WHERE name = ?`, name); err2 == nil {
			return id, nil
		}
		return 0, err
	}
	return res.LastInsertId()
}

// upsertCurrentEmployment sets the alumni profile's single "current" employment_history row
// (title + company), creating it if none exists yet, updating it in place otherwise. Any
// previously-current row is left alone if companyName is empty — it's simply not touched.
func upsertCurrentEmployment(db *sqlx.DB, alumniProfileID int64, title, companyName string) error {
	if companyName == "" {
		return nil
	}
	companyID, err := findOrCreateCompany(db, companyName)
	if err != nil {
		return err
	}
	var existingID int64
	err = db.Get(&existingID, `SELECT id FROM employment_history WHERE alumni_profile_id = ? AND is_current = 1`, alumniProfileID)
	if err == nil {
		_, err = db.Exec(`UPDATE employment_history SET company_id = ?, title = ? WHERE id = ?`, companyID, title, existingID)
		return err
	}
	_, err = db.Exec(`INSERT INTO employment_history (alumni_profile_id, company_id, title, is_current) VALUES (?, ?, ?, 1)`,
		alumniProfileID, companyID, title)
	return err
}
