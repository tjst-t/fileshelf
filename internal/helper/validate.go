package helper

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ValidatePath checks that the given path is under one of the allowed base paths.
// It cleans the path, resolves symlinks where possible, and prevents path traversal.
func ValidatePath(path string, bases []string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("empty path")
	}

	cleaned := filepath.Clean(path)

	if !filepath.IsAbs(cleaned) {
		return "", fmt.Errorf("path must be absolute: %s", path)
	}

	// Try to resolve symlinks. If the path doesn't exist yet (e.g. write target),
	// resolve the parent directory instead.
	resolved := cleaned
	if r, err := filepath.EvalSymlinks(cleaned); err == nil {
		resolved = r
	} else if os.IsNotExist(err) {
		// Path doesn't exist yet — resolve parent
		parent := filepath.Dir(cleaned)
		if rp, err2 := filepath.EvalSymlinks(parent); err2 == nil {
			resolved = filepath.Join(rp, filepath.Base(cleaned))
		}
	}

	for _, base := range bases {
		base = filepath.Clean(base)
		// Also resolve the base path's symlinks for consistent comparison
		if rb, err := filepath.EvalSymlinks(base); err == nil {
			base = rb
		}
		if resolved == base || strings.HasPrefix(resolved, base+"/") {
			return cleaned, nil
		}
	}

	return "", fmt.Errorf("path %s is not under any allowed base path", path)
}

// IsBasePath checks whether the given path is exactly one of the base paths.
// It resolves symlinks for consistent comparison with ValidatePath.
func IsBasePath(path string, bases []string) bool {
	cleaned := filepath.Clean(path)
	if r, err := filepath.EvalSymlinks(cleaned); err == nil {
		cleaned = r
	}
	for _, base := range bases {
		b := filepath.Clean(base)
		if rb, err := filepath.EvalSymlinks(b); err == nil {
			b = rb
		}
		if b == cleaned {
			return true
		}
	}
	return false
}
