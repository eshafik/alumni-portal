// Command import-django-users bulk-loads user accounts + alumni profile data migrated from the
// old Django/DRF alumni portal, preserving each account's existing password hash verbatim.
// internal/auth.VerifyPassword dispatches by hash format at login time ("pbkdf2_sha256$..." vs.
// this app's bcrypt), so no password conversion happens here — see internal/auth/password.go.
// On each successful login, an imported account's hash is transparently upgraded to bcrypt.
//
// CSV columns (header row required, case-insensitive):
//
//	id,username,email,name,company_name,job_location,password,phone,profile_pic,student_id,
//	passing_year,batch_no,professional_designation,expertise_area
//
// Every row is imported as an Alumni account (this CSV is a one-time export of already-graduated
// members). password must be a Django PBKDF2-SHA256 hash
// ("pbkdf2_sha256$<iterations>$<salt>$<base64-hash>") — anything else is skipped, to guard
// against accidentally pointing this at a plaintext-password export.
//
// batch_no (1-15) is mapped to a "Nth Batch" row under a single Department/Program created (or
// reused) on first run — see departmentName/programName below. Batch start_year/end_year are
// left NULL (the source data's per-user passing_year doesn't cleanly map to a single batch-wide
// academic year range); sort_order is set from batch_no so directory ordering ("1st Batch" ..
// "15th Batch") is unaffected by the missing years.
//
// phone is normalized to E.164 with a Bangladesh country code (+880), since the source export
// stores BD mobile numbers as bare 10-digit strings with the leading trunk "0" stripped.
//
// company_name/job_location/professional_designation become the alumni's current employer,
// location, and designation; expertise_area becomes their bio (closest existing free-text
// field — the CSV has no dedicated bio/skills column). Contact-info privacy flags
// (email/phone/whatsapp/location/company) all default to visible — these are pre-vetted
// legacy members, not new signups opting into defaults.
//
// email is read from the "username" column, not "email" — on this export the two are always
// identical, but username is the field the old system actually treated as the login identity.
//
// profile_pic is an old Django media path like "/1/avatar/<uuid>_<original-name>.jpg". The
// actual image files already live at that same relative path under this app's own upload root
// (cfg.LocalPath, default ./data/uploads) — nothing needs copying. For each row with a
// profile_pic whose file exists on disk, an attachments row is created pointing at that
// existing file (storage_key = the path as-is, minus the leading "/") and
// alumni_profiles.avatar_attachment_id is set to it. Rows whose profile_pic file is missing
// from disk are imported without an avatar and counted in the final summary.
package main

import (
	"encoding/csv"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/config"
	"alumni-portal/internal/db"
)

const (
	departmentName = "Textile Engineering"
	programName    = "B.Sc. in Textile Engineering"
)

var ordinalSuffix = map[int]string{1: "st", 2: "nd", 3: "rd"}

func ordinal(n int) string {
	suffix := "th"
	if n%100 < 11 || n%100 > 13 {
		if s, ok := ordinalSuffix[n%10]; ok {
			suffix = s
		}
	}
	return fmt.Sprintf("%d%s", n, suffix)
}

// normalizePhone converts a Bangladesh mobile number in any of the CSV's observed shapes to
// E.164 (+880...), matching the format the rest of the app stores phone numbers in (see
// web/src/components/shared/PhoneInput.tsx). Non-BD numbers (already carrying a different
// country code) are passed through with a leading "+" only.
func normalizePhone(raw string) string {
	var digits strings.Builder
	for _, r := range raw {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	d := digits.String()
	switch {
	case len(d) == 10:
		// Bare BD mobile number with the leading trunk "0" already stripped (e.g. "1736674077").
		return "+880" + d
	case len(d) == 11 && strings.HasPrefix(d, "0"):
		// BD mobile number with the leading trunk "0" intact (e.g. "01812702202").
		return "+880" + d[1:]
	default:
		// Already carries some country code (e.g. a foreign number) — just add the "+".
		return "+" + d
	}
}

func main() {
	filePath := flag.String("file", "", "path to CSV file")
	flag.Parse()
	if *filePath == "" {
		log.Fatal("usage: import-django-users -file users.csv")
	}

	cfg := config.Load()
	dbx, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	defer dbx.Close()
	if err := db.Migrate(dbx); err != nil {
		log.Fatalf("db migrate: %v", err)
	}

	var institutionID int64
	if err := dbx.Get(&institutionID, `SELECT id FROM institutions LIMIT 1`); err != nil {
		log.Fatalf("institution not configured — start the server once first to seed it: %v", err)
	}

	programID, err := findOrCreateProgram(dbx, institutionID)
	if err != nil {
		log.Fatalf("resolve department/program: %v", err)
	}

	f, err := os.Open(*filePath)
	if err != nil {
		log.Fatalf("open file: %v", err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	header, err := r.Read()
	if err != nil {
		log.Fatalf("read header: %v", err)
	}
	col := make(map[string]int, len(header))
	for i, h := range header {
		col[strings.ToLower(strings.TrimSpace(h))] = i
	}
	required := []string{"username", "password", "name", "phone", "student_id", "passing_year", "batch_no"}
	for _, c := range required {
		if _, ok := col[c]; !ok {
			log.Fatalf("missing required column %q", c)
		}
	}

	batchIDs := map[string]int64{} // batch_no -> batches.id, resolved lazily as rows are seen
	imported, skipped, avatarsImported, avatarsMissing := 0, 0, 0, 0
	rowNum := 1
	for {
		row, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("row %d: read error: %v", rowNum, err)
			continue
		}
		rowNum++

		get := func(key string) string {
			if i, ok := col[key]; ok && i < len(row) {
				return strings.TrimSpace(row[i])
			}
			return ""
		}

		email := strings.ToLower(get("username"))
		passwordHash := get("password")
		fullName := get("name")
		phone := get("phone")
		studentID := get("student_id")
		batchNo := get("batch_no")
		companyName := get("company_name")
		jobLocation := get("job_location")
		designation := get("professional_designation")
		expertiseArea := get("expertise_area")
		profilePic := get("profile_pic")

		if fullName == "" || email == "" || phone == "" {
			log.Printf("row %d: skipped (missing name/email/phone)", rowNum)
			skipped++
			continue
		}
		if !auth.IsDjangoHash(passwordHash) {
			log.Printf("row %d: skipped (password is not a pbkdf2_sha256$ hash — check the export, this tool never accepts plaintext)", rowNum)
			skipped++
			continue
		}
		passingYear, err := strconv.Atoi(get("passing_year"))
		if err != nil {
			log.Printf("row %d: skipped (invalid passing_year %q)", rowNum, get("passing_year"))
			skipped++
			continue
		}
		batchN, err := strconv.Atoi(batchNo)
		if err != nil || batchN < 1 {
			log.Printf("row %d: skipped (invalid batch_no %q)", rowNum, batchNo)
			skipped++
			continue
		}

		batchID, ok := batchIDs[batchNo]
		if !ok {
			batchID, err = findOrCreateBatch(dbx, programID, batchN)
			if err != nil {
				log.Printf("row %d: skipped (batch resolve failed: %v)", rowNum, err)
				skipped++
				continue
			}
			batchIDs[batchNo] = batchID
		}

		phone = normalizePhone(phone)

		var existingCount int
		_ = dbx.Get(&existingCount, `SELECT COUNT(*) FROM users WHERE institution_id = ? AND (email = ? OR phone = ?)`, institutionID, email, phone)
		if existingCount > 0 {
			log.Printf("row %d: skipped (email or phone already exists: %s / %s)", rowNum, email, phone)
			skipped++
			continue
		}

		tx, err := dbx.Beginx()
		if err != nil {
			log.Printf("row %d: skipped (tx begin failed: %v)", rowNum, err)
			skipped++
			continue
		}

		res, err := tx.Exec(
			`INSERT INTO users (institution_id, role_id, full_name, email, phone, password_hash, status, student_id, passing_year)
			 VALUES (?, 4, ?, ?, ?, ?, 'approved', ?, ?)`,
			institutionID, fullName, email, phone, passwordHash, studentID, passingYear,
		)
		if err != nil {
			tx.Rollback()
			log.Printf("row %d: skipped (insert user failed: %v)", rowNum, err)
			skipped++
			continue
		}
		userID, _ := res.LastInsertId()

		avatarAttachmentID, err := resolveAvatarAttachment(tx, cfg.LocalPath, institutionID, userID, profilePic)
		if err != nil {
			tx.Rollback()
			log.Printf("row %d: skipped (avatar attachment failed: %v)", rowNum, err)
			skipped++
			continue
		}
		if profilePic != "" {
			if avatarAttachmentID != nil {
				avatarsImported++
			} else {
				avatarsMissing++
			}
		}

		res2, err := tx.Exec(
			`INSERT INTO alumni_profiles (
				user_id, program_id, batch_id, current_location, current_designation, bio, avatar_attachment_id,
				privacy_email, privacy_phone, privacy_whatsapp, privacy_location, privacy_company
			) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, 1)`,
			userID, programID, batchID, jobLocation, designation, expertiseArea, avatarAttachmentID,
		)
		if err != nil {
			tx.Rollback()
			log.Printf("row %d: skipped (insert alumni_profiles failed: %v)", rowNum, err)
			skipped++
			continue
		}
		alumniProfileID, _ := res2.LastInsertId()

		if companyName != "" {
			companyID, err := findOrCreateCompanyTx(tx, companyName)
			if err != nil {
				tx.Rollback()
				log.Printf("row %d: skipped (company resolve failed: %v)", rowNum, err)
				skipped++
				continue
			}
			if _, err := tx.Exec(
				`INSERT INTO employment_history (alumni_profile_id, company_id, title, is_current) VALUES (?, ?, ?, 1)`,
				alumniProfileID, companyID, designation,
			); err != nil {
				tx.Rollback()
				log.Printf("row %d: skipped (insert employment_history failed: %v)", rowNum, err)
				skipped++
				continue
			}
		}

		if err := tx.Commit(); err != nil {
			log.Printf("row %d: skipped (commit failed: %v)", rowNum, err)
			skipped++
			continue
		}
		imported++
	}

	fmt.Printf("Import complete: %d imported, %d skipped.\n", imported, skipped)
	fmt.Printf("Avatars: %d imported, %d had a profile_pic value but no matching file on disk.\n", avatarsImported, avatarsMissing)
	fmt.Println("Each account's password verifies against its original Django hash and upgrades to bcrypt automatically on first login.")
}

// findOrCreateProgram resolves the single Department/Program every imported row attaches to,
// creating both on first run. Neither table has a uniqueness constraint on name, so this
// find-then-create check is what keeps a second run from creating duplicates.
func findOrCreateProgram(dbx *sqlx.DB, institutionID int64) (int64, error) {
	var departmentID int64
	err := dbx.Get(&departmentID, `SELECT id FROM departments WHERE institution_id = ? AND name = ?`, institutionID, departmentName)
	if err != nil {
		res, err := dbx.Exec(`INSERT INTO departments (institution_id, name) VALUES (?, ?)`, institutionID, departmentName)
		if err != nil {
			return 0, fmt.Errorf("create department: %w", err)
		}
		departmentID, _ = res.LastInsertId()
	}

	var programID int64
	err = dbx.Get(&programID, `SELECT id FROM programs WHERE department_id = ? AND name = ?`, departmentID, programName)
	if err != nil {
		res, err := dbx.Exec(`INSERT INTO programs (department_id, name) VALUES (?, ?)`, departmentID, programName)
		if err != nil {
			return 0, fmt.Errorf("create program: %w", err)
		}
		programID, _ = res.LastInsertId()
	}
	return programID, nil
}

// findOrCreateBatch resolves/creates the "Nth Batch" row for a given batch_no. start_year/
// end_year are left NULL (see package doc); sort_order = batchN keeps directory ordering
// correct despite the missing years.
func findOrCreateBatch(dbx *sqlx.DB, programID int64, batchN int) (int64, error) {
	label := ordinal(batchN) + " Batch"
	var id int64
	err := dbx.Get(&id, `SELECT id FROM batches WHERE program_id = ? AND label = ?`, programID, label)
	if err == nil {
		return id, nil
	}
	res, err := dbx.Exec(`INSERT INTO batches (program_id, label, sort_order) VALUES (?, ?, ?)`, programID, label, batchN)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// findOrCreateCompanyTx resolves a free-text company name to a companies.id, creating the row
// if it doesn't exist yet. Mirrors internal/handlers/common.go:findOrCreateCompany, reimplemented
// here since that helper is unexported in package handlers.
func findOrCreateCompanyTx(tx *sqlx.Tx, name string) (int64, error) {
	var id int64
	if err := tx.Get(&id, `SELECT id FROM companies WHERE name = ?`, name); err == nil {
		return id, nil
	}
	res, err := tx.Exec(`INSERT INTO companies (name) VALUES (?)`, name)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

var mimeByExt = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
}

// resolveAvatarAttachment creates an attachments row pointing at an already-on-disk legacy
// avatar file (see package doc) and returns its id, or nil if profilePic is blank or the file
// isn't found under localRoot — either case just means "no avatar", not a row-level failure.
func resolveAvatarAttachment(tx *sqlx.Tx, localRoot string, institutionID, userID int64, profilePic string) (*int64, error) {
	if profilePic == "" {
		return nil, nil
	}
	relKey := strings.TrimPrefix(profilePic, "/")
	info, err := os.Stat(filepath.Join(localRoot, relKey))
	if err != nil {
		return nil, nil
	}
	mimeType := mimeByExt[strings.ToLower(filepath.Ext(relKey))]
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	res, err := tx.Exec(
		`INSERT INTO attachments (institution_id, storage_key, original_filename, mime_type, size_bytes, uploaded_by_user_id)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		institutionID, relKey, filepath.Base(relKey), mimeType, info.Size(), userID,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return &id, nil
}
