package helper

import (
	"fmt"
	"path/filepath"
	"strings"
)

// ValidatePath checks that the given path is under one of the allowed base paths.
// It cleans the path and resolves ".." components to prevent path traversal.
func ValidatePath(path string, bases []string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("empty path")
	}

	cleaned := filepath.Clean(path)

	if !filepath.IsAbs(cleaned) {
		return "", fmt.Errorf("path must be absolute: %s", path)
	}

	for _, base := range bases {
		base = filepath.Clean(base)
		if cleaned == base || strings.HasPrefix(cleaned, base+"/") {
			return cleaned, nil
		}
	}

	return "", fmt.Errorf("path %s is not under any allowed base path", path)
}

// ValidateDestPath validates a destination path the same way as ValidatePath.
func ValidateDestPath(dest string, bases []string) (string, error) {
	return ValidatePath(dest, bases)
}
