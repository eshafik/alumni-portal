package handlers

import (
	"encoding/csv"
	"html/template"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/models"
	"alumni-portal/internal/storage"
)

type EventHandler struct {
	DB            *sqlx.DB
	Storage       storage.Driver
	PublicBaseURL string
}

type eventResponse struct {
	models.Event
	CoverURL string `json:"coverUrl,omitempty"`
}

func (h *EventHandler) withCoverURL(event models.Event) eventResponse {
	return eventResponse{Event: event, CoverURL: attachmentURL(h.DB, h.Storage, event.CoverAttachmentID)}
}

// List is reachable without login (OptionalAuth, see cmd/server/main.go) — anonymous callers
// and non-approved accounts only ever see is_public events, same visibility pattern as notices
// (NoticeHandler.List). Sorted newest-created-first so a just-created event is always on page 1.
func (h *EventHandler) List(w http.ResponseWriter, r *http.Request) {
	pg := httpx.ParsePagination(r)
	u := auth.CurrentUser(r)
	publicOnly := u == nil || u.Status != models.StatusApproved
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	where := "WHERE status = 'published'"
	args := []any{}
	if publicOnly {
		where += " AND is_public = 1"
	}
	if q != "" {
		where += " AND (title LIKE ? OR description LIKE ? OR venue LIKE ?)"
		like := "%" + q + "%"
		args = append(args, like, like, like)
	}

	var total int
	_ = h.DB.Get(&total, "SELECT COUNT(*) FROM events "+where, args...)

	events := []models.Event{}
	listArgs := append(append([]any{}, args...), pg.PageSize, pg.Offset)
	if err := h.DB.Select(&events, "SELECT * FROM events "+where+" ORDER BY created_at DESC LIMIT ? OFFSET ?", listArgs...); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	items := make([]eventResponse, len(events))
	for i, e := range events {
		items[i] = h.withCoverURL(e)
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: items, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

func (h *EventHandler) Get(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	u := auth.CurrentUser(r)
	publicOnly := u == nil || u.Status != models.StatusApproved

	var event models.Event
	if err := h.DB.Get(&event, `SELECT * FROM events WHERE slug = ?`, slug); err != nil {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}
	if publicOnly && !event.IsPublic {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}
	var registeredCount int
	_ = h.DB.Get(&registeredCount, `SELECT COUNT(*) FROM event_registrations WHERE event_id = ? AND status = 'registered'`, event.ID)
	httpx.JSON(w, http.StatusOK, map[string]any{"event": h.withCoverURL(event), "registeredCount": registeredCount})
}

// GetAdmin returns the full event row including response_url (models.Event's json tag hides it
// from every other endpoint) — used by AdminEvents.tsx to populate the edit form.
func (h *EventHandler) GetAdmin(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var event models.Event
	if err := h.DB.Get(&event, `SELECT * FROM events WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"id": event.ID, "slug": event.Slug, "title": event.Title, "description": event.Description,
		"coverAttachmentId": event.CoverAttachmentID, "coverUrl": attachmentURL(h.DB, h.Storage, event.CoverAttachmentID),
		"startAt": event.StartAt, "endAt": event.EndAt,
		"venue": event.Venue, "onlineUrl": event.OnlineURL, "registrationDeadline": event.RegistrationDeadline,
		"capacity": event.Capacity, "status": event.Status, "isPublic": event.IsPublic,
		"registrationUrl": event.RegistrationURL, "responseUrl": event.ResponseURL,
	})
}

var slugSanitizer = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(title string) string {
	s := slugSanitizer.ReplaceAllString(strings.ToLower(title), "-")
	return strings.Trim(s, "-")
}

type upsertEventRequest struct {
	Title                string  `json:"title"`
	Description          string  `json:"description"`
	CoverAttachmentID    *int64  `json:"coverAttachmentId"`
	StartAt              string  `json:"startAt"`
	EndAt                *string `json:"endAt"`
	Venue                string  `json:"venue"`
	OnlineURL            string  `json:"onlineUrl"`
	RegistrationDeadline *string `json:"registrationDeadline"`
	Capacity             *int    `json:"capacity"`
	IsPublic             *bool   `json:"isPublic"`
	RegistrationURL      *string `json:"registrationUrl"`
	ResponseURL          *string `json:"responseUrl"`
}

func (h *EventHandler) Create(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	var req upsertEventRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Title == "" || req.StartAt == "" {
		httpx.Error(w, http.StatusBadRequest, "title and startAt are required")
		return
	}
	base := slugify(req.Title)
	if base == "" {
		base = "event"
	}
	slug := base
	for i := 2; ; i++ {
		var exists bool
		_ = h.DB.Get(&exists, `SELECT EXISTS(SELECT 1 FROM events WHERE slug = ?)`, slug)
		if !exists {
			break
		}
		slug = base + "-" + strconv.Itoa(i)
	}

	isPublic := true
	if req.IsPublic != nil {
		isPublic = *req.IsPublic
	}
	registrationURL := normalizeOptionalURL(req.RegistrationURL)
	responseURL := normalizeOptionalURL(req.ResponseURL)

	res, err := h.DB.Exec(`INSERT INTO events
		(institution_id, slug, title, description, cover_attachment_id, start_at, end_at, venue, online_url, registration_deadline, capacity, is_public, registration_url, response_url, created_by_user_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		u.InstitutionID, slug, req.Title, req.Description, req.CoverAttachmentID, req.StartAt, req.EndAt,
		req.Venue, req.OnlineURL, req.RegistrationDeadline, req.Capacity, isPublic, registrationURL, responseURL, u.ID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	id, _ := res.LastInsertId()
	var event models.Event
	_ = h.DB.Get(&event, `SELECT * FROM events WHERE id = ?`, id)
	httpx.JSON(w, http.StatusCreated, event)
}

func (h *EventHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req upsertEventRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Title == "" || req.StartAt == "" {
		httpx.Error(w, http.StatusBadRequest, "title and startAt are required")
		return
	}
	isPublic := true
	if req.IsPublic != nil {
		isPublic = *req.IsPublic
	}
	registrationURL := normalizeOptionalURL(req.RegistrationURL)
	responseURL := normalizeOptionalURL(req.ResponseURL)

	_, err = h.DB.Exec(`UPDATE events SET title = ?, description = ?, cover_attachment_id = ?, start_at = ?,
		end_at = ?, venue = ?, online_url = ?, registration_deadline = ?, capacity = ?, is_public = ?,
		registration_url = ?, response_url = ?, updated_at = datetime('now')
		WHERE id = ?`,
		req.Title, req.Description, req.CoverAttachmentID, req.StartAt, req.EndAt,
		req.Venue, req.OnlineURL, req.RegistrationDeadline, req.Capacity, isPublic,
		registrationURL, responseURL, id,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "event updated"})
}

// normalizeOptionalURL treats an empty/whitespace-only string the same as "not set" so clearing
// a field in the edit form actually clears it in the database rather than storing "".
func normalizeOptionalURL(v *string) *string {
	if v == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*v)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func (h *EventHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	// Preserve history: cancel rather than hard-delete, since registrations reference it.
	if _, err := h.DB.Exec(`UPDATE events SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "cancel failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "event cancelled"})
}

func (h *EventHandler) Register(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	slug := chi.URLParam(r, "slug")

	var event models.Event
	if err := h.DB.Get(&event, `SELECT * FROM events WHERE slug = ? AND status = 'published'`, slug); err != nil {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}
	if event.RegistrationDeadline != nil {
		var pastDeadline bool
		_ = h.DB.Get(&pastDeadline, `SELECT datetime('now') > ?`, *event.RegistrationDeadline)
		if pastDeadline {
			httpx.Error(w, http.StatusBadRequest, "registration deadline has passed")
			return
		}
	}

	var existing string
	err := h.DB.Get(&existing, `SELECT status FROM event_registrations WHERE event_id = ? AND user_id = ?`, event.ID, u.ID)
	if err == nil && existing == "registered" {
		httpx.Error(w, http.StatusConflict, "already registered")
		return
	}

	status := "registered"
	if event.Capacity != nil {
		var count int
		_ = h.DB.Get(&count, `SELECT COUNT(*) FROM event_registrations WHERE event_id = ? AND status = 'registered'`, event.ID)
		if count >= *event.Capacity {
			status = "waitlisted"
		}
	}

	if err == nil {
		_, err = h.DB.Exec(`UPDATE event_registrations SET status = ?, registered_at = datetime('now') WHERE event_id = ? AND user_id = ?`, status, event.ID, u.ID)
	} else {
		_, err = h.DB.Exec(`INSERT INTO event_registrations (event_id, user_id, status) VALUES (?, ?, ?)`, event.ID, u.ID, status)
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "registration failed")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"status": status})
}

func (h *EventHandler) CancelRegistration(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	slug := chi.URLParam(r, "slug")
	var eventID int64
	if err := h.DB.Get(&eventID, `SELECT id FROM events WHERE slug = ?`, slug); err != nil {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}
	if _, err := h.DB.Exec(`UPDATE event_registrations SET status = 'cancelled' WHERE event_id = ? AND user_id = ?`, eventID, u.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "cancel failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "registration cancelled"})
}

type registrationRow struct {
	UserID       int64  `db:"user_id" json:"userId" csv:"UserID"`
	FullName     string `db:"full_name" json:"fullName" csv:"Name"`
	Email        string `db:"email" json:"email" csv:"Email"`
	Status       string `db:"status" json:"status" csv:"Status"`
	RegisteredAt string `db:"registered_at" json:"registeredAt" csv:"RegisteredAt"`
}

func (h *EventHandler) ListRegistrations(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	rows := []registrationRow{}
	err := h.DB.Select(&rows, `SELECT u.id AS user_id, u.full_name, u.email, er.status, er.registered_at
		FROM event_registrations er JOIN users u ON u.id = er.user_id
		WHERE er.event_id = ? ORDER BY er.registered_at`, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	httpx.JSON(w, http.StatusOK, rows)
}

func (h *EventHandler) ExportRegistrationsCSV(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	var rows []registrationRow
	err := h.DB.Select(&rows, `SELECT u.id AS user_id, u.full_name, u.email, er.status, er.registered_at
		FROM event_registrations er JOIN users u ON u.id = er.user_id
		WHERE er.event_id = ? ORDER BY er.registered_at`, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "export failed")
		return
	}
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=registrations.csv")
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"UserID", "Name", "Email", "Status", "RegisteredAt"})
	for _, row := range rows {
		_ = cw.Write([]string{strconv.FormatInt(row.UserID, 10), row.FullName, row.Email, row.Status, row.RegisteredAt})
	}
	cw.Flush()
}

var shareTemplate = template.Must(template.New("share").Parse(`<!doctype html>
<html><head>
<meta charset="utf-8">
<title>{{.Title}}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="{{.Title}}">
<meta property="og:description" content="{{.Description}}">
<meta property="og:image" content="{{.ImageURL}}">
<meta property="og:url" content="{{.CanonicalURL}}">
<meta property="og:site_name" content="{{.InstitutionName}}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{{.Title}}">
<meta name="twitter:description" content="{{.Description}}">
<meta name="twitter:image" content="{{.ImageURL}}">
<meta http-equiv="refresh" content="0;url={{.CanonicalURL}}">
</head><body>
<script>window.location.replace({{.CanonicalURLJS}});</script>
<p>Redirecting to <a href="{{.CanonicalURL}}">{{.Title}}</a>...</p>
</body></html>`))

type shareData struct {
	Title           string
	Description     string
	ImageURL        string
	CanonicalURL    string
	CanonicalURLJS  template.JS
	InstitutionName string
}

// ShareMeta is the unauthenticated, crawler-friendly endpoint pasted into social composers
// (see spec section 5/28/50). It never renders the CSR app — social crawlers stop here and
// read the OG tags; real browsers get bounced to the canonical /events/:slug SPA route via
// meta-refresh + JS redirect within milliseconds.
func (h *EventHandler) ShareMeta(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var event models.Event
	if err := h.DB.Get(&event, `SELECT * FROM events WHERE slug = ? AND status = 'published' AND is_public = 1`, slug); err != nil {
		http.NotFound(w, r)
		return
	}
	var institutionName string
	_ = h.DB.Get(&institutionName, `SELECT name FROM institutions LIMIT 1`)

	imageURL := h.PublicBaseURL + "/icons/icon-512.png"
	if event.CoverAttachmentID != nil {
		var key string
		if err := h.DB.Get(&key, `SELECT storage_key FROM attachments WHERE id = ?`, *event.CoverAttachmentID); err == nil {
			imageURL = h.Storage.URL(key)
			if !strings.HasPrefix(imageURL, "http") {
				imageURL = h.PublicBaseURL + imageURL
			}
		}
	}

	canonical := h.PublicBaseURL + "/events/" + event.Slug
	data := shareData{
		Title:           event.Title,
		Description:     truncate(event.Description, 200),
		ImageURL:        imageURL,
		CanonicalURL:    canonical,
		CanonicalURLJS:  template.JS(strconv.Quote(canonical)),
		InstitutionName: institutionName,
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = shareTemplate.Execute(w, data)
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
