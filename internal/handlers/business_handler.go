package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/models"
)

type BusinessHandler struct {
	DB *sqlx.DB
}

func (h *BusinessHandler) List(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	category := r.URL.Query().Get("category")
	pg := httpx.ParsePagination(r)

	where := "WHERE status = 'published'"
	args := []any{}
	if q != "" {
		where += " AND (name LIKE ? OR description LIKE ?)"
		args = append(args, "%"+q+"%", "%"+q+"%")
	}
	if category != "" {
		where += " AND category = ?"
		args = append(args, category)
	}

	var total int
	_ = h.DB.Get(&total, "SELECT COUNT(*) FROM businesses "+where, args...)

	businesses := []models.Business{}
	q2 := "SELECT * FROM businesses " + where + " ORDER BY name LIMIT ? OFFSET ?"
	args = append(args, pg.PageSize, pg.Offset)
	if err := h.DB.Select(&businesses, q2, args...); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: businesses, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

func (h *BusinessHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var b models.Business
	if err := h.DB.Get(&b, `SELECT * FROM businesses WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusNotFound, "business not found")
		return
	}
	httpx.JSON(w, http.StatusOK, b)
}

type upsertBusinessRequest struct {
	Name             string `json:"name"`
	Category         string `json:"category"`
	Description      string `json:"description"`
	Location         string `json:"location"`
	Website          string `json:"website"`
	ContactPhone     string `json:"contactPhone"`
	ContactEmail     string `json:"contactEmail"`
	LogoAttachmentID *int64 `json:"logoAttachmentId"`
	SocialLinks      string `json:"socialLinks"`
}

func (h *BusinessHandler) Create(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	if u.RoleID != models.RoleAlumni && u.RoleID != models.RoleAdmin && u.RoleID != models.RoleSuperAdmin {
		httpx.Error(w, http.StatusForbidden, "only alumni can list a business")
		return
	}
	var req upsertBusinessRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	res, err := h.DB.Exec(`INSERT INTO businesses
		(institution_id, owner_user_id, name, category, description, location, website, contact_phone, contact_email, logo_attachment_id, social_links)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		u.InstitutionID, u.ID, req.Name, req.Category, req.Description, req.Location,
		req.Website, req.ContactPhone, req.ContactEmail, req.LogoAttachmentID, req.SocialLinks,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	id, _ := res.LastInsertId()
	var b models.Business
	_ = h.DB.Get(&b, `SELECT * FROM businesses WHERE id = ?`, id)
	httpx.JSON(w, http.StatusCreated, b)
}
