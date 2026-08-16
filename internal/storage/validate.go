package storage

import (
	"errors"
	"fmt"
	"mime/multipart"

	"github.com/google/uuid"
)

type UploadContext string

const (
	ContextAvatar      UploadContext = "avatar"
	ContextLogo        UploadContext = "logo"
	ContextJobImage    UploadContext = "job"
	ContextNoticeImage UploadContext = "notice"
	ContextEventCover  UploadContext = "event"
	ContextBusiness    UploadContext = "business"
	ContextGallery     UploadContext = "gallery"
	ContextFavicon     UploadContext = "favicon"
)

var allowedImageMIME = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
}

var maxSizeByContext = map[UploadContext]int64{
	ContextAvatar:      2 << 20, // 2MB
	ContextLogo:        2 << 20, // 2MB
	ContextJobImage:    1 << 20, // 1MB
	ContextNoticeImage: 1 << 20, // 1MB
	ContextEventCover:  8 << 20, // 8MB
	ContextBusiness:    4 << 20, // 4MB
	ContextGallery:     8 << 20, // 8MB — homepage hero slider
	ContextFavicon:     1 << 20, // 1MB
}

var ErrUnsupportedType = errors.New("unsupported file type; only JPEG, PNG, and WebP images are allowed")
var ErrTooLarge = errors.New("file exceeds the maximum allowed size")

// ValidateImage checks MIME type (via sniffed content, not the client-supplied header) and
// size against the given upload context, and returns an opaque, path-traversal-safe storage
// key. The original filename is never used to build the path.
func ValidateImage(fh *multipart.FileHeader, detectedMIME string, institutionID int64, uploadCtx UploadContext) (string, error) {
	ext, ok := allowedImageMIME[detectedMIME]
	if !ok {
		return "", ErrUnsupportedType
	}
	maxSize, ok := maxSizeByContext[uploadCtx]
	if !ok {
		maxSize = 4 << 20
	}
	if fh.Size > maxSize {
		return "", ErrTooLarge
	}
	key := fmt.Sprintf("%d/%s/%s.%s", institutionID, uploadCtx, uuid.NewString(), ext)
	return key, nil
}
