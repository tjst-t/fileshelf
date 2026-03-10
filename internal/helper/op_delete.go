package helper

import (
	"fmt"
	"os"
)

// OpDelete removes a file or directory recursively.
// Refuses to delete a base path (share root) to prevent accidental data loss.
func OpDelete(path string, bases []string) error {
	if IsBasePath(path, bases) {
		return fmt.Errorf("refusing to delete share root: %s", path)
	}
	return os.RemoveAll(path)
}
