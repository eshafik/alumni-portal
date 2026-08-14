package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/models"
	"alumni-portal/internal/storage"
)

type GalleryHandler struct {
	DB      *sqlx.DB
	Storage storage.Driver
}

type galleryImageResponse struct {
	models.HomeGalleryImage
	ImageURL string `json:"imageUrl"`
}

// List is public — feeds the homepage hero slider. Only active images, ordered for display.
func (h *GalleryHandler) List(w http.ResponseWriter, r *http.Request) {
	var images []models.HomeGalleryImage
	if err := h.DB.Select(&images, `SELECT * FROM home_gallery_images WHERE is_active = 1 ORDER BY sort_order, id`); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	items := make([]galleryImageResponse, len(images))
	for i, img := range images {
		items[i] = galleryImageResponse{HomeGalleryImage: img, ImageURL: attachmentURL(h.DB, h.Storage, &img.AttachmentID)}
	}
	httpx.JSON(w, http.StatusOK, items)
}

type createGalleryImageRequest struct {
	AttachmentID int64  `json:"attachmentId"`
	Caption      string `json:"caption"`
	SortOrder    int    `json:"sortOrder"`
}

func (h *GalleryHandler) Create(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	var req createGalleryImageRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.AttachmentID == 0 {
		httpx.Error(w, http.StatusBadRequest, "attachmentId is required")
		return
	}
	res, err := h.DB.Exec(`INSERT INTO home_gallery_images (institution_id, attachment_id, caption, sort_order) VALUES (?, ?, ?, ?)`,
		u.InstitutionID, req.AttachmentID, req.Caption, req.SortOrder)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	id, _ := res.LastInsertId()
	var img models.HomeGalleryImage
	_ = h.DB.Get(&img, `SELECT * FROM home_gallery_images WHERE id = ?`, id)
	httpx.JSON(w, http.StatusCreated, galleryImageResponse{HomeGalleryImage: img, ImageURL: attachmentURL(h.DB, h.Storage, &img.AttachmentID)})
}

type updateGalleryImageRequest struct {
	Caption   string `json:"caption"`
	SortOrder int    `json:"sortOrder"`
	IsActive  bool   `json:"isActive"`
}

func (h *GalleryHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req updateGalleryImageRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if _, err := h.DB.Exec(`UPDATE home_gallery_images SET caption = ?, sort_order = ?, is_active = ? WHERE id = ?`,
		req.Caption, req.SortOrder, req.IsActive, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "updated"})
}

func (h *GalleryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(`DELETE FROM home_gallery_images WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}
