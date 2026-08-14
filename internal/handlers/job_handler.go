package handlers

import (
	"net/http"
	"strconv"

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
	if err := h.DB.Get(&poster, `SELECT full_name, avatar_attachment_id FROM users WHERE id = ?`, job.PostedByUserID); err == nil {
		resp.PostedByName = poster.FullName
		resp.PostedByAvatarURL = attachmentURL(h.DB, h.Storage, poster.AvatarAttachmentID)
	}
	return resp
}

func (h *JobHandler) List(w http.ResponseWriter, r *http.Request) {
	pg := httpx.ParsePagination(r)
	var total int
	_ = h.DB.Get(&total, `SELECT COUNT(*) FROM job_posts WHERE status = 'published'`)
	var jobs []models.JobPost
	if err := h.DB.Select(&jobs, `SELECT * FROM job_posts WHERE status = 'published' ORDER BY created_at DESC LIMIT ? OFFSET ?`, pg.PageSize, pg.Offset); err != nil {
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

	h.notifySubscribers(job)
	httpx.JSON(w, http.StatusCreated, job)
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
