package storage

import (
	"context"
	"fmt"
	"io"

	"alumni-portal/internal/config"
)

// Driver abstracts attachment storage so handlers never touch a filesystem path or S3 SDK
// directly. Switching STORAGE_DRIVER between local/s3 requires no handler code changes.
type Driver interface {
	Put(ctx context.Context, key string, r io.Reader, contentType string, size int64) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	URL(key string) string
	Exists(ctx context.Context, key string) (bool, error)
}

func New(cfg config.Config) (Driver, error) {
	switch cfg.StorageDriver {
	case "s3":
		return newS3Driver(cfg)
	case "local", "":
		return newLocalDriver(cfg)
	default:
		return nil, fmt.Errorf("unknown STORAGE_DRIVER %q", cfg.StorageDriver)
	}
}

// NewLocal and NewS3 construct a specific driver regardless of cfg.StorageDriver — used by
// cmd/migrate-storage, which needs a local reader and an S3 writer simultaneously (source and
// destination), independent of whichever driver the running server currently has selected.
func NewLocal(cfg config.Config) (Driver, error) { return newLocalDriver(cfg) }
func NewS3(cfg config.Config) (Driver, error)    { return newS3Driver(cfg) }
