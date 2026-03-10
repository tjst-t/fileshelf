package helper

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidatePath(t *testing.T) {
	bases := []string{"/tank/media", "/tank/documents"}

	tests := []struct {
		name    string
		path    string
		wantErr bool
		want    string
	}{
		{"valid path under base", "/tank/media/movies", false, "/tank/media/movies"},
		{"exact base path", "/tank/media", false, "/tank/media"},
		{"nested valid path", "/tank/media/movies/action/film.mkv", false, "/tank/media/movies/action/film.mkv"},
		{"second base", "/tank/documents/readme.txt", false, "/tank/documents/readme.txt"},
		{"traversal attack", "/tank/media/../../../etc/passwd", true, ""},
		{"not under base", "/etc/passwd", true, ""},
		{"partial match not valid", "/tank/media2/foo", true, ""},
		{"empty path", "", true, ""},
		{"relative path", "tank/media/foo", true, ""},
		{"path with double dots cleaned", "/tank/media/foo/../bar", false, "/tank/media/bar"},
		{"traversal out of base", "/tank/media/../backups/secret", true, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ValidatePath(tt.path, bases)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got nil (path=%s)", got)
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidatePathSymlink(t *testing.T) {
	// Create a real directory structure with symlinks
	base := t.TempDir()
	realDir := filepath.Join(base, "real")
	os.Mkdir(realDir, 0755)
	os.WriteFile(filepath.Join(realDir, "file.txt"), []byte("test"), 0644)

	// Create a symlink inside base pointing within base — should be OK
	symInside := filepath.Join(base, "link-inside")
	os.Symlink(realDir, symInside)

	// Create a directory outside base
	outside := t.TempDir()
	os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("secret"), 0644)

	// Create a symlink inside base pointing outside — should be rejected
	symOutside := filepath.Join(base, "link-outside")
	os.Symlink(outside, symOutside)

	bases := []string{base}

	t.Run("symlink within base", func(t *testing.T) {
		_, err := ValidatePath(filepath.Join(symInside, "file.txt"), bases)
		if err != nil {
			t.Errorf("expected valid, got error: %v", err)
		}
	})

	t.Run("symlink escaping base", func(t *testing.T) {
		_, err := ValidatePath(filepath.Join(symOutside, "secret.txt"), bases)
		if err == nil {
			t.Error("expected error for symlink escaping base")
		}
	})
}

func TestIsBasePath(t *testing.T) {
	bases := []string{"/tank/media", "/tank/docs"}

	if !IsBasePath("/tank/media", bases) {
		t.Error("expected true for base path")
	}
	if IsBasePath("/tank/media/sub", bases) {
		t.Error("expected false for sub path")
	}
	if IsBasePath("/etc", bases) {
		t.Error("expected false for unrelated path")
	}
}
