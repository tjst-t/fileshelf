package helper

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestOpSearch(t *testing.T) {
	// Create temp directory structure
	dir := t.TempDir()
	// dir/
	//   foo.txt
	//   bar.txt
	//   sub/
	//     foo_sub.txt
	//     baz.txt
	//   deep/
	//     nested/
	//       FOOBAR.log

	os.WriteFile(filepath.Join(dir, "foo.txt"), []byte("a"), 0644)
	os.WriteFile(filepath.Join(dir, "bar.txt"), []byte("b"), 0644)
	os.MkdirAll(filepath.Join(dir, "sub"), 0755)
	os.WriteFile(filepath.Join(dir, "sub", "foo_sub.txt"), []byte("c"), 0644)
	os.WriteFile(filepath.Join(dir, "sub", "baz.txt"), []byte("d"), 0644)
	os.MkdirAll(filepath.Join(dir, "deep", "nested"), 0755)
	os.WriteFile(filepath.Join(dir, "deep", "nested", "FOOBAR.log"), []byte("e"), 0644)

	tests := []struct {
		name      string
		query     string
		wantCount int
		wantNames map[string]bool // unordered set of expected names
	}{
		{
			name:      "match foo case-insensitive",
			query:     "foo",
			wantCount: 3,
			wantNames: map[string]bool{"foo.txt": true, "foo_sub.txt": true, "FOOBAR.log": true},
		},
		{
			name:      "match bar",
			query:     "bar",
			wantCount: 2,
			wantNames: map[string]bool{"bar.txt": true, "FOOBAR.log": true},
		},
		{
			name:      "match baz",
			query:     "baz",
			wantCount: 1,
			wantNames: map[string]bool{"baz.txt": true},
		},
		{
			name:      "no match",
			query:     "xyz",
			wantCount: 0,
		},
		{
			name:      "match directory name",
			query:     "nested",
			wantCount: 1,
			wantNames: map[string]bool{"nested": true},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp, err := OpSearch(dir, tt.query, 0)
			if err != nil {
				t.Fatalf("OpSearch error: %v", err)
			}
			if len(resp.Results) != tt.wantCount {
				names := make([]string, len(resp.Results))
				for i, r := range resp.Results {
					names[i] = r.Name
				}
				t.Fatalf("got %d results %v, want %d", len(resp.Results), names, tt.wantCount)
			}
			for _, r := range resp.Results {
				if tt.wantNames != nil && !tt.wantNames[r.Name] {
					t.Errorf("unexpected result: %q", r.Name)
				}
			}
		})
	}
}

func TestOpSearchMaxResults(t *testing.T) {
	dir := t.TempDir()
	// Create 10 files matching "item"
	for i := 0; i < 10; i++ {
		os.WriteFile(filepath.Join(dir, fmt.Sprintf("item_%02d.txt", i)), []byte("x"), 0644)
	}

	resp, err := OpSearch(dir, "item", 3)
	if err != nil {
		t.Fatalf("OpSearch error: %v", err)
	}
	if len(resp.Results) != 3 {
		t.Errorf("got %d results, want 3", len(resp.Results))
	}
}

func TestOpSearchDirField(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "a", "b"), 0755)
	os.WriteFile(filepath.Join(dir, "top.txt"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(dir, "a", "mid.txt"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(dir, "a", "b", "deep.txt"), []byte("x"), 0644)

	resp, err := OpSearch(dir, "txt", 0)
	if err != nil {
		t.Fatalf("OpSearch error: %v", err)
	}

	dirMap := make(map[string]string)
	for _, r := range resp.Results {
		dirMap[r.Name] = r.Dir
	}

	if dirMap["top.txt"] != "" {
		t.Errorf("top.txt dir=%q, want empty", dirMap["top.txt"])
	}
	if dirMap["mid.txt"] != "a" {
		t.Errorf("mid.txt dir=%q, want %q", dirMap["mid.txt"], "a")
	}
	if dirMap["deep.txt"] != "a/b" {
		t.Errorf("deep.txt dir=%q, want %q", dirMap["deep.txt"], "a/b")
	}
}

func TestOpSearchEmptyDir(t *testing.T) {
	dir := t.TempDir()
	resp, err := OpSearch(dir, "foo", 0)
	if err != nil {
		t.Fatalf("OpSearch error: %v", err)
	}
	if len(resp.Results) != 0 {
		t.Errorf("expected 0 results, got %d", len(resp.Results))
	}
}

func TestOpSearchResultFields(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "test.txt"), []byte("hello"), 0644)

	resp, err := OpSearch(dir, "test", 0)
	if err != nil {
		t.Fatalf("OpSearch error: %v", err)
	}
	if len(resp.Results) != 1 {
		t.Fatalf("got %d results, want 1", len(resp.Results))
	}

	r := resp.Results[0]
	if r.Name != "test.txt" {
		t.Errorf("name=%q, want %q", r.Name, "test.txt")
	}
	if r.Type != "file" {
		t.Errorf("type=%q, want %q", r.Type, "file")
	}
	if r.Size != 5 {
		t.Errorf("size=%d, want 5", r.Size)
	}
	if r.Modified == "" {
		t.Error("modified is empty")
	}
	if r.Perms == "" {
		t.Error("perms is empty")
	}
}

