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

type NotificationHandler struct {
	DB *sqlx.DB
}

func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	pg := httpx.ParsePagination(r)
	var total int
	_ = h.DB.Get(&total, `SELECT COUNT(*) FROM notifications WHERE user_id = ?`, u.ID)
	notifications := []models.Notification{}
	if err := h.DB.Select(&notifications, `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`, u.ID, pg.PageSize, pg.Offset); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: notifications, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

func (h *NotificationHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	var count int
	_ = h.DB.Get(&count, `SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL`, u.ID)
	httpx.JSON(w, http.StatusOK, map[string]int{"unreadCount": count})
}

func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?`, id, u.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "marked read"})
}

func (h *NotificationHandler) GetPreferences(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	type pref struct {
		Category string `db:"category" json:"category"`
		Channel  string `db:"channel" json:"channel"`
		Enabled  bool   `db:"enabled" json:"enabled"`
	}
	prefs := []pref{}
	_ = h.DB.Select(&prefs, `SELECT category, channel, enabled FROM notification_preferences WHERE user_id = ?`, u.ID)
	httpx.JSON(w, http.StatusOK, prefs)
}

type updatePreferenceRequest struct {
	Category string `json:"category"`
	Channel  string `json:"channel"`
	Enabled  bool   `json:"enabled"`
}

// UpdatePreference: mandatory-importance notices are never gated by preferences (see
// NoticeHandler.notifyAllMembers), so this endpoint only ever affects opt-in categories
// like job_alert — a user cannot accidentally disable institutionally important notices.
func (h *NotificationHandler) UpdatePreference(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	var req updatePreferenceRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Category == "" || req.Channel == "" {
		httpx.Error(w, http.StatusBadRequest, "category and channel are required")
		return
	}
	_, err := h.DB.Exec(`INSERT INTO notification_preferences (user_id, category, channel, enabled) VALUES (?, ?, ?, ?)
		ON CONFLICT(user_id, category, channel) DO UPDATE SET enabled = excluded.enabled`,
		u.ID, req.Category, req.Channel, req.Enabled)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "preference updated"})
}
