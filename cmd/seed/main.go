// Command seed populates a dev database with realistic dummy data across every section of the
// portal — alumni, students, an admin, a moderator, job posts, public/private notices, a
// current committee, a previous committee (term history), and a few businesses — so permissions
// and views can be checked by logging in as each seeded account. Every seeded account shares one
// password (see -password flag). Local-only tooling, not wired into the server; safe to re-run
// (skips any email that already exists).
package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log"

	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/config"
	"alumni-portal/internal/db"
	"alumni-portal/internal/models"
	"alumni-portal/internal/storage"
)

const defaultPassword = "Passw0rd!123"

func main() {
	password := flag.String("password", defaultPassword, "shared login password for every seeded account")
	flag.Parse()

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

	store, err := storage.New(cfg)
	if err != nil {
		log.Fatalf("storage init: %v", err)
	}

	passwordHash, err := auth.HashPassword(*password)
	if err != nil {
		log.Fatalf("hash password: %v", err)
	}

	avatarID, err := seedSharedAvatar(dbx, store, institutionID)
	if err != nil {
		log.Fatalf("seed avatar: %v", err)
	}

	depts := seedTaxonomy(dbx, institutionID)

	fmt.Println("Seeding users...")
	var created []string

	admin := mustSeedUser(dbx, institutionID, passwordHash, seedUser{
		email: "admin1@seed.test", fullName: "Ayesha Rahman", phone: "+8801900000001",
		roleID: models.RoleAdmin, status: models.StatusApproved,
	})
	created = append(created, describe("Admin", admin))

	moderator := mustSeedUser(dbx, institutionID, passwordHash, seedUser{
		email: "moderator1@seed.test", fullName: "Tanvir Ahmed", phone: "+8801900000002",
		roleID: models.RoleModerator, status: models.StatusApproved, modScopeDeptID: &depts[0].id,
	})
	created = append(created, describe("Moderator (scoped: "+depts[0].name+")", moderator))

	alumniNames := []struct {
		name, designation, location string
	}{
		{"Fahim Chowdhury", "Software Engineer at Brain Station 23", "Dhaka, Bangladesh"},
		{"Nusrat Jahan", "Product Manager at bKash", "Dhaka, Bangladesh"},
		{"Rezaul Karim", "Data Scientist at Pathao", "Dhaka, Bangladesh"},
		{"Sadia Islam", "UX Designer, Freelance", "Chittagong, Bangladesh"},
		{"Imran Hossain", "Backend Engineer at Therap BD", "Dhaka, Bangladesh"},
		{"Farhana Akter", "HR Manager at Grameenphone", "Dhaka, Bangladesh"},
		{"Shakil Ahmed", "Founder, Ahmed Trading Co.", "Sylhet, Bangladesh"},
		{"Mahmuda Begum", "Civil Engineer at RDA", "Rajshahi, Bangladesh"},
	}
	alumni := make([]int64, len(alumniNames))
	for i, a := range alumniNames {
		dept := depts[i%len(depts)]
		program := dept.programs[i%len(dept.programs)]
		batch := program.batches[i%len(program.batches)]
		u := mustSeedUser(dbx, institutionID, passwordHash, seedUser{
			email: fmt.Sprintf("alumni%d@seed.test", i+1), fullName: a.name,
			phone: fmt.Sprintf("+88017000001%02d", i+1), roleID: models.RoleAlumni, status: models.StatusApproved,
		})
		alumni[i] = u
		if u != 0 {
			gradYear := batch.endYear
			_, _ = dbx.Exec(`INSERT INTO alumni_profiles (user_id, program_id, batch_id, graduation_year, current_location, current_designation, avatar_attachment_id, privacy_email, privacy_phone, privacy_whatsapp, privacy_location, privacy_company)
				VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0)`,
				u, program.id, batch.id, gradYear, a.location, a.designation, avatarID)
			_, _ = dbx.Exec(`INSERT INTO alumni_fts (rowid, full_name, bio, current_location, current_designation, company_names, skill_names)
				VALUES (?, ?, '', ?, ?, '', '')`, u, a.name, a.location, a.designation)
			created = append(created, describe("Alumni", u))
		}
	}

	studentNames := []string{"Arif Islam", "Nabila Haque", "Sabbir Hasan", "Tasnia Rahman", "Kamrul Islam", "Jannatul Ferdous"}
	students := make([]int64, len(studentNames))
	for i, name := range studentNames {
		dept := depts[i%len(depts)]
		program := dept.programs[i%len(dept.programs)]
		batch := program.batches[(i+1)%len(program.batches)]
		u := mustSeedUser(dbx, institutionID, passwordHash, seedUser{
			email: fmt.Sprintf("student%d@seed.test", i+1), fullName: name,
			phone: fmt.Sprintf("+88017000002%02d", i+1), roleID: models.RoleStudent, status: models.StatusApproved,
		})
		students[i] = u
		if u != 0 {
			_, _ = dbx.Exec(`INSERT INTO student_profiles (user_id, program_id, batch_id, current_location, avatar_attachment_id) VALUES (?, ?, ?, ?, ?)`,
				u, program.id, batch.id, "Dhaka, Bangladesh", avatarID)
			created = append(created, describe("Student", u))
		}
	}

	// A couple of accounts still awaiting approval, so the admin/moderator approval queue has
	// something to act on.
	pendingAlumni := mustSeedUser(dbx, institutionID, passwordHash, seedUser{
		email: "alumni.pending@seed.test", fullName: "Rakibul Hasan", phone: "+8801700000301",
		roleID: models.RoleAlumni, status: models.StatusPendingApproval,
	})
	if pendingAlumni != 0 {
		dept := depts[0]
		program := dept.programs[0]
		batch := program.batches[0]
		_, _ = dbx.Exec(`INSERT INTO alumni_profiles (user_id, program_id, batch_id, graduation_year, current_location, current_designation, avatar_attachment_id, privacy_email, privacy_phone, privacy_whatsapp, privacy_location, privacy_company)
			VALUES (?, ?, ?, ?, '', '', ?, 0, 0, 0, 0, 0)`, pendingAlumni, program.id, batch.id, batch.endYear, avatarID)
		created = append(created, describe("Alumni (pending approval)", pendingAlumni))
	}
	pendingStudent := mustSeedUser(dbx, institutionID, passwordHash, seedUser{
		email: "student.pending@seed.test", fullName: "Mim Akter", phone: "+8801700000302",
		roleID: models.RoleStudent, status: models.StatusPendingApproval,
	})
	if pendingStudent != 0 {
		dept := depts[0]
		program := dept.programs[0]
		batch := program.batches[0]
		_, _ = dbx.Exec(`INSERT INTO student_profiles (user_id, program_id, batch_id, avatar_attachment_id) VALUES (?, ?, ?, ?)`,
			pendingStudent, program.id, batch.id, avatarID)
		created = append(created, describe("Student (pending approval)", pendingStudent))
	}

	fmt.Println("Seeding committee (current + 10 previous terms)...")
	seedCommittees(dbx, institutionID, alumni)

	fmt.Println("Seeding businesses...")
	seedBusinesses(dbx, institutionID, alumni, avatarID)

	fmt.Println("Seeding job posts (named)...")
	seedJobs(dbx, institutionID, alumni, avatarID)

	fmt.Println("Seeding notices (named)...")
	seedNotices(dbx, institutionID, admin, avatarID)

	fmt.Println("Seeding events (named)...")
	seedEvents(dbx, institutionID, admin, avatarID)

	// Bulk data — at least 1000 alumni, 1000 students, 1000 job posts, 1000 notices, 100 events.
	// The handful of "named" records above stay realistic/featured (used by committees and
	// businesses); everything below tops each section up to the requested volume so pagination,
	// search, and perf can be exercised at scale. Bulk inserts try-and-skip-on-duplicate inside a
	// single transaction per section (fast, and safe to re-run without piling up duplicates,
	// since each section stops once it already has enough rows).
	fmt.Println("Seeding bulk alumni...")
	allAlumni := seedBulkAlumni(dbx, institutionID, passwordHash, depts, avatarID, 1000)
	fmt.Printf("  alumni total now >= %d\n", len(allAlumni))

	fmt.Println("Seeding bulk students...")
	bulkStudentCount := seedBulkStudents(dbx, institutionID, passwordHash, depts, avatarID, 1000)
	fmt.Printf("  students added this run: %d\n", bulkStudentCount)

	fmt.Println("Seeding bulk job posts...")
	seedBulkJobs(dbx, institutionID, allAlumni, 1000)

	fmt.Println("Seeding bulk notices...")
	seedBulkNotices(dbx, institutionID, admin2(dbx, institutionID, admin), 1000)

	fmt.Println("Seeding bulk events...")
	seedBulkEvents(dbx, institutionID, admin2(dbx, institutionID, admin), avatarID, 100)

	fmt.Println()
	fmt.Println("Done. Featured seeded accounts (all share the same password):")
	fmt.Println()
	for _, line := range created {
		fmt.Println("  " + line)
	}
	fmt.Println()
	fmt.Println("Plus ~1000 bulk alumni*@seed.test and ~1000 bulk student*@seed.test accounts (same password).")
	fmt.Printf("Password for every account above: %s\n", *password)
	_ = students
}

// admin2 resolves the admin user id even when this run skipped creating it (already existed
// from a prior run) — small helper so the bulk-content calls don't repeat the lookup inline.
func admin2(dbx *sqlx.DB, institutionID int64, adminID int64) int64 {
	if adminID != 0 {
		return adminID
	}
	var id int64
	_ = dbx.Get(&id, `SELECT id FROM users WHERE institution_id = ? AND email = 'admin1@seed.test'`, institutionID)
	return id
}

func describe(role string, userID int64) string {
	return fmt.Sprintf("%-32s user_id=%d", role, userID)
}

type seedUser struct {
	email, fullName, phone string
	roleID                 int64
	status                 string
	modScopeDeptID         *int64
}

// mustSeedUser inserts a user if the email doesn't already exist; returns 0 (not fatal) if it
// was already there, so re-running the seeder is a no-op for accounts created by a prior run.
func mustSeedUser(dbx *sqlx.DB, institutionID int64, passwordHash string, u seedUser) int64 {
	var existing int64
	if err := dbx.Get(&existing, `SELECT id FROM users WHERE institution_id = ? AND email = ?`, institutionID, u.email); err == nil {
		return 0
	}
	res, err := dbx.Exec(`INSERT INTO users (institution_id, role_id, full_name, email, phone, password_hash, status, moderator_scope_department_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		institutionID, u.roleID, u.fullName, u.email, u.phone, passwordHash, u.status, u.modScopeDeptID)
	if err != nil {
		log.Printf("seed user %s failed: %v", u.email, err)
		return 0
	}
	id, _ := res.LastInsertId()
	return id
}

// seedSharedAvatar puts one generated placeholder image into storage and returns its attachment
// id, reused as the avatar for every seeded member per the "same picture for everyone" request.
func seedSharedAvatar(dbx *sqlx.DB, store storage.Driver, institutionID int64) (int64, error) {
	const key = "seed/shared-avatar.png"

	img := image.NewRGBA(image.Rect(0, 0, 256, 256))
	bg := color.RGBA{79, 70, 229, 255}   // indigo
	fg := color.RGBA{255, 255, 255, 255} // white initial glyph background circle
	for y := 0; y < 256; y++ {
		for x := 0; x < 256; x++ {
			img.Set(x, y, bg)
		}
	}
	// simple centered circle so it reads as an avatar placeholder rather than a flat square
	cx, cy, r := 128, 100, 46
	for y := cy - r; y <= cy+r; y++ {
		for x := cx - r; x <= cx+r; x++ {
			dx, dy := x-cx, y-cy
			if dx*dx+dy*dy <= r*r {
				img.Set(x, y, fg)
			}
		}
	}
	// shoulders/body shape
	for y := 170; y < 256; y++ {
		for x := 40; x < 216; x++ {
			img.Set(x, y, fg)
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return 0, err
	}

	var existingID int64
	if err := dbx.Get(&existingID, `SELECT id FROM attachments WHERE storage_key = ?`, key); err == nil {
		return existingID, nil
	}

	if err := store.Put(context.Background(), key, bytes.NewReader(buf.Bytes()), "image/png", int64(buf.Len())); err != nil {
		return 0, err
	}
	res, err := dbx.Exec(`INSERT INTO attachments (institution_id, storage_key, original_filename, mime_type, size_bytes) VALUES (?, ?, 'seed-avatar.png', 'image/png', ?)`,
		institutionID, key, buf.Len())
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

type seedBatch struct {
	id                 int64
	startYear, endYear int
}

type seedProgram struct {
	id      int64
	batches []seedBatch
}

type seedDept struct {
	id       int64
	name     string
	programs []seedProgram
}

func seedTaxonomy(dbx *sqlx.DB, institutionID int64) []seedDept {
	specs := []struct {
		name, code, programName, degreeLevel string
	}{
		{"Computer Science and Engineering", "CSE", "B.Sc. in CSE", "Undergraduate"},
		{"Business Administration", "BBA", "BBA", "Undergraduate"},
		{"Electrical and Electronic Engineering", "EEE", "B.Sc. in EEE", "Undergraduate"},
	}
	years := [][2]int{{2014, 2018}, {2018, 2022}}

	var depts []seedDept
	for _, s := range specs {
		deptID := getOrCreate(dbx, `SELECT id FROM departments WHERE institution_id = ? AND name = ?`, []any{institutionID, s.name},
			`INSERT INTO departments (institution_id, name, code) VALUES (?, ?, ?)`, []any{institutionID, s.name, s.code})
		programID := getOrCreate(dbx, `SELECT id FROM programs WHERE department_id = ? AND name = ?`, []any{deptID, s.programName},
			`INSERT INTO programs (department_id, name, degree_level) VALUES (?, ?, ?)`, []any{deptID, s.programName, s.degreeLevel})

		var batches []seedBatch
		for _, y := range years {
			label := fmt.Sprintf("%d–%d", y[0], y[1])
			batchID := getOrCreate(dbx, `SELECT id FROM batches WHERE program_id = ? AND start_year = ? AND end_year = ?`, []any{programID, y[0], y[1]},
				`INSERT INTO batches (program_id, start_year, end_year, label) VALUES (?, ?, ?, ?)`, []any{programID, y[0], y[1], label})
			batches = append(batches, seedBatch{id: batchID, startYear: y[0], endYear: y[1]})
		}
		depts = append(depts, seedDept{id: deptID, name: s.name, programs: []seedProgram{{id: programID, batches: batches}}})
	}
	return depts
}

func getOrCreate(dbx *sqlx.DB, selectQ string, selectArgs []any, insertQ string, insertArgs []any) int64 {
	var id int64
	if err := dbx.Get(&id, selectQ, selectArgs...); err == nil {
		return id
	}
	res, err := dbx.Exec(insertQ, insertArgs...)
	if err != nil {
		log.Fatalf("seed taxonomy: %v", err)
	}
	id, _ = res.LastInsertId()
	return id
}

var (
	seedFirstNames = []string{
		"Abir", "Fahim", "Nusrat", "Rezaul", "Sadia", "Imran", "Farhana", "Shakil", "Mahmuda", "Arif",
		"Nabila", "Sabbir", "Tasnia", "Kamrul", "Jannatul", "Rakib", "Mim", "Tania", "Shuvo", "Nadia",
		"Rasel", "Priya", "Anik", "Lima", "Sohel", "Ruma", "Zahid", "Sultana", "Milon", "Shirin",
		"Iqbal", "Rina", "Habib", "Poly", "Yasin", "Shathi", "Mizan", "Rupa", "Bappy", "Moni",
	}
	seedLastNames = []string{
		"Rahman", "Ahmed", "Islam", "Hossain", "Chowdhury", "Khan", "Karim", "Akter", "Begum", "Hasan",
		"Uddin", "Alam", "Sarker", "Talukder", "Bhuiyan", "Mollah", "Sheikh", "Molla", "Miah", "Sultana",
	}
	seedDesignations = []string{
		"Software Engineer", "Product Manager", "Data Analyst", "Marketing Executive", "HR Specialist",
		"Business Analyst", "QA Engineer", "Graphic Designer", "Operations Manager", "Sales Executive",
		"Financial Analyst", "Project Coordinator", "UI/UX Designer", "DevOps Engineer", "Content Writer",
	}
	seedCompanies = []string{
		"Brain Station 23", "bKash", "Pathao", "Therap BD", "Grameenphone", "Robi Axiata", "Daraz",
		"Chaldal", "Shohoz", "Enosis Solutions", "Selise", "Optimizely BD", "Sheba.xyz", "Priyoshop", "Evaly",
	}
	seedLocations = []string{
		"Dhaka, Bangladesh", "Chittagong, Bangladesh", "Sylhet, Bangladesh", "Rajshahi, Bangladesh",
		"Khulna, Bangladesh", "Barisal, Bangladesh", "Rangpur, Bangladesh", "Mymensingh, Bangladesh",
	}
	seedEmploymentTypes = []string{"Full-time", "Part-time", "Internship", "Contract", "Remote"}
)

func seedGeneratedName(i int) string {
	first := seedFirstNames[i%len(seedFirstNames)]
	last := seedLastNames[(i/len(seedFirstNames))%len(seedLastNames)]
	return first + " " + last
}

// seedBulkAlumni tops up the alumni role to at least `target` total (existing + newly inserted).
// Skips work entirely once the institution already has enough — safe to re-run. Uses one
// transaction with try-insert-skip-on-duplicate (no per-row existence SELECT) for speed at
// scale; SQLite via database/sql keeps a transaction usable after a row-level constraint error,
// so a hit email/phone just gets skipped rather than aborting the whole batch.
func seedBulkAlumni(dbx *sqlx.DB, institutionID int64, passwordHash string, depts []seedDept, avatarID int64, target int) []int64 {
	var existing int
	_ = dbx.Get(&existing, `SELECT COUNT(*) FROM users WHERE institution_id = ? AND role_id = ?`, institutionID, models.RoleAlumni)
	need := target - existing
	if need <= 0 {
		var ids []int64
		_ = dbx.Select(&ids, `SELECT id FROM users WHERE institution_id = ? AND role_id = ?`, institutionID, models.RoleAlumni)
		return ids
	}

	tx, err := dbx.Beginx()
	if err != nil {
		log.Fatalf("seed bulk alumni: begin tx: %v", err)
	}
	defer tx.Rollback()

	var ids []int64
	inserted := 0
	for i := 1; inserted < need && i <= need*3; i++ {
		name := seedGeneratedName(i)
		email := fmt.Sprintf("alumni%d@seed.test", 100000+i)
		phone := fmt.Sprintf("+8802%08d", i)
		dept := depts[i%len(depts)]
		program := dept.programs[i%len(dept.programs)]
		batch := program.batches[i%len(program.batches)]

		res, err := tx.Exec(`INSERT INTO users (institution_id, role_id, full_name, email, phone, password_hash, status)
			VALUES (?, ?, ?, ?, ?, ?, 'approved')`,
			institutionID, models.RoleAlumni, name, email, phone, passwordHash)
		if err != nil {
			continue
		}
		userID, _ := res.LastInsertId()
		designation := seedDesignations[i%len(seedDesignations)] + " at " + seedCompanies[i%len(seedCompanies)]
		location := seedLocations[i%len(seedLocations)]
		_, _ = tx.Exec(`INSERT INTO alumni_profiles (user_id, program_id, batch_id, graduation_year, current_location, current_designation, avatar_attachment_id, privacy_email, privacy_phone, privacy_whatsapp, privacy_location, privacy_company)
			VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0)`,
			userID, program.id, batch.id, batch.endYear, location, designation, avatarID)
		_, _ = tx.Exec(`INSERT INTO alumni_fts (rowid, full_name, bio, current_location, current_designation, company_names, skill_names)
			VALUES (?, ?, '', ?, ?, '', '')`, userID, name, location, designation)

		ids = append(ids, userID)
		inserted++
	}
	if err := tx.Commit(); err != nil {
		log.Fatalf("seed bulk alumni: commit: %v", err)
	}

	var allIDs []int64
	_ = dbx.Select(&allIDs, `SELECT id FROM users WHERE institution_id = ? AND role_id = ?`, institutionID, models.RoleAlumni)
	return allIDs
}

// seedBulkStudents mirrors seedBulkAlumni for the student role. Returns how many rows this run
// actually inserted (not the running total — nothing downstream needs the full id list).
func seedBulkStudents(dbx *sqlx.DB, institutionID int64, passwordHash string, depts []seedDept, avatarID int64, target int) int {
	var existing int
	_ = dbx.Get(&existing, `SELECT COUNT(*) FROM users WHERE institution_id = ? AND role_id = ?`, institutionID, models.RoleStudent)
	need := target - existing
	if need <= 0 {
		return 0
	}

	tx, err := dbx.Beginx()
	if err != nil {
		log.Fatalf("seed bulk students: begin tx: %v", err)
	}
	defer tx.Rollback()

	inserted := 0
	for i := 1; inserted < need && i <= need*3; i++ {
		name := seedGeneratedName(i)
		email := fmt.Sprintf("student%d@seed.test", 100000+i)
		phone := fmt.Sprintf("+8803%08d", i)
		dept := depts[i%len(depts)]
		program := dept.programs[i%len(dept.programs)]
		batch := program.batches[(i+1)%len(program.batches)]

		res, err := tx.Exec(`INSERT INTO users (institution_id, role_id, full_name, email, phone, password_hash, status)
			VALUES (?, ?, ?, ?, ?, ?, 'approved')`,
			institutionID, models.RoleStudent, name, email, phone, passwordHash)
		if err != nil {
			continue
		}
		userID, _ := res.LastInsertId()
		_, _ = tx.Exec(`INSERT INTO student_profiles (user_id, program_id, batch_id, current_location, avatar_attachment_id) VALUES (?, ?, ?, ?, ?)`,
			userID, program.id, batch.id, seedLocations[i%len(seedLocations)], avatarID)
		inserted++
	}
	if err := tx.Commit(); err != nil {
		log.Fatalf("seed bulk students: commit: %v", err)
	}
	return inserted
}

// seedBulkJobs tops job_posts up to `target` total, posted by a rotating cast of the given
// alumni ids (so postedByUserId always resolves to a real, existing alumni account).
func seedBulkJobs(dbx *sqlx.DB, institutionID int64, alumniIDs []int64, target int) {
	if len(alumniIDs) == 0 {
		return
	}
	var existing int
	_ = dbx.Get(&existing, `SELECT COUNT(*) FROM job_posts WHERE institution_id = ?`, institutionID)
	need := target - existing
	if need <= 0 {
		return
	}

	tx, err := dbx.Beginx()
	if err != nil {
		log.Fatalf("seed bulk jobs: begin tx: %v", err)
	}
	defer tx.Rollback()

	for i := 1; i <= need; i++ {
		poster := alumniIDs[i%len(alumniIDs)]
		title := seedDesignations[i%len(seedDesignations)]
		company := seedCompanies[i%len(seedCompanies)]
		location := seedLocations[i%len(seedLocations)]
		employmentType := seedEmploymentTypes[i%len(seedEmploymentTypes)]
		description := fmt.Sprintf("We're hiring a %s to join our team in %s. Apply if you have relevant experience and are ready to make an impact.", title, location)
		salary := ""
		if i%3 == 0 {
			salary = fmt.Sprintf("BDT %d,000–%d,000/mo", 30+i%50, 60+i%80)
		}
		email := fmt.Sprintf("careers%d@seed-jobs.example.com", i)
		_, _ = tx.Exec(`INSERT INTO job_posts (institution_id, posted_by_user_id, title, company_name, location, employment_type, description, salary, apply_url, apply_email, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'published')`,
			institutionID, poster, title, company, location, employmentType, description, salary, email)
	}
	if err := tx.Commit(); err != nil {
		log.Fatalf("seed bulk jobs: commit: %v", err)
	}
}

// seedBulkNotices tops notices up to `target` total, alternating public/private and skewing
// importance toward "normal" (real institutions post far more routine notices than urgent ones).
func seedBulkNotices(dbx *sqlx.DB, institutionID int64, authorUserID int64, target int) {
	if authorUserID == 0 {
		return
	}
	var existing int
	_ = dbx.Get(&existing, `SELECT COUNT(*) FROM notices WHERE institution_id = ?`, institutionID)
	need := target - existing
	if need <= 0 {
		return
	}

	tx, err := dbx.Beginx()
	if err != nil {
		log.Fatalf("seed bulk notices: begin tx: %v", err)
	}
	defer tx.Rollback()

	topics := []string{
		"Scholarship applications open", "Library hours updated", "Career fair announcement",
		"Alumni newsletter published", "Volunteer opportunity", "Campus renovation update",
		"Sports tournament schedule", "Guest lecture series", "Research grant call", "Reunion planning committee",
	}
	for i := 1; i <= need; i++ {
		importance := "normal"
		if i%10 == 8 {
			importance = "important"
		} else if i%10 == 9 {
			importance = "urgent"
		}
		isPublic := i%2 == 0
		title := fmt.Sprintf("%s (#%d)", topics[i%len(topics)], i)
		body := fmt.Sprintf("This is a %s notice. %s", importance, topics[i%len(topics)])
		pinned := i%25 == 0
		_, _ = tx.Exec(`INSERT INTO notices (institution_id, author_user_id, title, body, importance, pinned, is_public)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			institutionID, authorUserID, title, body, importance, pinned, isPublic)
	}
	if err := tx.Commit(); err != nil {
		log.Fatalf("seed bulk notices: commit: %v", err)
	}
}

// seedBulkEvents tops events up to `target` total, spreading dates both before and after the
// seed run (past events exercise "completed" views, future ones exercise registration).
func seedBulkEvents(dbx *sqlx.DB, institutionID int64, creatorUserID int64, avatarID int64, target int) {
	if creatorUserID == 0 {
		return
	}
	var existing int
	_ = dbx.Get(&existing, `SELECT COUNT(*) FROM events WHERE institution_id = ?`, institutionID)
	need := target - existing
	if need <= 0 {
		return
	}

	titles := []string{
		"Career Workshop", "Alumni Networking Night", "Homecoming Celebration", "Guest Speaker Session",
		"Batch Reunion", "Charity Fundraiser", "Sports Meet", "Cultural Evening", "Startup Pitch Night", "Webinar Series",
	}
	venues := []string{"University Auditorium, Dhaka", "Campus Open Ground", "City Convention Hall", ""}

	tx, err := dbx.Beginx()
	if err != nil {
		log.Fatalf("seed bulk events: begin tx: %v", err)
	}
	defer tx.Rollback()

	for i := 1; i <= need; i++ {
		title := fmt.Sprintf("%s #%d", titles[i%len(titles)], i)
		monthOffset := i%24 - 12 // roughly half past, half future relative to seeding
		year, month := 2026, 1+((monthOffset%12)+12)%12
		if monthOffset < 0 {
			year--
		}
		day := 1 + i%27
		startAt := fmt.Sprintf("%04d-%02d-%02d 10:00:00", year, month, day)
		venue := venues[i%len(venues)]
		onlineURL := ""
		if venue == "" {
			onlineURL = fmt.Sprintf("https://meet.example.com/event-%d", i)
		}
		var coverID any
		if i%5 == 0 {
			coverID = avatarID
		}
		slug := fmt.Sprintf("%s-%d", slugifySeed(title), i)
		_, err := tx.Exec(`INSERT INTO events (institution_id, slug, title, description, cover_attachment_id, start_at, venue, online_url, created_by_user_id, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
			institutionID, slug, title, "Join us for "+title+".", coverID, startAt, venue, onlineURL, creatorUserID)
		if err != nil {
			continue
		}
	}
	if err := tx.Commit(); err != nil {
		log.Fatalf("seed bulk events: commit: %v", err)
	}
}

func seedCommittees(dbx *sqlx.DB, institutionID int64, alumni []int64) {
	if len(alumni) < 8 {
		return
	}

	var currentCommitteeID int64
	if err := dbx.Get(&currentCommitteeID, `SELECT id FROM committees WHERE institution_id = ? AND is_current = 1`, institutionID); err != nil {
		return
	}

	extraPositions := []struct {
		title string
		order int
	}{{"Vice President", 4}, {"Treasurer", 5}, {"Executive Member", 6}}
	for _, p := range extraPositions {
		getOrCreate(dbx, `SELECT id FROM committee_positions WHERE committee_id = ? AND title = ?`, []any{currentCommitteeID, p.title},
			`INSERT INTO committee_positions (committee_id, title, is_default_admin, sort_order) VALUES (?, ?, 0, ?)`, []any{currentCommitteeID, p.title, p.order})
	}

	var positions []struct {
		ID             int64  `db:"id"`
		Title          string `db:"title"`
		IsDefaultAdmin bool   `db:"is_default_admin"`
	}
	_ = dbx.Select(&positions, `SELECT id, title, is_default_admin FROM committee_positions WHERE committee_id = ? ORDER BY sort_order`, currentCommitteeID)

	assignment := map[string][]int64{
		"President":            {alumni[0]},
		"Secretary":            {alumni[1]},
		"Organizing Secretary": {alumni[2]},
		"Vice President":       {alumni[3]},
		"Treasurer":            {alumni[4]},
		"Executive Member":     {alumni[5], alumni[6]},
	}
	for _, pos := range positions {
		for _, userID := range assignment[pos.Title] {
			var already int
			_ = dbx.Get(&already, `SELECT COUNT(*) FROM committee_members WHERE committee_position_id = ? AND user_id = ?`, pos.ID, userID)
			if already > 0 {
				continue
			}
			_, _ = dbx.Exec(`INSERT INTO committee_members (committee_position_id, user_id) VALUES (?, ?)`, pos.ID, userID)
			if pos.IsDefaultAdmin {
				var role int64
				_ = dbx.Get(&role, `SELECT role_id FROM users WHERE id = ?`, userID)
				if role != models.RoleAdmin && role != models.RoleSuperAdmin {
					_, _ = dbx.Exec(`UPDATE users SET role_id = ? WHERE id = ?`, models.RoleAdmin, userID)
				}
			}
		}
	}

	// Previous terms — 10 of them, so the committee page's term switcher has real history to
	// browse. Terms run back-to-back 2-year blocks ending where the current term begins.
	currentYear := 0
	_ = dbx.Get(&currentYear, `SELECT term_start FROM committees WHERE id = ?`, currentCommitteeID)

	prevPositions := []struct {
		title string
		order int
	}{{"President", 1}, {"Secretary", 2}, {"Organizing Secretary", 3}}

	const numPreviousTerms = 10
	for k := 1; k <= numPreviousTerms; k++ {
		prevStart, prevEnd := currentYear-2*(k+1), currentYear-2*k

		var prevCommitteeID int64
		if err := dbx.Get(&prevCommitteeID, `SELECT id FROM committees WHERE institution_id = ? AND term_start = ?`, institutionID, prevStart); err == nil {
			continue // already seeded this term on a prior run
		}
		res, err := dbx.Exec(`INSERT INTO committees (institution_id, term_start, term_end, is_current) VALUES (?, ?, ?, 0)`, institutionID, prevStart, prevEnd)
		if err != nil {
			continue
		}
		prevCommitteeID, _ = res.LastInsertId()
		for _, p := range prevPositions {
			pres, err := dbx.Exec(`INSERT INTO committee_positions (committee_id, title, is_default_admin, sort_order) VALUES (?, ?, 1, ?)`, prevCommitteeID, p.title, p.order)
			if err != nil {
				continue
			}
			posID, _ := pres.LastInsertId()
			member := alumni[(k+p.order)%len(alumni)]
			_, _ = dbx.Exec(`INSERT INTO committee_members (committee_position_id, user_id) VALUES (?, ?)`, posID, member)
		}
	}
}

func seedBusinesses(dbx *sqlx.DB, institutionID int64, alumni []int64, avatarID int64) {
	if len(alumni) < 3 {
		return
	}
	businesses := []struct {
		owner                                          int64
		name, category, description, location, website string
		contactPhone, contactEmail                     string
	}{
		{alumni[0], "Chowdhury IT Solutions", "Software Consulting", "Custom web and mobile app development for local businesses.", "Dhaka, Bangladesh", "https://chowdhuryit.example.com", "+8801800000001", "hello@chowdhuryit.example.com"},
		{alumni[1], "Jahan Design Studio", "Graphic & Product Design", "Branding, UI/UX, and print design studio run by alumni.", "Dhaka, Bangladesh", "https://jahandesign.example.com", "+8801800000002", "studio@jahandesign.example.com"},
		{alumni[6], "Ahmed Trading Co.", "Import & Export", "Wholesale trading of electronics and home appliances.", "Sylhet, Bangladesh", "", "+8801800000003", "sales@ahmedtrading.example.com"},
	}
	for _, b := range businesses {
		var existing int
		_ = dbx.Get(&existing, `SELECT COUNT(*) FROM businesses WHERE institution_id = ? AND name = ?`, institutionID, b.name)
		if existing > 0 {
			continue
		}
		_, _ = dbx.Exec(`INSERT INTO businesses (institution_id, owner_user_id, name, category, description, location, website, contact_phone, contact_email, logo_attachment_id, social_links, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 'published')`,
			institutionID, b.owner, b.name, b.category, b.description, b.location, b.website, b.contactPhone, b.contactEmail, avatarID)
	}
}

func seedJobs(dbx *sqlx.DB, institutionID int64, alumni []int64, avatarID int64) {
	if len(alumni) < 8 {
		return
	}
	jobs := []struct {
		postedBy                                                      int64
		title, company, location, employmentType, description, salary string
		applyEmail                                                    string
		withImage                                                     bool
	}{
		{alumni[0], "Backend Engineer (Go)", "Brain Station 23", "Dhaka, Bangladesh", "Full-time", "Looking for a Go engineer to join our fintech platform team.", "BDT 80,000–120,000/mo", "careers@brainstation23.example.com", true},
		{alumni[2], "Data Analyst Intern", "Pathao", "Dhaka, Bangladesh", "Internship", "3-month internship analyzing rider and delivery data.", "", "internships@pathao.example.com", false},
		{alumni[4], "Frontend Developer (React)", "Therap BD", "Dhaka, Bangladesh", "Full-time", "Build accessible healthcare software used across the US.", "BDT 70,000–100,000/mo", "jobs@therapbd.example.com", false},
		{alumni[6], "Accounts Executive", "Ahmed Trading Co.", "Sylhet, Bangladesh", "Full-time", "Manage day-to-day accounts and vendor payments for a trading company.", "BDT 35,000–45,000/mo", "hr@ahmedtrading.example.com", false},
	}
	for _, j := range jobs {
		var existing int
		_ = dbx.Get(&existing, `SELECT COUNT(*) FROM job_posts WHERE institution_id = ? AND title = ? AND company_name = ?`, institutionID, j.title, j.company)
		if existing > 0 {
			continue
		}
		var imageID any
		if j.withImage {
			imageID = avatarID
		}
		_, _ = dbx.Exec(`INSERT INTO job_posts (institution_id, posted_by_user_id, title, company_name, location, employment_type, description, salary, apply_url, apply_email, image_attachment_id, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, 'published')`,
			institutionID, j.postedBy, j.title, j.company, j.location, j.employmentType, j.description, j.salary, j.applyEmail, imageID)
	}
}

func seedEvents(dbx *sqlx.DB, institutionID int64, adminUserID int64, avatarID int64) {
	if adminUserID == 0 {
		_ = dbx.Get(&adminUserID, `SELECT id FROM users WHERE institution_id = ? AND email = 'admin1@seed.test'`, institutionID)
		if adminUserID == 0 {
			return
		}
	}
	events := []struct {
		title, description, venue, onlineURL, startAt, endAt, regDeadline string
		capacity                                                          *int
		withCover                                                         bool
	}{
		{"Annual Alumni Meet 2026", "A full-day reunion with dinner, awards, and networking for alumni across all batches.", "University Auditorium, Dhaka", "", "2026-12-12 10:00:00", "2026-12-12 18:00:00", "2026-12-05 23:59:59", intPtr(300), true},
		{"Tech Talk: Careers in AI", "Panel discussion with alumni working in AI/ML at leading tech companies.", "", "https://meet.example.com/tech-talk-ai", "2026-09-20 19:00:00", "2026-09-20 21:00:00", "2026-09-19 23:59:59", nil, false},
		{"Freshers' Welcome 2026", "Welcoming this year's new batch with orientation and an alumni mentorship kickoff.", "Campus Open Ground", "", "2026-06-05 16:00:00", "2026-06-05 19:00:00", "", intPtr(500), false},
		{"Regional Alumni Chapter — Sylhet", "Informal meetup for alumni based in and around Sylhet.", "Sylhet City Club", "", "2026-07-18 17:00:00", "", "", nil, false},
	}
	for _, e := range events {
		var existing int
		_ = dbx.Get(&existing, `SELECT COUNT(*) FROM events WHERE institution_id = ? AND title = ?`, institutionID, e.title)
		if existing > 0 {
			continue
		}
		var coverID, endAt, regDeadline any
		if e.withCover {
			coverID = avatarID
		}
		if e.endAt != "" {
			endAt = e.endAt
		}
		if e.regDeadline != "" {
			regDeadline = e.regDeadline
		}
		slug := slugifySeed(e.title)
		var slugExists bool
		_ = dbx.Get(&slugExists, `SELECT EXISTS(SELECT 1 FROM events WHERE slug = ?)`, slug)
		if slugExists {
			slug = slug + "-" + fmt.Sprint(institutionID)
		}
		_, err := dbx.Exec(`INSERT INTO events (institution_id, slug, title, description, cover_attachment_id, start_at, end_at, venue, online_url, registration_deadline, capacity, created_by_user_id, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
			institutionID, slug, e.title, e.description, coverID, e.startAt, endAt, e.venue, e.onlineURL, regDeadline, e.capacity, adminUserID)
		if err != nil {
			log.Printf("seed event %s failed: %v", e.title, err)
		}
	}
}

func slugifySeed(title string) string {
	var b []byte
	lastDash := false
	for _, r := range title {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b = append(b, byte(r))
			lastDash = false
		case r >= 'A' && r <= 'Z':
			b = append(b, byte(r-'A'+'a'))
			lastDash = false
		default:
			if !lastDash && len(b) > 0 {
				b = append(b, '-')
				lastDash = true
			}
		}
	}
	for len(b) > 0 && b[len(b)-1] == '-' {
		b = b[:len(b)-1]
	}
	return string(b)
}

func intPtr(v int) *int { return &v }

func seedNotices(dbx *sqlx.DB, institutionID int64, adminUserID int64, avatarID int64) {
	if adminUserID == 0 {
		// Admin already existed from a prior run — look it up so notices still get an author.
		_ = dbx.Get(&adminUserID, `SELECT id FROM users WHERE institution_id = ? AND email = 'admin1@seed.test'`, institutionID)
		if adminUserID == 0 {
			return
		}
	}
	notices := []struct {
		title, body, importance string
		pinned, isPublic        bool
		withImage               bool
	}{
		{"Welcome to the new Alumni Portal", "We're excited to launch the redesigned alumni portal — explore the directory, jobs board, and business directory.", "normal", true, true, true},
		{"Annual Alumni Meet 2026 — Save the Date", "Mark your calendars for the annual alumni gathering. Details and registration coming soon.", "important", true, true, false},
		{"Members-only: Mentorship Program Applications Open", "Approved alumni and students can now apply to the peer mentorship program. Visible only to logged-in members.", "normal", false, false, false},
		{"Urgent: Portal Maintenance This Weekend", "The portal will be briefly unavailable this weekend for scheduled maintenance. Visible only to logged-in members.", "urgent", false, false, false},
	}
	for _, n := range notices {
		var existing int
		_ = dbx.Get(&existing, `SELECT COUNT(*) FROM notices WHERE institution_id = ? AND title = ?`, institutionID, n.title)
		if existing > 0 {
			continue
		}
		var imageID any
		if n.withImage {
			imageID = avatarID
		}
		_, _ = dbx.Exec(`INSERT INTO notices (institution_id, author_user_id, title, body, importance, pinned, is_public, image_attachment_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			institutionID, adminUserID, n.title, n.body, n.importance, n.pinned, n.isPublic, imageID)
	}
}
