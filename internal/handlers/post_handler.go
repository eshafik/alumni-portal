package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/models"
)

type PostHandler struct {
	DB *sqlx.DB
}

func (h *PostHandler) List(w http.ResponseWriter, r *http.Request) {
	pg := httpx.ParsePagination(r)
	var total int
	_ = h.DB.Get(&total, `SELECT COUNT(*) FROM posts WHERE status = 'published'`)
	posts := []models.Post{}
	if err := h.DB.Select(&posts, `SELECT * FROM posts WHERE status = 'published' ORDER BY created_at DESC LIMIT ? OFFSET ?`, pg.PageSize, pg.Offset); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: posts, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

type createPostRequest struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

// Create: any approved member can submit a post. Admins/SuperAdmins publish immediately;
// everyone else lands in "pending" for moderator/admin review.
func (h *PostHandler) Create(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	var req createPostRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Title == "" || req.Body == "" {
		httpx.Error(w, http.StatusBadRequest, "title and body are required")
		return
	}
	status := "pending"
	if u.RoleID == models.RoleAdmin || u.RoleID == models.RoleSuperAdmin {
		status = "published"
	}
	res, err := h.DB.Exec(`INSERT INTO posts (institution_id, author_user_id, title, body, status) VALUES (?, ?, ?, ?, ?)`,
		u.InstitutionID, u.ID, req.Title, req.Body, status)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	id, _ := res.LastInsertId()
	var p models.Post
	_ = h.DB.Get(&p, `SELECT * FROM posts WHERE id = ?`, id)
	httpx.JSON(w, http.StatusCreated, p)
}

func (h *PostHandler) Approve(w http.ResponseWriter, r *http.Request) {
	h.setStatus(w, r, "published")
}

func (h *PostHandler) Reject(w http.ResponseWriter, r *http.Request) {
	h.setStatus(w, r, "rejected")
}

func (h *PostHandler) setStatus(w http.ResponseWriter, r *http.Request, status string) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(`UPDATE posts SET status = ?, updated_at = datetime('now') WHERE id = ?`, status, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "post " + status})
}
