package storage

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"

	"alumni-portal/internal/config"
)

type localDriver struct {
	root      string
	urlPrefix string
}

func newLocalDriver(cfg config.Config) (Driver, error) {
	if err := os.MkdirAll(cfg.LocalPath, 0o755); err != nil {
		return nil, err
	}
	return &localDriver{root: cfg.LocalPath, urlPrefix: "/files/"}, nil
}

// resolve prevents path traversal: keys are always generated server-side (uuid-based) by
// the upload handler, but we defend in depth here too — no key may escape the storage root.
func (d *localDriver) resolve(key string) (string, error) {
	clean := filepath.Clean("/" + key)[1:]
	full := filepath.Join(d.root, clean)
	if !strings.HasPrefix(full, filepath.Clean(d.root)+string(os.PathSeparator)) && full != filepath.Clean(d.root) {
		return "", errors.New("invalid storage key")
	}
	return full, nil
}

func (d *localDriver) Put(_ context.Context, key string, r io.Reader, _ string, _ int64) error {
	full, err := d.resolve(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	f, err := os.Create(full)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, r)
	return err
}

func (d *localDriver) Get(_ context.Context, key string) (io.ReadCloser, error) {
	full, err := d.resolve(key)
	if err != nil {
		return nil, err
	}
	return os.Open(full)
}

func (d *localDriver) Delete(_ context.Context, key string) error {
	full, err := d.resolve(key)
	if err != nil {
		return err
	}
	err = os.Remove(full)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (d *localDriver) Exists(_ context.Context, key string) (bool, error) {
	full, err := d.resolve(key)
	if err != nil {
		return false, err
	}
	_, err = os.Stat(full)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return err == nil, err
}

func (d *localDriver) URL(key string) string {
	return d.urlPrefix + key
}
