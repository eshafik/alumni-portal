package handlers

import (
	"net/http"
	"strings"

	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/storage"
)

type StudentHandler struct {
	DB      *sqlx.DB
	Storage storage.Driver
}

type studentDirectoryRow struct {
	UserID             int64  `db:"user_id" json:"userId"`
	FullName           string `db:"full_name" json:"fullName"`
	AvatarAttachmentID *int64 `db:"avatar_attachment_id" json:"avatarAttachmentId,omitempty"`
	AvatarURL          string `db:"-" json:"avatarUrl,omitempty"`
	BatchLabel         string `db:"batch_label" json:"batchLabel"`
	ProgramName        string `db:"program_name" json:"programName"`
	DepartmentName     string `db:"department_name" json:"departmentName"`
	BloodGroupName     string `db:"blood_group_name" json:"bloodGroupName"`
	StudentID          string `db:"student_id" json:"studentId,omitempty"`
}

// List returns current (non-converted) students only, paginated. View-only data — no
// mutation endpoints exist for viewers, matching the spec's "students are view-only" rule.
func (h *StudentHandler) List(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	batchID := r.URL.Query().Get("batchId")
	departmentID := r.URL.Query().Get("departmentId")
	bloodGroupID := r.URL.Query().Get("bloodGroupId")
	pg := httpx.ParsePagination(r)

	baseFrom := `FROM student_profiles sp
		JOIN users u ON u.id = sp.user_id
		JOIN batches b ON b.id = sp.batch_id
		JOIN programs pr ON pr.id = sp.program_id
		JOIN departments d ON d.id = pr.department_id
		LEFT JOIN blood_groups bg ON bg.id = sp.blood_group_id`

	where := []string{"u.status = 'approved'", "sp.status = 'active'"}
	args := []any{}
	if q != "" {
		where = append(where, "u.id IN (SELECT rowid FROM students_fts WHERE students_fts MATCH ?)")
		args = append(args, sanitizeFTSQuery(q))
	}
	if batchID != "" {
		where = append(where, "sp.batch_id = ?")
		args = append(args, batchID)
	}
	if departmentID != "" {
		where = append(where, "d.id = ?")
		args = append(args, departmentID)
	}
	if bloodGroupID != "" {
		where = append(where, "sp.blood_group_id = ?")
		args = append(args, bloodGroupID)
	}
	whereSQL := "WHERE " + strings.Join(where, " AND ")

	var total int
	_ = h.DB.Get(&total, "SELECT COUNT(*) "+baseFrom+" "+whereSQL, args...)

	rows := []studentDirectoryRow{}
	selectQuery := `SELECT u.id AS user_id, u.full_name, sp.avatar_attachment_id,
		b.label AS batch_label, pr.name AS program_name, d.name AS department_name,
		COALESCE(bg.name, '') AS blood_group_name, u.student_id
		` + baseFrom + " " + whereSQL + ` ORDER BY b.sort_order ASC, u.id ASC LIMIT ? OFFSET ?`
	pagedArgs := append(append([]any{}, args...), pg.PageSize, pg.Offset)
	if err := h.DB.Select(&rows, selectQuery, pagedArgs...); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	for i := range rows {
		rows[i].AvatarURL = attachmentURL(h.DB, h.Storage, rows[i].AvatarAttachmentID)
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: rows, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

type studentMeResponse struct {
	FullName           string `db:"full_name" json:"fullName"`
	Phone              string `db:"phone" json:"phone"`
	CurrentLocation    string `db:"current_location" json:"currentLocation"`
	BloodGroupID       *int64 `db:"blood_group_id" json:"bloodGroupId,omitempty"`
	AvatarAttachmentID *int64 `db:"avatar_attachment_id" json:"avatarAttachmentId,omitempty"`
	AvatarURL          string `db:"-" json:"avatarUrl,omitempty"`
	StudentID          string `db:"student_id" json:"studentId"`
}

// GetMe returns the caller's own student profile, used to prefill the profile edit form.
func (h *StudentHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	if u == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var resp studentMeResponse
	err := h.DB.Get(&resp, `SELECT u.full_name, u.phone, u.student_id, sp.current_location, sp.blood_group_id, sp.avatar_attachment_id
		FROM student_profiles sp JOIN users u ON u.id = sp.user_id WHERE sp.user_id = ?`, u.ID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "profile not found")
		return
	}
	resp.AvatarURL = attachmentURL(h.DB, h.Storage, resp.AvatarAttachmentID)
	httpx.JSON(w, http.StatusOK, resp)
}

type updateStudentProfileRequest struct {
	FullName           string `json:"fullName"`
	Phone              string `json:"phone"`
	BloodGroupID       *int64 `json:"bloodGroupId"`
	AvatarAttachmentID *int64 `json:"avatarAttachmentId"`
	CurrentLocation    string `json:"currentLocation"`
	StudentID          string `json:"studentId"`
}

// UpdateMe accepts everything about the caller's own profile except email — same rule as
// AlumniHandler.UpdateMe (email is never part of this DTO).
func (h *StudentHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	if u == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var req updateStudentProfileRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.FullName == "" {
		httpx.Error(w, http.StatusBadRequest, "full name is required")
		return
	}
	if req.Phone == "" {
		// See AlumniHandler.UpdateMe for why this can't be allowed to go blank: users.phone
		// has a UNIQUE(institution_id, phone) constraint that a blank value would collide on.
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

	if _, err := h.DB.Exec(`UPDATE users SET full_name = ?, phone = ?, student_id = ?, updated_at = datetime('now') WHERE id = ?`,
		req.FullName, req.Phone, req.StudentID, u.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}

	_, err := h.DB.Exec(`UPDATE student_profiles SET blood_group_id = ?, avatar_attachment_id = ?, current_location = ?, updated_at = datetime('now') WHERE user_id = ?`,
		req.BloodGroupID, req.AvatarAttachmentID, req.CurrentLocation, u.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	syncStudentFTS(h.DB, u.ID)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "profile updated"})
}
