package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/storage"
)

type AlumniHandler struct {
	DB      *sqlx.DB
	Storage storage.Driver
}

type alumniDirectoryRow struct {
	UserID             int64   `db:"user_id" json:"userId"`
	FullName           string  `db:"full_name" json:"fullName"`
	AvatarAttachmentID *int64  `db:"avatar_attachment_id" json:"avatarAttachmentId,omitempty"`
	AvatarURL          string  `db:"-" json:"avatarUrl,omitempty"`
	BatchLabel         string  `db:"batch_label" json:"batchLabel"`
	ProgramName        string  `db:"program_name" json:"programName"`
	DepartmentName     string  `db:"department_name" json:"departmentName"`
	CurrentDesignation string  `db:"current_designation" json:"currentDesignation"`
	CurrentLocation    *string `db:"current_location_out" json:"currentLocation,omitempty"`
	CompanyName        *string `db:"company_name_out" json:"companyName,omitempty"`
	BloodGroupName     string  `db:"blood_group_name" json:"bloodGroupName"`
}

// List implements the alumni directory search: FTS5 full-text query plus structured filters,
// pagination, and server-side privacy filtering (private fields simply aren't selected when
// the owner has opted out — never sent to the client to filter client-side).
func (h *AlumniHandler) List(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	batchID := r.URL.Query().Get("batchId")
	departmentID := r.URL.Query().Get("departmentId")
	programID := r.URL.Query().Get("programId")
	location := r.URL.Query().Get("location")
	company := r.URL.Query().Get("company")
	bloodGroupID := r.URL.Query().Get("bloodGroupId")
	skill := r.URL.Query().Get("skill")
	pg := httpx.ParsePagination(r)

	baseFrom := `FROM alumni_profiles ap
		JOIN users u ON u.id = ap.user_id
		JOIN batches b ON b.id = ap.batch_id
		JOIN programs pr ON pr.id = ap.program_id
		JOIN departments d ON d.id = pr.department_id
		LEFT JOIN blood_groups bg ON bg.id = ap.blood_group_id
		LEFT JOIN companies c ON c.id = (
			SELECT eh.company_id FROM employment_history eh
			WHERE eh.alumni_profile_id = ap.id AND eh.is_current = 1 LIMIT 1
		)`

	where := []string{"u.status = 'approved'"}
	args := []any{}

	if q != "" {
		where = append(where, `ap.user_id IN (SELECT rowid FROM alumni_fts WHERE alumni_fts MATCH ?)`)
		args = append(args, sanitizeFTSQuery(q))
	}
	if batchID != "" {
		where = append(where, "ap.batch_id = ?")
		args = append(args, batchID)
	}
	if departmentID != "" {
		where = append(where, "d.id = ?")
		args = append(args, departmentID)
	}
	if programID != "" {
		where = append(where, "ap.program_id = ?")
		args = append(args, programID)
	}
	if location != "" {
		where = append(where, "ap.current_location LIKE ? AND ap.privacy_location = 1")
		args = append(args, "%"+location+"%")
	}
	if company != "" {
		where = append(where, "c.name LIKE ? AND ap.privacy_company = 1")
		args = append(args, "%"+company+"%")
	}
	if bloodGroupID != "" {
		where = append(where, "ap.blood_group_id = ?")
		args = append(args, bloodGroupID)
	}
	if skill != "" {
		where = append(where, `ap.id IN (SELECT alumni_profile_id FROM alumni_skills sk JOIN skills s ON s.id = sk.skill_id WHERE s.name LIKE ?)`)
		args = append(args, "%"+skill+"%")
	}

	whereSQL := "WHERE " + strings.Join(where, " AND ")

	var total int
	countQuery := "SELECT COUNT(*) " + baseFrom + " " + whereSQL
	if err := h.DB.Get(&total, countQuery, args...); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "search failed")
		return
	}

	selectQuery := `SELECT
		u.id AS user_id, u.full_name,
		ap.avatar_attachment_id,
		b.label AS batch_label, pr.name AS program_name, d.name AS department_name,
		ap.current_designation,
		CASE WHEN ap.privacy_location = 1 THEN ap.current_location ELSE NULL END AS current_location_out,
		CASE WHEN ap.privacy_company = 1 THEN c.name ELSE NULL END AS company_name_out,
		COALESCE(bg.name, '') AS blood_group_name
		` + baseFrom + " " + whereSQL + " ORDER BY b.sort_order ASC, u.id ASC LIMIT ? OFFSET ?"
	pagedArgs := append(append([]any{}, args...), pg.PageSize, pg.Offset)

	rows := []alumniDirectoryRow{}
	if err := h.DB.Select(&rows, selectQuery, pagedArgs...); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "search failed")
		return
	}
	for i := range rows {
		rows[i].AvatarURL = attachmentURL(h.DB, h.Storage, rows[i].AvatarAttachmentID)
	}

	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: rows, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

// sanitizeFTSQuery strips FTS5 special syntax characters so user search input can't be used
// to construct arbitrary MATCH query expressions; wraps terms for a simple prefix match.
func sanitizeFTSQuery(q string) string {
	fields := strings.Fields(q)
	out := make([]string, 0, len(fields))
	replacer := strings.NewReplacer(`"`, "", "*", "", ":", "", "(", "", ")", "")
	for _, f := range fields {
		clean := replacer.Replace(f)
		if clean != "" {
			out = append(out, fmt.Sprintf(`"%s"*`, clean))
		}
	}
	if len(out) == 0 {
		return `""`
	}
	return strings.Join(out, " ")
}

type alumniProfileDetail struct {
	UserID             int64   `db:"user_id" json:"userId"`
	FullName           string  `db:"full_name" json:"fullName"`
	AvatarAttachmentID *int64  `db:"avatar_attachment_id" json:"avatarAttachmentId,omitempty"`
	AvatarURL          string  `db:"-" json:"avatarUrl,omitempty"`
	Bio                string  `db:"bio" json:"bio"`
	BatchLabel         string  `db:"batch_label" json:"batchLabel"`
	ProgramName        string  `db:"program_name" json:"programName"`
	DepartmentName     string  `db:"department_name" json:"departmentName"`
	CurrentDesignation string  `db:"current_designation" json:"currentDesignation"`
	CompanyName        string  `db:"company_name" json:"companyName,omitempty"`
	BloodGroupName     string  `db:"blood_group_name" json:"bloodGroupName"`
	LinkedinURL        string  `db:"linkedin_url" json:"linkedinUrl"`
	WebsiteURL         string  `db:"website_url" json:"websiteUrl"`
	Email              *string `db:"email_out" json:"email,omitempty"`
	Phone              *string `db:"phone_out" json:"phone,omitempty"`
	Whatsapp           *string `db:"whatsapp_out" json:"whatsapp,omitempty"`
	CurrentLocation    *string `db:"current_location_out" json:"currentLocation,omitempty"`
	SkillNames         string  `db:"skill_names" json:"skillNames,omitempty"`
	PassingYear        *int64  `db:"passing_year" json:"passingYear,omitempty"`
	StudentID          string  `db:"student_id" json:"studentId,omitempty"`
}

func (h *AlumniHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var p alumniProfileDetail
	err = h.DB.Get(&p, `SELECT
		u.id AS user_id, u.full_name, u.passing_year, u.student_id, ap.avatar_attachment_id, ap.bio,
		b.label AS batch_label, pr.name AS program_name, d.name AS department_name,
		ap.current_designation, ap.linkedin_url, ap.website_url,
		COALESCE(bg.name, '') AS blood_group_name,
		COALESCE((CASE WHEN ap.privacy_company = 1 THEN c.name ELSE NULL END), '') AS company_name,
		CASE WHEN ap.privacy_email = 1 THEN u.email ELSE NULL END AS email_out,
		CASE WHEN ap.privacy_phone = 1 THEN u.phone ELSE NULL END AS phone_out,
		CASE WHEN ap.privacy_whatsapp = 1 THEN ap.whatsapp_number ELSE NULL END AS whatsapp_out,
		CASE WHEN ap.privacy_location = 1 THEN ap.current_location ELSE NULL END AS current_location_out,
		COALESCE((SELECT GROUP_CONCAT(DISTINCT s.name) FROM alumni_skills ask
			JOIN skills s ON s.id = ask.skill_id WHERE ask.alumni_profile_id = ap.id), '') AS skill_names
		FROM alumni_profiles ap
		JOIN users u ON u.id = ap.user_id
		JOIN batches b ON b.id = ap.batch_id
		JOIN programs pr ON pr.id = ap.program_id
		JOIN departments d ON d.id = pr.department_id
		LEFT JOIN blood_groups bg ON bg.id = ap.blood_group_id
		LEFT JOIN companies c ON c.id = (
			SELECT eh.company_id FROM employment_history eh
			WHERE eh.alumni_profile_id = ap.id AND eh.is_current = 1 LIMIT 1
		)
		WHERE u.id = ? AND u.status = 'approved'`, id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "profile not found")
		return
	}
	p.AvatarURL = attachmentURL(h.DB, h.Storage, p.AvatarAttachmentID)
	httpx.JSON(w, http.StatusOK, p)
}

type alumniMeResponse struct {
	FullName           string `db:"full_name" json:"fullName"`
	Phone              string `db:"phone" json:"phone"`
	Bio                string `db:"bio" json:"bio"`
	CurrentDesignation string `db:"current_designation" json:"currentDesignation"`
	CurrentCompanyName string `db:"current_company_name" json:"currentCompanyName"`
	CurrentLocation    string `db:"current_location" json:"currentLocation"`
	BloodGroupID       *int64 `db:"blood_group_id" json:"bloodGroupId,omitempty"`
	AvatarAttachmentID *int64 `db:"avatar_attachment_id" json:"avatarAttachmentId,omitempty"`
	AvatarURL          string `db:"-" json:"avatarUrl,omitempty"`
	LinkedinURL        string `db:"linkedin_url" json:"linkedinUrl"`
	WhatsappNumber     string `db:"whatsapp_number" json:"whatsappNumber"`
	WebsiteURL         string `db:"website_url" json:"websiteUrl"`
	PrivacyEmail       bool   `db:"privacy_email" json:"privacyEmail"`
	PrivacyPhone       bool   `db:"privacy_phone" json:"privacyPhone"`
	PrivacyWhatsapp    bool   `db:"privacy_whatsapp" json:"privacyWhatsapp"`
	PrivacyLocation    bool   `db:"privacy_location" json:"privacyLocation"`
	PrivacyCompany     bool   `db:"privacy_company" json:"privacyCompany"`
	PassingYear        *int64 `db:"passing_year" json:"passingYear,omitempty"`
	StudentID          string `db:"student_id" json:"studentId"`
}

// GetMe returns the caller's own profile completely unfiltered by privacy flags — those
// flags control what OTHER members see (AlumniHandler.Get), not what the owner sees of
// themselves. Used to prefill the profile edit form so saving never blanks out a field the
// form didn't know about.
func (h *AlumniHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	if u == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var resp alumniMeResponse
	err := h.DB.Get(&resp, `SELECT
		u.full_name, u.phone, u.passing_year, u.student_id, ap.bio, ap.current_designation, ap.current_location, ap.blood_group_id,
		ap.avatar_attachment_id,
		ap.linkedin_url, ap.whatsapp_number, ap.website_url,
		ap.privacy_email, ap.privacy_phone, ap.privacy_whatsapp, ap.privacy_location, ap.privacy_company,
		COALESCE(c.name, '') AS current_company_name
		FROM alumni_profiles ap
		JOIN users u ON u.id = ap.user_id
		LEFT JOIN companies c ON c.id = (
			SELECT eh.company_id FROM employment_history eh
			WHERE eh.alumni_profile_id = ap.id AND eh.is_current = 1 LIMIT 1
		)
		WHERE ap.user_id = ?`, u.ID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "profile not found")
		return
	}
	resp.AvatarURL = attachmentURL(h.DB, h.Storage, resp.AvatarAttachmentID)
	httpx.JSON(w, http.StatusOK, resp)
}

type updateAlumniProfileRequest struct {
	FullName           string `json:"fullName"`
	Phone              string `json:"phone"`
	Bio                string `json:"bio"`
	CurrentDesignation string `json:"currentDesignation"`
	CurrentCompanyName string `json:"currentCompanyName"`
	CurrentLocation    string `json:"currentLocation"`
	BloodGroupID       *int64 `json:"bloodGroupId"`
	AvatarAttachmentID *int64 `json:"avatarAttachmentId"`
	LinkedinURL        string `json:"linkedinUrl"`
	WhatsappNumber     string `json:"whatsappNumber"`
	WebsiteURL         string `json:"websiteUrl"`
	PrivacyEmail       bool   `json:"privacyEmail"`
	PrivacyPhone       bool   `json:"privacyPhone"`
	PrivacyWhatsapp    bool   `json:"privacyWhatsapp"`
	PrivacyLocation    bool   `json:"privacyLocation"`
	PrivacyCompany     bool   `json:"privacyCompany"`
	PassingYear        *int64 `json:"passingYear"`
	StudentID          string `json:"studentId"`
}

// UpdateMe accepts everything about the caller's own profile except email — email is never
// part of this DTO, so no code path here can change it, per product decision.
func (h *AlumniHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	if u == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var req updateAlumniProfileRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.FullName == "" {
		httpx.Error(w, http.StatusBadRequest, "full name is required")
		return
	}
	if req.Phone == "" {
		// users.phone has a UNIQUE(institution_id, phone) constraint — allowing it to be
		// cleared to "" would let at most one user per institution have a blank phone before
		// every subsequent blank-phone save hits that constraint as a raw, confusing 500.
		// Simpler and consistent with signup (where phone is already required): never allow it.
		httpx.Error(w, http.StatusBadRequest, "phone is required")
		return
	}

	var conflictCount int
	_ = h.DB.Get(&conflictCount, `SELECT COUNT(*) FROM users WHERE institution_id = ? AND phone = ? AND id != ?`,
		u.InstitutionID, req.Phone, u.ID)
	if conflictCount > 0 {
		httpx.Error(w, http.StatusConflict, "phone number already in use")
		return
	}

	if _, err := h.DB.Exec(`UPDATE users SET full_name = ?, phone = ?, passing_year = ?, student_id = ?, updated_at = datetime('now') WHERE id = ?`,
		req.FullName, req.Phone, req.PassingYear, req.StudentID, u.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}

	_, err := h.DB.Exec(`UPDATE alumni_profiles SET
		bio = ?, current_designation = ?, current_location = ?, blood_group_id = ?, avatar_attachment_id = ?,
		linkedin_url = ?, whatsapp_number = ?, website_url = ?,
		privacy_email = ?, privacy_phone = ?, privacy_whatsapp = ?, privacy_location = ?, privacy_company = ?,
		updated_at = datetime('now')
		WHERE user_id = ?`,
		req.Bio, req.CurrentDesignation, req.CurrentLocation, req.BloodGroupID, req.AvatarAttachmentID,
		req.LinkedinURL, req.WhatsappNumber, req.WebsiteURL,
		req.PrivacyEmail, req.PrivacyPhone, req.PrivacyWhatsapp, req.PrivacyLocation, req.PrivacyCompany,
		u.ID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}

	var alumniProfileID int64
	if err := h.DB.Get(&alumniProfileID, `SELECT id FROM alumni_profiles WHERE user_id = ?`, u.ID); err == nil {
		if err := upsertCurrentEmployment(h.DB, alumniProfileID, req.CurrentDesignation, req.CurrentCompanyName); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "update failed")
			return
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}

	syncAlumniFTS(h.DB, u.ID)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "profile updated"})
}

// syncAlumniFTS rebuilds the FTS5 row for a single alumni profile. Called after any write
// that touches searchable fields (profile edit, employment history, skills).
func syncAlumniFTS(db *sqlx.DB, userID int64) {
	var row struct {
		FullName        string `db:"full_name"`
		Bio             string `db:"bio"`
		CurrentLocation string `db:"current_location"`
		Designation     string `db:"current_designation"`
	}
	if err := db.Get(&row, `SELECT u.full_name, ap.bio, ap.current_location, ap.current_designation
		FROM alumni_profiles ap JOIN users u ON u.id = ap.user_id WHERE ap.user_id = ?`, userID); err != nil {
		return
	}
	var companyNames, skillNames string
	_ = db.Get(&companyNames, `SELECT COALESCE(GROUP_CONCAT(DISTINCT c.name), '') FROM employment_history eh
		JOIN companies c ON c.id = eh.company_id JOIN alumni_profiles ap ON ap.id = eh.alumni_profile_id
		WHERE ap.user_id = ?`, userID)
	_ = db.Get(&skillNames, `SELECT COALESCE(GROUP_CONCAT(DISTINCT s.name), '') FROM alumni_skills ask
		JOIN skills s ON s.id = ask.skill_id JOIN alumni_profiles ap ON ap.id = ask.alumni_profile_id
		WHERE ap.user_id = ?`, userID)

	_, _ = db.Exec(`DELETE FROM alumni_fts WHERE rowid = ?`, userID)
	_, _ = db.Exec(`INSERT INTO alumni_fts (rowid, full_name, bio, current_location, current_designation, company_names, skill_names)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		userID, row.FullName, row.Bio, row.CurrentLocation, row.Designation, companyNames, skillNames)
}
