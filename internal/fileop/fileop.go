package fileop

import (
	"context"
	"io"
	"time"
)

// User represents an authenticated Linux user.
type User struct {
	Username string
	UID      int
	GID      int
}

// Entry represents a file or directory entry.
type Entry struct {
	Name     string    `json:"name"`
	Type     string    `json:"type"` // "file" or "dir"
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
	Perms    string    `json:"perms"`
	Owner    string    `json:"owner"`
	Group    string    `json:"group"`
}

// SearchEntry represents a file/directory found by search.
type SearchEntry struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
	Perms    string `json:"perms"`
	Owner    string `json:"owner"`
	Group    string `json:"group"`
	Dir      string `json:"dir"` // relative directory path within the searched base
}

// FileOperator defines all file operations.
type FileOperator interface {
	Access(ctx context.Context, user User, path string) error
	List(ctx context.Context, user User, path string) ([]Entry, error)
	Read(ctx context.Context, user User, path string) (io.ReadCloser, error)
	ReadRange(ctx context.Context, user User, path string, offset, length int64) (io.ReadCloser, error)
	Write(ctx context.Context, user User, path string, r io.Reader) error
	Mkdir(ctx context.Context, user User, path string) error
	MkdirAll(ctx context.Context, user User, path string) error
	Delete(ctx context.Context, user User, path string) error
	Rename(ctx context.Context, user User, oldPath, newPath string) error
	Copy(ctx context.Context, user User, srcPath, dstPath string) error
	Stat(ctx context.Context, user User, path string) (*Entry, error)
	Search(ctx context.Context, user User, basePath string, query string, maxResults int) ([]SearchEntry, error)
}
