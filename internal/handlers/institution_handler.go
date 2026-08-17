package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/audit"
	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/models"
	"alumni-portal/internal/storage"
)

type InstitutionHandler struct {
	DB       *sqlx.DB
	Storage  storage.Driver
	Timezone string
}

type institutionResponse struct {
	models.Institution
	LogoURL    string `json:"logoUrl,omitempty"`
	FaviconURL string `json:"faviconUrl,omitempty"`
}

// GetInstitution returns public institution branding/config plus lightweight community stats.
func (h *InstitutionHandler) GetInstitution(w http.ResponseWriter, r *http.Request) {
	var inst models.Institution
	if err := h.DB.Get(&inst, `SELECT * FROM institutions LIMIT 1`); err != nil {
		httpx.Error(w, http.StatusNotFound, "institution not configured")
		return
	}

	var alumniCount, batchCount int
	_ = h.DB.Get(&alumniCount, `SELECT COUNT(*) FROM users WHERE role_id = ? AND status = ?`, models.RoleAlumni, models.StatusApproved)
	_ = h.DB.Get(&batchCount, `SELECT COUNT(DISTINCT batch_id) FROM alumni_profiles`)

	httpx.JSON(w, http.StatusOK, map[string]any{
		"institution": institutionResponse{
			Institution: inst,
			LogoURL:     attachmentURL(h.DB, h.Storage, inst.LogoAttachmentID),
			FaviconURL:  attachmentURL(h.DB, h.Storage, inst.FaviconAttachmentID),
		},
		"stats": map[string]int{
			"alumniCount": alumniCount,
			"batchCount":  batchCount,
		},
		"timezone": h.Timezone,
	})
}

type updateInstitutionRequest struct {
	Name                string `json:"name"`
	ShortName           string `json:"shortName"`
	InstitutionType     string `json:"institutionType"`
	Description         string `json:"description"`
	Tagline             string `json:"tagline"`
	Address             string `json:"address"`
	Website             string `json:"website"`
	ContactEmail        string `json:"contactEmail"`
	AboutText           string `json:"aboutText"`
	MissionText         string `json:"missionText"`
	ThemeColor          string `json:"themeColor"`
	SocialLinks         string `json:"socialLinks"`
	LogoAttachmentID    *int64 `json:"logoAttachmentId"`
	FaviconAttachmentID *int64 `json:"faviconAttachmentId"`
}

func (h *InstitutionHandler) UpdateInstitution(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	var req updateInstitutionRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	_, err := h.DB.Exec(`UPDATE institutions SET
		name = ?, short_name = ?, institution_type = ?, description = ?, tagline = ?, address = ?,
		website = ?, contact_email = ?, about_text = ?, mission_text = ?, theme_color = ?,
		social_links = ?, logo_attachment_id = ?, favicon_attachment_id = ?, updated_at = datetime('now')`,
		req.Name, req.ShortName, req.InstitutionType, req.Description, req.Tagline, req.Address,
		req.Website, req.ContactEmail, req.AboutText, req.MissionText, req.ThemeColor,
		req.SocialLinks, req.LogoAttachmentID, req.FaviconAttachmentID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "institution.updated", "institution", nil, nil, req)
	h.GetInstitution(w, r)
}

// --- Departments ---

func (h *InstitutionHandler) ListDepartments(w http.ResponseWriter, r *http.Request) {
	depts := []models.Department{}
	if err := h.DB.Select(&depts, `SELECT * FROM departments WHERE is_active = 1 ORDER BY name`); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list departments")
		return
	}
	httpx.JSON(w, http.StatusOK, depts)
}

type upsertDepartmentRequest struct {
	Name string `json:"name"`
	Code string `json:"code"`
}

func (h *InstitutionHandler) CreateDepartment(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	var req upsertDepartmentRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	var institutionID int64
	_ = h.DB.Get(&institutionID, `SELECT id FROM institutions LIMIT 1`)
	res, err := h.DB.Exec(`INSERT INTO departments (institution_id, name, code) VALUES (?, ?, ?)`, institutionID, req.Name, req.Code)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	id, _ := res.LastInsertId()
	var d models.Department
	_ = h.DB.Get(&d, `SELECT * FROM departments WHERE id = ?`, id)
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "department.created", "department", &id, nil, d)
	httpx.JSON(w, http.StatusCreated, d)
}

func (h *InstitutionHandler) UpdateDepartment(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req upsertDepartmentRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	var before models.Department
	_ = h.DB.Get(&before, `SELECT * FROM departments WHERE id = ?`, id)
	if _, err := h.DB.Exec(`UPDATE departments SET name = ?, code = ? WHERE id = ?`, req.Name, req.Code, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	var d models.Department
	_ = h.DB.Get(&d, `SELECT * FROM departments WHERE id = ?`, id)
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "department.updated", "department", &id, before, d)
	httpx.JSON(w, http.StatusOK, d)
}

// DeleteDepartment soft-deletes (is_active = 0) rather than removing the row — existing
// members/programs/batches referencing it must keep working; it just drops out of the
// signup/admin "active" dropdowns going forward.
func (h *InstitutionHandler) DeleteDepartment(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(`UPDATE departments SET is_active = 0 WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete failed")
		return
	}
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "department.deactivated", "department", &id, nil, nil)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "department deactivated"})
}

// --- Programs ---

func (h *InstitutionHandler) ListPrograms(w http.ResponseWriter, r *http.Request) {
	deptID := r.URL.Query().Get("departmentId")
	programs := []models.Program{}
	var err error
	if deptID != "" {
		err = h.DB.Select(&programs, `SELECT * FROM programs WHERE department_id = ? AND is_active = 1 ORDER BY name`, deptID)
	} else {
		err = h.DB.Select(&programs, `SELECT * FROM programs WHERE is_active = 1 ORDER BY name`)
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list programs")
		return
	}
	httpx.JSON(w, http.StatusOK, programs)
}

type upsertProgramRequest struct {
	DepartmentID int64  `json:"departmentId"`
	Name         string `json:"name"`
	DegreeLevel  string `json:"degreeLevel"`
}

func (h *InstitutionHandler) CreateProgram(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	var req upsertProgramRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Name == "" || req.DepartmentID == 0 {
		httpx.Error(w, http.StatusBadRequest, "departmentId and name are required")
		return
	}
	res, err := h.DB.Exec(`INSERT INTO programs (department_id, name, degree_level) VALUES (?, ?, ?)`, req.DepartmentID, req.Name, req.DegreeLevel)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	id, _ := res.LastInsertId()
	var p models.Program
	_ = h.DB.Get(&p, `SELECT * FROM programs WHERE id = ?`, id)
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "program.created", "program", &id, nil, p)
	httpx.JSON(w, http.StatusCreated, p)
}

func (h *InstitutionHandler) UpdateProgram(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req upsertProgramRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	var before models.Program
	_ = h.DB.Get(&before, `SELECT * FROM programs WHERE id = ?`, id)
	if _, err := h.DB.Exec(`UPDATE programs SET name = ?, degree_level = ? WHERE id = ?`, req.Name, req.DegreeLevel, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	var p models.Program
	_ = h.DB.Get(&p, `SELECT * FROM programs WHERE id = ?`, id)
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "program.updated", "program", &id, before, p)
	httpx.JSON(w, http.StatusOK, p)
}

func (h *InstitutionHandler) DeleteProgram(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(`UPDATE programs SET is_active = 0 WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete failed")
		return
	}
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "program.deactivated", "program", &id, nil, nil)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "program deactivated"})
}

// --- Batches ---

type batchResponse struct {
	models.Batch
	ActiveStudentCount    int `db:"active_student_count" json:"activeStudentCount"`
	ConvertedStudentCount int `db:"converted_student_count" json:"convertedStudentCount"`
}

// ListBatches annotates each batch with active vs. converted student counts so the admin UI
// can distinguish a currently-running batch from one already converted to alumni (AdminTaxonomy's
// BatchPanel uses this to show the right icon/badge) without a separate round trip.
func (h *InstitutionHandler) ListBatches(w http.ResponseWriter, r *http.Request) {
	programID := r.URL.Query().Get("programId")
	batches := []batchResponse{}
	baseQuery := `SELECT b.*,
		COALESCE(sp_active.cnt, 0) AS active_student_count,
		COALESCE(sp_conv.cnt, 0) AS converted_student_count
		FROM batches b
		LEFT JOIN (SELECT batch_id, COUNT(*) AS cnt FROM student_profiles WHERE status = 'active' GROUP BY batch_id) sp_active ON sp_active.batch_id = b.id
		LEFT JOIN (SELECT batch_id, COUNT(*) AS cnt FROM student_profiles WHERE status = 'converted' GROUP BY batch_id) sp_conv ON sp_conv.batch_id = b.id`
	var err error
	if programID != "" {
		err = h.DB.Select(&batches, baseQuery+` WHERE b.program_id = ? AND b.is_active = 1 ORDER BY b.sort_order ASC`, programID)
	} else {
		err = h.DB.Select(&batches, baseQuery+` WHERE b.is_active = 1 ORDER BY b.sort_order ASC`)
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list batches")
		return
	}
	httpx.JSON(w, http.StatusOK, batches)
}

type upsertBatchRequest struct {
	ProgramID int64  `json:"programId"`
	StartYear int    `json:"startYear"`
	EndYear   int    `json:"endYear"`
	Label     string `json:"label"`
}

func (h *InstitutionHandler) CreateBatch(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	var req upsertBatchRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.ProgramID == 0 || req.StartYear == 0 {
		httpx.Error(w, http.StatusBadRequest, "programId and startYear are required")
		return
	}
	res, err := h.DB.Exec(`INSERT INTO batches (program_id, start_year, end_year, label, sort_order) VALUES (?, ?, ?, ?, ?)`,
		req.ProgramID, req.StartYear, req.EndYear, req.Label, req.StartYear)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	id, _ := res.LastInsertId()
	var b models.Batch
	_ = h.DB.Get(&b, `SELECT * FROM batches WHERE id = ?`, id)
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "batch.created", "batch", &id, nil, b)
	httpx.JSON(w, http.StatusCreated, b)
}

func (h *InstitutionHandler) UpdateBatch(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req upsertBatchRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.StartYear == 0 {
		httpx.Error(w, http.StatusBadRequest, "startYear is required")
		return
	}
	var before models.Batch
	_ = h.DB.Get(&before, `SELECT * FROM batches WHERE id = ?`, id)
	if _, err := h.DB.Exec(`UPDATE batches SET start_year = ?, end_year = ?, label = ?, sort_order = ? WHERE id = ?`,
		req.StartYear, req.EndYear, req.Label, req.StartYear, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	var b models.Batch
	_ = h.DB.Get(&b, `SELECT * FROM batches WHERE id = ?`, id)
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "batch.updated", "batch", &id, before, b)
	httpx.JSON(w, http.StatusOK, b)
}

// DeleteBatch soft-deletes only — per spec, a batch with users must never be hard-deleted;
// is_active = 0 just removes it from future signup/admin dropdowns.
func (h *InstitutionHandler) DeleteBatch(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(`UPDATE batches SET is_active = 0 WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete failed")
		return
	}
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "batch.deactivated", "batch", &id, nil, nil)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "batch deactivated"})
}

// --- Blood Groups ---

func (h *InstitutionHandler) ListBloodGroups(w http.ResponseWriter, r *http.Request) {
	groups := []models.BloodGroup{}
	if err := h.DB.Select(&groups, `SELECT * FROM blood_groups WHERE is_active = 1 ORDER BY sort_order, name`); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list blood groups")
		return
	}
	httpx.JSON(w, http.StatusOK, groups)
}

type upsertBloodGroupRequest struct {
	Name      string `json:"name"`
	SortOrder int    `json:"sortOrder"`
}

func (h *InstitutionHandler) CreateBloodGroup(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	var req upsertBloodGroupRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	var institutionID int64
	_ = h.DB.Get(&institutionID, `SELECT id FROM institutions LIMIT 1`)
	res, err := h.DB.Exec(`INSERT INTO blood_groups (institution_id, name, sort_order) VALUES (?, ?, ?)`,
		institutionID, req.Name, req.SortOrder)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	id, _ := res.LastInsertId()
	var bg models.BloodGroup
	_ = h.DB.Get(&bg, `SELECT * FROM blood_groups WHERE id = ?`, id)
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "blood_group.created", "blood_group", &id, nil, bg)
	httpx.JSON(w, http.StatusCreated, bg)
}

func (h *InstitutionHandler) UpdateBloodGroup(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req upsertBloodGroupRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	var before models.BloodGroup
	_ = h.DB.Get(&before, `SELECT * FROM blood_groups WHERE id = ?`, id)
	if _, err := h.DB.Exec(`UPDATE blood_groups SET name = ?, sort_order = ? WHERE id = ?`, req.Name, req.SortOrder, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	var bg models.BloodGroup
	_ = h.DB.Get(&bg, `SELECT * FROM blood_groups WHERE id = ?`, id)
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "blood_group.updated", "blood_group", &id, before, bg)
	httpx.JSON(w, http.StatusOK, bg)
}

func (h *InstitutionHandler) DeleteBloodGroup(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(`UPDATE blood_groups SET is_active = 0 WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete failed")
		return
	}
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "blood_group.deactivated", "blood_group", &id, nil, nil)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "blood group deactivated"})
}
