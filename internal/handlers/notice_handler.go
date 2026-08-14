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

type NoticeHandler struct {
	DB      *sqlx.DB
	Storage storage.Driver
}

type noticeResponse struct {
	models.Notice
	ImageURL string `json:"imageUrl,omitempty"`
}

func (h *NoticeHandler) withImageURL(n models.Notice) noticeResponse {
	return noticeResponse{Notice: n, ImageURL: attachmentURL(h.DB, h.Storage, n.ImageAttachmentID)}
}

// List is reachable without login (OptionalAuth, see cmd/server/main.go) — anonymous callers
// and non-approved accounts only ever see is_public notices; an approved member sees
// everything, public and private alike. Same endpoint powers both the homepage widget and the
// full /notices page, so an anonymous homepage visitor naturally only sees public notices.
func (h *NoticeHandler) List(w http.ResponseWriter, r *http.Request) {
	pg := httpx.ParsePagination(r)
	u := auth.CurrentUser(r)
	publicOnly := u == nil || u.Status != models.StatusApproved

	where := ""
	if publicOnly {
		where = "WHERE is_public = 1"
	}

	var total int
	_ = h.DB.Get(&total, "SELECT COUNT(*) FROM notices "+where)

	notices := []models.Notice{}
	if err := h.DB.Select(&notices, `SELECT * FROM notices `+where+` ORDER BY pinned DESC, published_at DESC LIMIT ? OFFSET ?`, pg.PageSize, pg.Offset); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	items := make([]noticeResponse, len(notices))
	for i, n := range notices {
		items[i] = h.withImageURL(n)
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: items, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

type upsertNoticeRequest struct {
	Title             string `json:"title"`
	Body              string `json:"body"`
	Importance        string `json:"importance"` // normal|important|urgent
	Pinned            bool   `json:"pinned"`
	IsPublic          bool   `json:"isPublic"`
	ImageAttachmentID *int64 `json:"imageAttachmentId"`
}

// Create publishes immediately (Admin/SuperAdmin only route). Important/urgent notices fan
// out an in-app + email notification to every approved member — these are not user-optional,
// matching the spec's "users should not accidentally disable mandatory notices" rule; only
// the 'normal' importance tier respects per-user notification preferences.
func (h *NoticeHandler) Create(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	var req upsertNoticeRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.Importance == "" {
		req.Importance = "normal"
	}
	res, err := h.DB.Exec(`INSERT INTO notices (institution_id, author_user_id, title, body, importance, pinned, is_public, image_attachment_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		u.InstitutionID, u.ID, req.Title, req.Body, req.Importance, req.Pinned, req.IsPublic, req.ImageAttachmentID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	id, _ := res.LastInsertId()
	var n models.Notice
	_ = h.DB.Get(&n, `SELECT * FROM notices WHERE id = ?`, id)

	if req.Importance == "important" || req.Importance == "urgent" {
		h.notifyAllMembers(n)
	}
	httpx.JSON(w, http.StatusCreated, h.withImageURL(n))
}

func (h *NoticeHandler) notifyAllMembers(n models.Notice) {
	type member struct {
		UserID int64  `db:"id"`
		Email  string `db:"email"`
	}
	var members []member
	_ = h.DB.Select(&members, `SELECT id, email FROM users WHERE institution_id = ? AND status = 'approved'`, n.InstitutionID)
	for _, m := range members {
		_, _ = h.DB.Exec(`INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id)
			VALUES (?, 'notice', ?, ?, 'notice', ?)`, m.UserID, n.Title, n.Body, n.ID)
		mailer.Enqueue(h.DB, m.Email, "["+n.Importance+"] "+n.Title, "<p>"+n.Body+"</p>")
	}
}

func (h *NoticeHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req upsertNoticeRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "title is required")
		return
	}
	if _, err := h.DB.Exec(`UPDATE notices SET title = ?, body = ?, importance = ?, pinned = ?, is_public = ?, image_attachment_id = ? WHERE id = ?`,
		req.Title, req.Body, req.Importance, req.Pinned, req.IsPublic, req.ImageAttachmentID, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "notice updated"})
}

func (h *NoticeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(`DELETE FROM notices WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "notice deleted"})
}
