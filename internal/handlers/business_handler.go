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
	"alumni-portal/internal/storage"
)

type BusinessHandler struct {
	DB      *sqlx.DB
	Storage storage.Driver
}

type businessResponse struct {
	models.Business
	LogoURL        string `json:"logoUrl,omitempty"`
	OwnerName      string `json:"ownerName,omitempty"`
	OwnerAvatarURL string `json:"ownerAvatarUrl,omitempty"`
}

// withOwnerInfo attaches the owner's display name/avatar so the business directory can show
// and link to the author — same COALESCE-across-both-profile-tables pattern as
// JobHandler.withImageURL, since an owner may be Alumni, Admin, or SuperAdmin.
func (h *BusinessHandler) withOwnerInfo(b models.Business) businessResponse {
	resp := businessResponse{Business: b, LogoURL: attachmentURL(h.DB, h.Storage, b.LogoAttachmentID)}
	var owner struct {
		FullName           string `db:"full_name"`
		AvatarAttachmentID *int64 `db:"avatar_attachment_id"`
	}
	err := h.DB.Get(&owner, `SELECT u.full_name, COALESCE(ap.avatar_attachment_id, sp.avatar_attachment_id) AS avatar_attachment_id
		FROM users u
		LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
		LEFT JOIN student_profiles sp ON sp.user_id = u.id
		WHERE u.id = ?`, b.OwnerUserID)
	if err == nil {
		resp.OwnerName = owner.FullName
		resp.OwnerAvatarURL = attachmentURL(h.DB, h.Storage, owner.AvatarAttachmentID)
	}
	return resp
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
	items := make([]businessResponse, len(businesses))
	for i, b := range businesses {
		items[i] = h.withOwnerInfo(b)
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: items, Page: pg.Page, PageSize: pg.PageSize, Total: total})
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
	httpx.JSON(w, http.StatusOK, h.withOwnerInfo(b))
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
	httpx.JSON(w, http.StatusCreated, h.withOwnerInfo(b))
}

// Update is owner-only (or Admin/SuperAdmin, for moderation) — enforced here rather than at the
// route level since ownership can only be determined after loading the target row, same pattern
// as JobHandler.Update.
func (h *BusinessHandler) Update(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var existing models.Business
	if err := h.DB.Get(&existing, `SELECT * FROM businesses WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusNotFound, "business not found")
		return
	}
	if existing.OwnerUserID != actor.ID && actor.RoleID != models.RoleAdmin && actor.RoleID != models.RoleSuperAdmin {
		httpx.Error(w, http.StatusForbidden, "only the owner or an admin can edit this business")
		return
	}
	var req upsertBusinessRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if _, err := h.DB.Exec(`UPDATE businesses SET name = ?, category = ?, description = ?, location = ?,
		website = ?, contact_phone = ?, contact_email = ?, logo_attachment_id = ?, social_links = ?
		WHERE id = ?`,
		req.Name, req.Category, req.Description, req.Location, req.Website,
		req.ContactPhone, req.ContactEmail, req.LogoAttachmentID, req.SocialLinks, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	var b models.Business
	_ = h.DB.Get(&b, `SELECT * FROM businesses WHERE id = ?`, id)
	httpx.JSON(w, http.StatusOK, h.withOwnerInfo(b))
}

// Delete is owner-only (or Admin/SuperAdmin). Hard-deletes — businesses have no downstream
// references that would need history preserved, same as job posts/notices.
func (h *BusinessHandler) Delete(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var existing models.Business
	if err := h.DB.Get(&existing, `SELECT * FROM businesses WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusNotFound, "business not found")
		return
	}
	if existing.OwnerUserID != actor.ID && actor.RoleID != models.RoleAdmin && actor.RoleID != models.RoleSuperAdmin {
		httpx.Error(w, http.StatusForbidden, "only the owner or an admin can delete this business")
		return
	}
	if _, err := h.DB.Exec(`DELETE FROM businesses WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "business deleted"})
}
