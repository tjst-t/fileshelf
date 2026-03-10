package helper

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// OpWrite reads from r and writes to path atomically via temp file + rename.
// The temp file is created in the same directory as the target for rename atomicity.
// Returns a WriteResponse with the number of bytes written.
func OpWrite(path string, r io.Reader) (*WriteResponse, error) {
	dir := filepath.Dir(path)

	tmp, err := os.CreateTemp(dir, ".fileshelf-upload-*")
	if err != nil {
		return nil, fmt.Errorf("creating temp file: %w", err)
	}
	tmpPath := tmp.Name()

	// Ensure cleanup on any error path
	success := false
	defer func() {
		if !success {
			tmp.Close()
			os.Remove(tmpPath)
		}
	}()

	// Set default permissions
	if err := tmp.Chmod(0644); err != nil {
		return nil, fmt.Errorf("setting permissions: %w", err)
	}

	n, err := io.Copy(tmp, r)
	if err != nil {
		return nil, fmt.Errorf("writing to temp file: %w", err)
	}

	if err := tmp.Close(); err != nil {
		return nil, fmt.Errorf("closing temp file: %w", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		return nil, fmt.Errorf("renaming temp file: %w", err)
	}

	success = true
	return &WriteResponse{OK: true, Size: n}, nil
}
