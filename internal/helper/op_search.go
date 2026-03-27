package helper

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// SearchEntry represents a file/directory found by search.
type SearchEntry struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
	Perms    string `json:"perms"`
	Owner    string `json:"owner"`
	Group    string `json:"group"`
	Dir      string `json:"dir"` // relative directory path from basePath
}

// SearchResponse is the output of the search operation.
type SearchResponse struct {
	Results []SearchEntry `json:"results"`
}

// OpSearch walks basePath recursively and returns entries whose names
// contain query (case-insensitive). Results are capped at maxResults.
func OpSearch(basePath string, query string, maxResults int) (*SearchResponse, error) {
	if maxResults <= 0 {
		maxResults = 200
	}

	lowerQuery := strings.ToLower(query)
	var results []SearchEntry

	err := filepath.WalkDir(basePath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if os.IsPermission(err) {
				if d != nil && d.IsDir() {
					return fs.SkipDir
				}
				return nil
			}
			return nil
		}

		// Skip the root itself
		if path == basePath {
			return nil
		}

		name := d.Name()
		if !strings.Contains(strings.ToLower(name), lowerQuery) {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}

		typ := "file"
		if d.IsDir() {
			typ = "dir"
		}

		// Relative directory from basePath
		rel, _ := filepath.Rel(basePath, filepath.Dir(path))
		if rel == "." {
			rel = ""
		}

		owner, group := resolveOwnerGroup(info)
		results = append(results, SearchEntry{
			Name:     name,
			Type:     typ,
			Size:     info.Size(),
			Modified: info.ModTime().UTC().Format("2006-01-02T15:04:05Z"),
			Perms:    info.Mode().Perm().String(),
			Owner:    owner,
			Group:    group,
			Dir:      rel,
		})

		if len(results) >= maxResults {
			return filepath.SkipAll
		}

		return nil
	})

	if err != nil && len(results) == 0 {
		return nil, err
	}

	if results == nil {
		results = []SearchEntry{}
	}

	return &SearchResponse{Results: results}, nil
}
