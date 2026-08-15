package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/mailer"
	"alumni-portal/internal/models"
	"alumni-portal/internal/storage"
)

type JobHandler struct {
	DB      *sqlx.DB
	Storage storage.Driver
}

type jobPostResponse struct {
	models.JobPost
	ImageURL          string `json:"imageUrl,omitempty"`
	PostedByName      string `json:"postedByName,omitempty"`
	PostedByAvatarURL string `json:"postedByAvatarUrl,omitempty"`
}

func (h *JobHandler) withImageURL(job models.JobPost) jobPostResponse {
	resp := jobPostResponse{JobPost: job, ImageURL: attachmentURL(h.DB, h.Storage, job.ImageAttachmentID)}
	var poster struct {
		FullName           string `db:"full_name"`
		AvatarAttachmentID *int64 `db:"avatar_attachment_id"`
	}
	// avatar_attachment_id lives on alumni_profiles/student_profiles, not users — same
	// COALESCE-across-both-profile-tables pattern as CommitteeHandler.respondWithPositions.
	err := h.DB.Get(&poster, `SELECT u.full_name, COALESCE(ap.avatar_attachment_id, sp.avatar_attachment_id) AS avatar_attachment_id
		FROM users u
		LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
		LEFT JOIN student_profiles sp ON sp.user_id = u.id
		WHERE u.id = ?`, job.PostedByUserID)
	if err == nil {
		resp.PostedByName = poster.FullName
		resp.PostedByAvatarURL = attachmentURL(h.DB, h.Storage, poster.AvatarAttachmentID)
	}
	return resp
}

func (h *JobHandler) List(w http.ResponseWriter, r *http.Request) {
	pg := httpx.ParsePagination(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	where := "WHERE status = 'published'"
	args := []any{}
	if q != "" {
		where += " AND id IN (SELECT rowid FROM job_posts_fts WHERE job_posts_fts MATCH ?)"
		args = append(args, sanitizeFTSQuery(q))
	}

	var total int
	_ = h.DB.Get(&total, "SELECT COUNT(*) FROM job_posts "+where, args...)
	var jobs []models.JobPost
	listArgs := append(append([]any{}, args...), pg.PageSize, pg.Offset)
	if err := h.DB.Select(&jobs, "SELECT * FROM job_posts "+where+" ORDER BY created_at DESC LIMIT ? OFFSET ?", listArgs...); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	items := make([]jobPostResponse, len(jobs))
	for i, j := range jobs {
		items[i] = h.withImageURL(j)
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: items, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

func (h *JobHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var job models.JobPost
	if err := h.DB.Get(&job, `SELECT * FROM job_posts WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusNotFound, "job not found")
		return
	}
	httpx.JSON(w, http.StatusOK, h.withImageURL(job))
}

type createJobRequest struct {
	Title             string  `json:"title"`
	CompanyName       string  `json:"companyName"`
	Location          string  `json:"location"`
	EmploymentType    string  `json:"employmentType"`
	Description       string  `json:"description"`
	Salary            string  `json:"salary"`
	ApplyURL          string  `json:"applyUrl"`
	ApplyEmail        string  `json:"applyEmail"`
	ImageAttachmentID *int64  `json:"imageAttachmentId"`
	Deadline          *string `json:"deadline"`
}

// Create enforces the spec's "at most one image" rule server-side: imageAttachmentId is a
// single nullable FK, never an array, so there is no code path that could attach more than one.
func (h *JobHandler) Create(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	if u.RoleID != models.RoleAlumni && u.RoleID != models.RoleAdmin && u.RoleID != models.RoleSuperAdmin {
		httpx.Error(w, http.StatusForbidden, "only alumni can post job opportunities")
		return
	}
	var req createJobRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "title is required")
		return
	}
	res, err := h.DB.Exec(`INSERT INTO job_posts
		(institution_id, posted_by_user_id, title, company_name, location, employment_type,
		 description, salary, apply_url, apply_email, image_attachment_id, deadline)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		u.InstitutionID, u.ID, req.Title, req.CompanyName, req.Location, req.EmploymentType,
		req.Description, req.Salary, req.ApplyURL, req.ApplyEmail, req.ImageAttachmentID, req.Deadline,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	id, _ := res.LastInsertId()
	var job models.JobPost
	_ = h.DB.Get(&job, `SELECT * FROM job_posts WHERE id = ?`, id)
	syncJobFTS(h.DB, id)

	h.notifySubscribers(job)
	httpx.JSON(w, http.StatusCreated, job)
}

// Update is author-only (or Admin/SuperAdmin, for moderation) — enforced here rather than at
// the route level since ownership can only be determined after loading the target row.
func (h *JobHandler) Update(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var existing models.JobPost
	if err := h.DB.Get(&existing, `SELECT * FROM job_posts WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusNotFound, "job not found")
		return
	}
	if existing.PostedByUserID != actor.ID && actor.RoleID != models.RoleAdmin && actor.RoleID != models.RoleSuperAdmin {
		httpx.Error(w, http.StatusForbidden, "only the poster or an admin can edit this job")
		return
	}
	var req createJobRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "title is required")
		return
	}
	if _, err := h.DB.Exec(`UPDATE job_posts SET title = ?, company_name = ?, location = ?, employment_type = ?,
		description = ?, salary = ?, apply_url = ?, apply_email = ?, image_attachment_id = ?, deadline = ?, updated_at = datetime('now')
		WHERE id = ?`,
		req.Title, req.CompanyName, req.Location, req.EmploymentType, req.Description, req.Salary,
		req.ApplyURL, req.ApplyEmail, req.ImageAttachmentID, req.Deadline, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	syncJobFTS(h.DB, id)
	var job models.JobPost
	_ = h.DB.Get(&job, `SELECT * FROM job_posts WHERE id = ?`, id)
	httpx.JSON(w, http.StatusOK, h.withImageURL(job))
}

// Delete is author-only (or Admin/SuperAdmin). Hard-deletes, same as notices — job posts have
// no downstream references (unlike events' registrations) that would need history preserved.
func (h *JobHandler) Delete(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var existing models.JobPost
	if err := h.DB.Get(&existing, `SELECT * FROM job_posts WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusNotFound, "job not found")
		return
	}
	if existing.PostedByUserID != actor.ID && actor.RoleID != models.RoleAdmin && actor.RoleID != models.RoleSuperAdmin {
		httpx.Error(w, http.StatusForbidden, "only the poster or an admin can delete this job")
		return
	}
	if _, err := h.DB.Exec(`DELETE FROM job_posts WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete failed")
		return
	}
	_, _ = h.DB.Exec(`DELETE FROM job_posts_fts WHERE rowid = ?`, id)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "job deleted"})
}

func (h *JobHandler) notifySubscribers(job models.JobPost) {
	type subscriber struct {
		UserID int64  `db:"user_id"`
		Email  string `db:"email"`
	}
	var subs []subscriber
	_ = h.DB.Select(&subs, `SELECT u.id AS user_id, u.email FROM users u
		JOIN notification_preferences np ON np.user_id = u.id
		WHERE np.category = 'job_alert' AND np.enabled = 1 AND u.status = 'approved'`)
	for _, s := range subs {
		_, _ = h.DB.Exec(`INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id)
			VALUES (?, 'job_alert', ?, ?, 'job_post', ?)`,
			s.UserID, "New job opportunity: "+job.Title, job.CompanyName, job.ID)
		mailer.Enqueue(h.DB, s.Email, "New job opportunity: "+job.Title,
			"<p>A new job has been posted: <strong>"+job.Title+"</strong> at "+job.CompanyName+".</p>")
	}
}
