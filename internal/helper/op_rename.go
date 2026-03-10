package helper

import (
	"fmt"
	"os"
	"path/filepath"
)

// OpRename renames (moves) a file or directory.
// Returns an error if the destination already exists (no silent overwrite).
func OpRename(oldPath, newPath string) error {
	if _, err := os.Lstat(newPath); err == nil {
		return fmt.Errorf("destination already exists: %s", newPath)
	}
	// Check that the parent directory of dest exists
	parent := filepath.Dir(newPath)
	if _, err := os.Stat(parent); err != nil {
		return fmt.Errorf("destination parent directory does not exist: %s", parent)
	}
	return os.Rename(oldPath, newPath)
}
