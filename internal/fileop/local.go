package fileop

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"sort"
	"golang.org/x/sys/unix"
)

// LocalFileOperator implements FileOperator by directly accessing the filesystem.
// This is intended for dev mode where the helper binary cannot use setuid.
type LocalFileOperator struct {
	Bases []string
}

var _ FileOperator = (*LocalFileOperator)(nil)

func (l *LocalFileOperator) Access(_ context.Context, _ User, path string) error {
	return unix.Access(path, unix.R_OK|unix.X_OK)
}

func (l *LocalFileOperator) List(_ context.Context, _ User, path string) ([]Entry, error) {
	dirEntries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	entries := make([]Entry, 0, len(dirEntries))
	for _, de := range dirEntries {
		info, err := de.Info()
		if err != nil {
			continue
		}
		typ := "file"
		if de.IsDir() {
			typ = "dir"
		}
		entries = append(entries, Entry{
			Name:     de.Name(),
			Type:     typ,
			Size:     info.Size(),
			Modified: info.ModTime(),
			Perms:    info.Mode().Perm().String(),
		})
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Type != entries[j].Type {
			return entries[i].Type == "dir"
		}
		return entries[i].Name < entries[j].Name
	})

	return entries, nil
}

func (l *LocalFileOperator) Read(_ context.Context, _ User, path string) (io.ReadCloser, error) {
	return os.Open(path)
}

func (l *LocalFileOperator) ReadRange(_ context.Context, _ User, path string, offset, length int64) (io.ReadCloser, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	if offset > 0 {
		if _, err := f.Seek(offset, io.SeekStart); err != nil {
			f.Close()
			return nil, err
		}
	}
	if length > 0 {
		return &limitedReadCloser{Reader: io.LimitReader(f, length), Closer: f}, nil
	}
	return f, nil
}

type limitedReadCloser struct {
	io.Reader
	io.Closer
}

func (l *LocalFileOperator) Write(_ context.Context, _ User, path string, r io.Reader) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".fileshelf-upload-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()

	if _, err := io.Copy(tmp, r); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	return os.Rename(tmpName, path)
}

func (l *LocalFileOperator) Mkdir(_ context.Context, _ User, path string) error {
	return os.Mkdir(path, 0755)
}

func (l *LocalFileOperator) Delete(_ context.Context, _ User, path string) error {
	return os.RemoveAll(path)
}

func (l *LocalFileOperator) Rename(_ context.Context, _ User, oldPath, newPath string) error {
	return os.Rename(oldPath, newPath)
}

func (l *LocalFileOperator) Copy(_ context.Context, _ User, srcPath, dstPath string) error {
	info, err := os.Stat(srcPath)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return copyDir(srcPath, dstPath)
	}
	return copyFile(srcPath, dstPath)
}

func (l *LocalFileOperator) Stat(_ context.Context, _ User, path string) (*Entry, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	typ := "file"
	if info.IsDir() {
		typ = "dir"
	}
	return &Entry{
		Name:     info.Name(),
		Type:     typ,
		Size:     info.Size(),
		Modified: info.ModTime(),
		Perms:    info.Mode().Perm().String(),
	}, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

func copyDir(src, dst string) error {
	if err := os.MkdirAll(dst, 0755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, e := range entries {
		srcPath := filepath.Join(src, e.Name())
		dstPath := filepath.Join(dst, e.Name())
		if e.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, dstPath); err != nil {
				return err
			}
		}
	}
	return nil
}
