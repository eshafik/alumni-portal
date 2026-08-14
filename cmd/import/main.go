// Command import bulk-loads existing alumni/student records from a CSV file, for seeding an
// institution's existing membership at launch without making everyone self-register one at a
// time via OTP. Run on the server (or over SSH) against the production data.db, or locally
// against a dev DB. Not a UI feature — deliberately CLI-only per the 2-day MVP scope decision.
//
// CSV columns (header row required, case-insensitive):
//
//	fullName,email,phone,accountType,department,program,batchStartYear,batchEndYear,batchLabel,graduationYear,bloodGroup
//
// accountType is "alumni" or "student". Department/program/batch/bloodGroup are created if
// they don't already exist (matched by name/year); bloodGroup is optional. Imported users are
// inserted directly as approved
// (skipping OTP/moderator review, since this is an admin-initiated bulk operation) with a
// random password — they must use "forgot password" to set their own on first login.
package main

import (
	"crypto/rand"
	"encoding/csv"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/config"
	"alumni-portal/internal/db"
	"alumni-portal/internal/models"
)

func main() {
	filePath := flag.String("file", "", "path to CSV file")
	flag.Parse()
	if *filePath == "" {
		log.Fatal("usage: import -file alumni.csv")
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
	required := []string{"fullname", "email", "phone", "accounttype", "department", "program"}
	for _, c := range required {
		if _, ok := col[c]; !ok {
			log.Fatalf("missing required column %q", c)
		}
	}

	imported, skipped := 0, 0
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

		fullName := get("fullname")
		email := strings.ToLower(get("email"))
		phone := get("phone")
		accountType := strings.ToLower(get("accounttype"))
		deptName := get("department")
		programName := get("program")
		batchStart, _ := strconv.Atoi(get("batchstartyear"))
		batchEnd, _ := strconv.Atoi(get("batchendyear"))
		batchLabel := get("batchlabel")
		bloodGroupName := get("bloodgroup")
		if batchStart == 0 {
			gradYear, _ := strconv.Atoi(get("graduationyear"))
			batchStart = gradYear
			batchEnd = gradYear
		}

		if fullName == "" || email == "" || (accountType != "alumni" && accountType != "student") {
			log.Printf("row %d: skipped (missing name/email or invalid accountType)", rowNum)
			skipped++
			continue
		}

		var existingCount int
		_ = dbx.Get(&existingCount, `SELECT COUNT(*) FROM users WHERE institution_id = ? AND email = ?`, institutionID, email)
		if existingCount > 0 {
			log.Printf("row %d: skipped (email already exists: %s)", rowNum, email)
			skipped++
			continue
		}

		deptID, err := getOrCreateDepartment(dbx, institutionID, deptName)
		if err != nil {
			log.Printf("row %d: department error: %v", rowNum, err)
			skipped++
			continue
		}
		programID, err := getOrCreateProgram(dbx, deptID, programName)
		if err != nil {
			log.Printf("row %d: program error: %v", rowNum, err)
			skipped++
			continue
		}
		batchID, err := getOrCreateBatch(dbx, programID, batchStart, batchEnd, batchLabel)
		if err != nil {
			log.Printf("row %d: batch error: %v", rowNum, err)
			skipped++
			continue
		}
		var bloodGroupID *int64
		if bloodGroupName != "" {
			id, err := getOrCreateBloodGroup(dbx, institutionID, bloodGroupName)
			if err != nil {
				log.Printf("row %d: blood group error: %v", rowNum, err)
				skipped++
				continue
			}
			bloodGroupID = &id
		}

		randomPassword, err := randomHex(16)
		if err != nil {
			log.Fatalf("generate password: %v", err)
		}
		passwordHash, err := auth.HashPassword(randomPassword)
		if err != nil {
			log.Fatalf("hash password: %v", err)
		}

		roleID := models.RoleAlumni
		if accountType == "student" {
			roleID = models.RoleStudent
		}

		tx, err := dbx.Beginx()
		if err != nil {
			log.Fatalf("begin tx: %v", err)
		}
		res, err := tx.Exec(
			`INSERT INTO users (institution_id, role_id, full_name, email, phone, password_hash, status)
			 VALUES (?, ?, ?, ?, ?, ?, 'approved')`,
			institutionID, roleID, fullName, email, phone, passwordHash,
		)
		if err != nil {
			tx.Rollback()
			log.Printf("row %d: insert user failed: %v", rowNum, err)
			skipped++
			continue
		}
		userID, _ := res.LastInsertId()

		if accountType == "student" {
			_, err = tx.Exec(`INSERT INTO student_profiles (user_id, program_id, batch_id, blood_group_id) VALUES (?, ?, ?, ?)`,
				userID, programID, batchID, bloodGroupID)
		} else {
			_, err = tx.Exec(`INSERT INTO alumni_profiles (user_id, program_id, batch_id, blood_group_id) VALUES (?, ?, ?, ?)`,
				userID, programID, batchID, bloodGroupID)
		}
		if err != nil {
			tx.Rollback()
			log.Printf("row %d: insert profile failed: %v", rowNum, err)
			skipped++
			continue
		}
		if err := tx.Commit(); err != nil {
			log.Printf("row %d: commit failed: %v", rowNum, err)
			skipped++
			continue
		}

		if accountType == "alumni" {
			// Directory search (internal/handlers/alumni_handler.go's List) reads from this
			// FTS index, not the base tables — without this, imported alumni are invisible to
			// full-text search (still visible via unfiltered listing, just not searchable).
			if _, err := dbx.Exec(`INSERT INTO alumni_fts (rowid, full_name, bio, current_location, current_designation, company_names, skill_names)
				VALUES (?, ?, '', '', '', '', '')`, userID, fullName); err != nil {
				log.Printf("row %d: FTS index update failed (non-fatal): %v", rowNum, err)
			}
		}
		imported++
	}

	fmt.Printf("Import complete: %d imported, %d skipped.\n", imported, skipped)
	fmt.Println("Imported users have a random password — instruct them to use 'forgot password' on first login.")
}

func getOrCreateDepartment(dbx *sqlx.DB, institutionID int64, name string) (int64, error) {
	if name == "" {
		return 0, fmt.Errorf("department name is required")
	}
	var id int64
	err := dbx.Get(&id, `SELECT id FROM departments WHERE institution_id = ? AND name = ?`, institutionID, name)
	if err == nil {
		return id, nil
	}
	res, err := dbx.Exec(`INSERT INTO departments (institution_id, name) VALUES (?, ?)`, institutionID, name)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func getOrCreateProgram(dbx *sqlx.DB, departmentID int64, name string) (int64, error) {
	if name == "" {
		return 0, fmt.Errorf("program name is required")
	}
	var id int64
	err := dbx.Get(&id, `SELECT id FROM programs WHERE department_id = ? AND name = ?`, departmentID, name)
	if err == nil {
		return id, nil
	}
	res, err := dbx.Exec(`INSERT INTO programs (department_id, name) VALUES (?, ?)`, departmentID, name)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func getOrCreateBatch(dbx *sqlx.DB, programID int64, startYear, endYear int, label string) (int64, error) {
	if startYear == 0 {
		return 0, fmt.Errorf("batchStartYear or graduationYear is required")
	}
	if endYear == 0 {
		endYear = startYear
	}
	if label == "" {
		label = strconv.Itoa(startYear)
		if endYear != startYear {
			label = fmt.Sprintf("%d-%d", startYear, endYear)
		}
	}
	var id int64
	err := dbx.Get(&id, `SELECT id FROM batches WHERE program_id = ? AND start_year = ? AND end_year = ?`, programID, startYear, endYear)
	if err == nil {
		return id, nil
	}
	res, err := dbx.Exec(`INSERT INTO batches (program_id, start_year, end_year, label) VALUES (?, ?, ?, ?)`, programID, startYear, endYear, label)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func getOrCreateBloodGroup(dbx *sqlx.DB, institutionID int64, name string) (int64, error) {
	var id int64
	err := dbx.Get(&id, `SELECT id FROM blood_groups WHERE institution_id = ? AND name = ?`, institutionID, name)
	if err == nil {
		return id, nil
	}
	res, err := dbx.Exec(`INSERT INTO blood_groups (institution_id, name) VALUES (?, ?)`, institutionID, name)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
