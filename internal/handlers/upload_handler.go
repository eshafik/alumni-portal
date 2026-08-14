package handlers

import (
	"net/http"

	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/storage"
)

type UploadHandler struct {
	DB      *sqlx.DB
	Storage storage.Driver
}

const maxUploadBytes = 8 << 20 // hard cap before context-specific limits apply

// Upload handles multipart image uploads for any context (avatar/logo/job/event/business).
// It sniffs the actual content type (never trusts the client Content-Type header or filename),
// validates size, generates an opaque storage key, and records an attachments row.
func (h *UploadHandler) Upload(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	if u == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		httpx.Error(w, http.StatusBadRequest, "file too large or malformed upload")
		return
	}
	uploadCtx := storage.UploadContext(r.FormValue("context"))

	file, fh, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	sniff := make([]byte, 512)
	n, _ := file.Read(sniff)
	detectedMIME := http.DetectContentType(sniff[:n])
	if _, err := file.Seek(0, 0); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "upload failed")
		return
	}

	key, err := storage.ValidateImage(fh, detectedMIME, u.InstitutionID, uploadCtx)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.Storage.Put(r.Context(), key, file, detectedMIME, fh.Size); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "upload failed")
		return
	}

	res, err := h.DB.Exec(
		`INSERT INTO attachments (institution_id, storage_key, original_filename, mime_type, size_bytes, uploaded_by_user_id)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		u.InstitutionID, key, fh.Filename, detectedMIME, fh.Size, u.ID,
	)
	if err != nil {
		_ = h.Storage.Delete(r.Context(), key)
		httpx.Error(w, http.StatusInternalServerError, "upload failed")
		return
	}
	attachmentID, _ := res.LastInsertId()

	httpx.JSON(w, http.StatusCreated, map[string]any{
		"attachmentId": attachmentID,
		"url":          h.Storage.URL(key),
	})
}
