package helper

import "testing"

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
