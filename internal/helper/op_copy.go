package helper

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// OpCopy copies a file or directory recursively.
// Returns an error if the destination already exists.
// Symlinks are skipped for security.
func OpCopy(src, dst string) error {
	info, err := os.Lstat(src)
	if err != nil {
		return err
	}

	// Skip symlinks at the top level
	if info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("refusing to copy symlink: %s", src)
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

	df, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_EXCL, info.Mode().Perm())
	if err != nil {
		return err
	}

	_, copyErr := io.Copy(df, sf)
	closeErr := df.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func copyDir(src, dst string, info os.FileInfo) error {
	if err := os.Mkdir(dst, info.Mode().Perm()); err != nil {
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

		// Skip symlinks for security
		if eInfo.Mode()&os.ModeSymlink != 0 {
			continue
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
