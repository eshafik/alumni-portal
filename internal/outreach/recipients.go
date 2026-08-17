// Package outreach resolves bulk-message recipients and runs the background sender that
// delivers queued outreach_recipients rows (see migration 0014_outreach.sql).
package outreach

import (
	"strings"

	"github.com/jmoiron/sqlx"
)

// Filters mirrors the subset of AlumniHandler.List/StudentHandler.List's filter set that
// applies to outreach targeting (batch/department/blood group; programId is alumni-only,
// matching StudentHandler.List's own filter set which has no programId filter either).
type Filters struct {
	BatchID      string
	DepartmentID string
	ProgramID    string
	BloodGroupID string
}

type Recipient struct {
	UserID int64  `db:"id"`
	Name   string `db:"full_name"`
	Email  string `db:"email"`
	Phone  string `db:"phone"`
}

// ResolveRecipients is the single source of truth for "who does this campaign reach" — used by
// both the cost-estimate endpoint and actual campaign creation, so the estimate shown to an
// admin always exactly matches what gets sent. Per product decision, privacy_email/privacy_phone
// are ignored here: those flags only govern peer-directory visibility, not the institution's own
// outreach channel.
func ResolveRecipients(db *sqlx.DB, targetAlumni, targetStudents bool, f Filters) ([]Recipient, error) {
	// Sub-filtering only applies when exactly one group is targeted (see AdminOutreach.tsx) —
	// when both are targeted, filters are ignored so "both" always means "everyone".
	applyFilters := targetAlumni != targetStudents

	var queries []string
	var args []any

	if targetAlumni {
		where := []string{"u.status = 'approved'"}
		var alumniArgs []any
		if applyFilters {
			if f.BatchID != "" {
				where = append(where, "ap.batch_id = ?")
				alumniArgs = append(alumniArgs, f.BatchID)
			}
			if f.DepartmentID != "" {
				where = append(where, "d.id = ?")
				alumniArgs = append(alumniArgs, f.DepartmentID)
			}
			if f.ProgramID != "" {
				where = append(where, "ap.program_id = ?")
				alumniArgs = append(alumniArgs, f.ProgramID)
			}
			if f.BloodGroupID != "" {
				where = append(where, "ap.blood_group_id = ?")
				alumniArgs = append(alumniArgs, f.BloodGroupID)
			}
		}
		queries = append(queries, `SELECT u.id, u.full_name, u.email, u.phone
			FROM alumni_profiles ap
			JOIN users u ON u.id = ap.user_id
			JOIN programs pr ON pr.id = ap.program_id
			JOIN departments d ON d.id = pr.department_id
			WHERE `+strings.Join(where, " AND "))
		args = append(args, alumniArgs...)
	}

	if targetStudents {
		where := []string{"u.status = 'approved'", "sp.status = 'active'"}
		var studentArgs []any
		if applyFilters {
			if f.BatchID != "" {
				where = append(where, "sp.batch_id = ?")
				studentArgs = append(studentArgs, f.BatchID)
			}
			if f.DepartmentID != "" {
				where = append(where, "d.id = ?")
				studentArgs = append(studentArgs, f.DepartmentID)
			}
			if f.BloodGroupID != "" {
				where = append(where, "sp.blood_group_id = ?")
				studentArgs = append(studentArgs, f.BloodGroupID)
			}
		}
		queries = append(queries, `SELECT u.id, u.full_name, u.email, u.phone
			FROM student_profiles sp
			JOIN users u ON u.id = sp.user_id
			JOIN programs pr ON pr.id = sp.program_id
			JOIN departments d ON d.id = pr.department_id
			WHERE `+strings.Join(where, " AND "))
		args = append(args, studentArgs...)
	}

	if len(queries) == 0 {
		return []Recipient{}, nil
	}

	// UNION (not UNION ALL) de-dupes the rare case a user somehow matches both halves.
	recipients := []Recipient{}
	if err := db.Select(&recipients, strings.Join(queries, " UNION "), args...); err != nil {
		return nil, err
	}
	return recipients, nil
}

// FetchUsersByIDs resolves specific individually-picked users (see AdminOutreach.tsx's "Add
// specific people" search) to Recipients, regardless of role/profile — an admin may want to
// reach an individual alumni/student/moderator by name even if they wouldn't otherwise match any
// group filter. Empty/blank-email or blank-phone users are still returned; the sender just
// skips whichever channel that recipient has nothing to send to (see outreach.Sender).
func FetchUsersByIDs(db *sqlx.DB, ids []int64) ([]Recipient, error) {
	if len(ids) == 0 {
		return []Recipient{}, nil
	}
	query, args, err := sqlx.In(`SELECT id, full_name, email, phone FROM users WHERE id IN (?) AND status = 'approved'`, ids)
	if err != nil {
		return nil, err
	}
	recipients := []Recipient{}
	if err := db.Select(&recipients, db.Rebind(query), args...); err != nil {
		return nil, err
	}
	return recipients, nil
}

// MergeRecipients combines group-resolved recipients with individually-picked ones, de-duping
// by user ID (a specifically-added person who also matches the group filter isn't double-sent).
func MergeRecipients(groups []Recipient, extras []Recipient) []Recipient {
	seen := make(map[int64]bool, len(groups))
	merged := make([]Recipient, 0, len(groups)+len(extras))
	for _, r := range groups {
		seen[r.UserID] = true
		merged = append(merged, r)
	}
	for _, r := range extras {
		if !seen[r.UserID] {
			seen[r.UserID] = true
			merged = append(merged, r)
		}
	}
	return merged
}

// SearchUsers finds approved alumni/students by name, email, or phone for the "Add specific
// people" picker — deliberately not gated to any group/filter, since the whole point is to reach
// someone regardless of which group/filter would otherwise include them.
type UserSearchResult struct {
	UserID int64  `db:"id" json:"userId"`
	Name   string `db:"full_name" json:"fullName"`
	Email  string `db:"email" json:"email"`
	Phone  string `db:"phone" json:"phone"`
	RoleID int64  `db:"role_id" json:"roleId"`
}

func SearchUsers(db *sqlx.DB, q string, limit int) ([]UserSearchResult, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	results := []UserSearchResult{}
	like := "%" + q + "%"
	err := db.Select(&results, `SELECT id, full_name, email, phone, role_id FROM users
		WHERE status = 'approved' AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)
		ORDER BY full_name LIMIT ?`, like, like, like, limit)
	if err != nil {
		return nil, err
	}
	return results, nil
}
