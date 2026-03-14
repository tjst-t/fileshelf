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
}

// FileOperator defines all file operations.
type FileOperator interface {
	Access(ctx context.Context, user User, path string) error
	List(ctx context.Context, user User, path string) ([]Entry, error)
	Read(ctx context.Context, user User, path string) (io.ReadCloser, error)
	ReadRange(ctx context.Context, user User, path string, offset, length int64) (io.ReadCloser, error)
	Write(ctx context.Context, user User, path string, r io.Reader) error
	Mkdir(ctx context.Context, user User, path string) error
	Delete(ctx context.Context, user User, path string) error
	Rename(ctx context.Context, user User, oldPath, newPath string) error
	Copy(ctx context.Context, user User, srcPath, dstPath string) error
	Stat(ctx context.Context, user User, path string) (*Entry, error)
}
