package db

import (
	"time"

	"github.com/jmoiron/sqlx"
)

// SeedInstitution creates a single institution row (if none exists yet) plus its default
// committee with the three mandatory auto-admin positions (President, Secretary,
// Organizing Secretary). Safe to call on every startup — it's a no-op once seeded.
func SeedInstitution(dbx *sqlx.DB, name, slug string) error {
	var count int
	if err := dbx.Get(&count, `SELECT COUNT(*) FROM institutions`); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	tx, err := dbx.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec(
		`INSERT INTO institutions (name, short_name, slug, institution_type) VALUES (?, ?, ?, 'university')`,
		name, name, slug,
	)
	if err != nil {
		return err
	}
	institutionID, _ := res.LastInsertId()

	currentYear := time.Now().Year()
	cres, err := tx.Exec(
		`INSERT INTO committees (institution_id, term_start, term_end, is_current) VALUES (?, ?, ?, 1)`,
		institutionID, currentYear, currentYear+2,
	)
	if err != nil {
		return err
	}
	committeeID, _ := cres.LastInsertId()

	defaultPositions := []struct {
		title string
		order int
	}{
		{"President", 1},
		{"Secretary", 2},
		{"Organizing Secretary", 3},
	}
	for _, p := range defaultPositions {
		if _, err := tx.Exec(
			`INSERT INTO committee_positions (committee_id, title, is_default_admin, sort_order) VALUES (?, ?, 1, ?)`,
			committeeID, p.title, p.order,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// SeedBloodGroups seeds the 8 standard values for the given institution if it has none yet.
// Deliberately separate from SeedInstitution and called unconditionally on every startup
// (regardless of whether the institution row already existed) — an install that upgraded from
// before blood_groups existed would otherwise never get seeded, since SeedInstitution only
// runs its body once, the very first time the institution row is created.
func SeedBloodGroups(dbx *sqlx.DB, institutionID int64) error {
	var count int
	if err := dbx.Get(&count, `SELECT COUNT(*) FROM blood_groups WHERE institution_id = ?`, institutionID); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	standardBloodGroups := []string{"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}
	for i, name := range standardBloodGroups {
		if _, err := dbx.Exec(
			`INSERT INTO blood_groups (institution_id, name, sort_order) VALUES (?, ?, ?)`,
			institutionID, name, i+1,
		); err != nil {
			return err
		}
	}
	return nil
}

// SeedSuperAdmin creates the first SuperAdmin account from SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD
// env vars if no SuperAdmin exists yet. This is the only bootstrap path into the admin UI —
// there is no public "become admin" endpoint. passwordHash must already be bcrypt-hashed by
// the caller (keeps this package free of a dependency on internal/auth).
func SeedSuperAdmin(dbx *sqlx.DB, institutionID int64, email, passwordHash string) error {
	if email == "" || passwordHash == "" {
		return nil
	}
	var count int
	if err := dbx.Get(&count, `SELECT COUNT(*) FROM users WHERE role_id = 1`); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	_, err := dbx.Exec(
		`INSERT INTO users (institution_id, role_id, full_name, email, phone, password_hash, status)
		 VALUES (?, 1, 'Super Admin', ?, '', ?, 'approved')
		 ON CONFLICT(institution_id, email) DO UPDATE SET role_id = 1, password_hash = excluded.password_hash, status = 'approved'`,
		institutionID, email, passwordHash,
	)
	return err
}
