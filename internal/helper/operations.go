package helper

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

// OpAccess checks if the current user can access the directory.
func OpAccess(path string) error {
	return syscall.Access(path, 0x1|0x4) // X_OK | R_OK
}

// OpList lists directory entries.
func OpList(path string) (*ListResponse, error) {
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
		entries = append(entries, entryFromFileInfo(de.Name(), info))
	}

	return &ListResponse{Entries: entries}, nil
}

// OpRead copies file content to the given writer.
func OpRead(path string, w io.Writer) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.Copy(w, f)
	return err
}

// OpWrite reads from r and writes to path atomically via temp file + rename.
func OpWrite(path string, r io.Reader) error {
	dir := filepath.Dir(path)

	tmp, err := os.CreateTemp(dir, ".fileshelf-upload-*")
	if err != nil {
		return fmt.Errorf("creating temp file: %w", err)
	}
	tmpPath := tmp.Name()

	defer func() {
		tmp.Close()
		os.Remove(tmpPath) // clean up on error
	}()

	if _, err := io.Copy(tmp, r); err != nil {
		return fmt.Errorf("writing to temp file: %w", err)
	}

	if err := tmp.Close(); err != nil {
		return fmt.Errorf("closing temp file: %w", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("renaming temp file: %w", err)
	}

	return nil
}

// OpMkdir creates a directory with 0755 permissions.
func OpMkdir(path string) error {
	return os.Mkdir(path, 0755)
}

// OpDelete removes a file or directory recursively.
func OpDelete(path string) error {
	return os.RemoveAll(path)
}

// OpRename renames (moves) a file or directory.
func OpRename(oldPath, newPath string) error {
	return os.Rename(oldPath, newPath)
}

// OpCopy copies a file or directory recursively.
func OpCopy(src, dst string) error {
	info, err := os.Lstat(src)
	if err != nil {
		return err
	}

	if info.IsDir() {
		return copyDir(src, dst, info)
	}
	return copyFile(src, dst, info)
}

func copyFile(src, dst string, info os.FileInfo) error {
	sf, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sf.Close()

	df, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
	if err != nil {
		return err
	}
	defer df.Close()

	_, err = io.Copy(df, sf)
	return err
}

func copyDir(src, dst string, info os.FileInfo) error {
	if err := os.Mkdir(dst, info.Mode()); err != nil {
		return err
	}

	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())

		eInfo, err := entry.Info()
		if err != nil {
			return err
		}

		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath, eInfo); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, dstPath, eInfo); err != nil {
				return err
			}
		}
	}

	return nil
}

// OpStat returns file/directory information.
func OpStat(path string) (*Entry, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	e := entryFromFileInfo(filepath.Base(path), info)
	return &e, nil
}

func entryFromFileInfo(name string, info os.FileInfo) Entry {
	t := "file"
	if info.IsDir() {
		t = "dir"
	}

	return Entry{
		Name:     name,
		Type:     t,
		Size:     info.Size(),
		Modified: info.ModTime().UTC().Truncate(time.Second),
		Perms:    info.Mode().Perm().String(),
	}
}
