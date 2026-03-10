package server

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/tjst-t/fileshelf/internal/config"
	"github.com/tjst-t/fileshelf/internal/fileop"
	"github.com/tjst-t/fileshelf/internal/version"
)

// Handlers holds dependencies for HTTP handlers.
type Handlers struct {
	FileOp fileop.FileOperator
	Config *config.Config
}

// HandleVersion returns the server version.
func (h *Handlers) HandleVersion(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{
		"version": version.Version,
		"commit":  version.Commit,
	})
}

// HandleShares returns the list of shares accessible by the current user.
func (h *Handlers) HandleShares(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	type shareInfo struct {
		Name string `json:"name"`
		Path string `json:"path"`
	}

	var accessible []shareInfo
	for _, s := range h.Config.Shares {
		if err := h.FileOp.Access(r.Context(), *user, s.Path); err == nil {
			accessible = append(accessible, shareInfo{Name: s.Name, Path: s.Path})
		}
	}

	if accessible == nil {
		accessible = []shareInfo{}
	}

	writeJSON(w, accessible)
}

// HandleFilesList returns directory listing.
func (h *Handlers) HandleFilesList(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSONError(w, "path parameter is required", http.StatusBadRequest)
		return
	}

	absPath := h.resolvePath(path)

	entries, err := h.FileOp.List(r.Context(), *user, absPath)
	if err != nil {
		writeHelperError(w, err)
		return
	}

	writeJSON(w, map[string]interface{}{"entries": entries})
}

// HandleFilesStat returns file/directory info.
func (h *Handlers) HandleFilesStat(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSONError(w, "path parameter is required", http.StatusBadRequest)
		return
	}

	absPath := h.resolvePath(path)

	entry, err := h.FileOp.Stat(r.Context(), *user, absPath)
	if err != nil {
		writeHelperError(w, err)
		return
	}

	writeJSON(w, entry)
}

// HandleFilesDownload serves a file for download.
func (h *Handlers) HandleFilesDownload(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSONError(w, "path parameter is required", http.StatusBadRequest)
		return
	}

	absPath := h.resolvePath(path)

	rc, err := h.FileOp.Read(r.Context(), *user, absPath)
	if err != nil {
		writeHelperError(w, err)
		return
	}
	defer rc.Close()

	filename := filepath.Base(absPath)
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")

	ct := mime.TypeByExtension(filepath.Ext(filename))
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)

	io.Copy(w, rc)
}

// HandleFilesPreview returns text content for preview.
func (h *Handlers) HandleFilesPreview(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSONError(w, "path parameter is required", http.StatusBadRequest)
		return
	}

	absPath := h.resolvePath(path)

	rc, err := h.FileOp.Read(r.Context(), *user, absPath)
	if err != nil {
		writeHelperError(w, err)
		return
	}
	defer rc.Close()

	ct := mime.TypeByExtension(filepath.Ext(absPath))
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)

	io.Copy(w, rc)
}

// HandleFilesUpload handles file upload via request body.
func (h *Handlers) HandleFilesUpload(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSONError(w, "path parameter is required", http.StatusBadRequest)
		return
	}

	absPath := h.resolvePath(path)

	if err := h.FileOp.Write(r.Context(), *user, absPath, r.Body); err != nil {
		writeHelperError(w, err)
		return
	}

	writeJSON(w, map[string]bool{"ok": true})
}

// HandleFilesMkdir creates a directory.
func (h *Handlers) HandleFilesMkdir(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Path == "" {
		writeJSONError(w, "path is required", http.StatusBadRequest)
		return
	}

	absPath := h.resolvePath(body.Path)

	if err := h.FileOp.Mkdir(r.Context(), *user, absPath); err != nil {
		writeHelperError(w, err)
		return
	}

	writeJSON(w, map[string]bool{"ok": true})
}

// HandleFilesDelete deletes a file or directory.
func (h *Handlers) HandleFilesDelete(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSONError(w, "path parameter is required", http.StatusBadRequest)
		return
	}

	absPath := h.resolvePath(path)

	if err := h.FileOp.Delete(r.Context(), *user, absPath); err != nil {
		writeHelperError(w, err)
		return
	}

	writeJSON(w, map[string]bool{"ok": true})
}

// HandleFilesRename renames/moves a file or directory.
func (h *Handlers) HandleFilesRename(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	var body struct {
		Path string `json:"path"`
		Dest string `json:"dest"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Path == "" || body.Dest == "" {
		writeJSONError(w, "path and dest are required", http.StatusBadRequest)
		return
	}

	absPath := h.resolvePath(body.Path)
	absDest := h.resolvePath(body.Dest)

	if err := h.FileOp.Rename(r.Context(), *user, absPath, absDest); err != nil {
		writeHelperError(w, err)
		return
	}

	writeJSON(w, map[string]bool{"ok": true})
}

// HandleFilesCopy copies a file or directory.
func (h *Handlers) HandleFilesCopy(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	var body struct {
		Path string `json:"path"`
		Dest string `json:"dest"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Path == "" || body.Dest == "" {
		writeJSONError(w, "path and dest are required", http.StatusBadRequest)
		return
	}

	absPath := h.resolvePath(body.Path)
	absDest := h.resolvePath(body.Dest)

	if err := h.FileOp.Copy(r.Context(), *user, absPath, absDest); err != nil {
		writeHelperError(w, err)
		return
	}

	writeJSON(w, map[string]bool{"ok": true})
}

// HandleFilesDownloadZip streams a zip archive containing the requested files/directories.
func (h *Handlers) HandleFilesDownloadZip(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	pathsParam := r.URL.Query().Get("paths")
	if pathsParam == "" {
		writeJSONError(w, "paths parameter is required", http.StatusBadRequest)
		return
	}

	paths := strings.Split(pathsParam, ",")
	if len(paths) == 0 {
		writeJSONError(w, "paths parameter is required", http.StatusBadRequest)
		return
	}

	// Determine zip filename
	zipName := "download.zip"
	if len(paths) == 1 {
		base := filepath.Base(strings.TrimSuffix(paths[0], "/"))
		if base != "" && base != "." && base != "/" {
			zipName = base + ".zip"
		}
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, zipName))

	zw := zip.NewWriter(w)
	defer zw.Close()

	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}

		absPath := h.resolvePath(p)
		entry, err := h.FileOp.Stat(r.Context(), *user, absPath)
		if err != nil {
			// Skip files we can't stat
			continue
		}

		// Use the basename as the top-level name in the zip
		baseName := filepath.Base(absPath)

		if entry.Type == "dir" {
			if err := h.addDirToZip(r, *user, zw, absPath, baseName); err != nil {
				// Best effort: we've already started streaming, can't send error response
				return
			}
		} else {
			if err := h.addFileToZip(r, *user, zw, absPath, baseName); err != nil {
				return
			}
		}
	}
}

// addFileToZip adds a single file to the zip archive.
func (h *Handlers) addFileToZip(r *http.Request, user fileop.User, zw *zip.Writer, absPath, zipPath string) error {
	rc, err := h.FileOp.Read(r.Context(), user, absPath)
	if err != nil {
		return err
	}
	defer rc.Close()

	fw, err := zw.Create(zipPath)
	if err != nil {
		return err
	}

	_, err = io.Copy(fw, rc)
	return err
}

// addDirToZip recursively adds a directory and its contents to the zip archive.
func (h *Handlers) addDirToZip(r *http.Request, user fileop.User, zw *zip.Writer, absPath, zipPath string) error {
	entries, err := h.FileOp.List(r.Context(), user, absPath)
	if err != nil {
		return err
	}

	// Add directory entry (trailing slash)
	if _, err := zw.Create(zipPath + "/"); err != nil {
		return err
	}

	for _, entry := range entries {
		childAbs := filepath.Join(absPath, entry.Name)
		childZip := zipPath + "/" + entry.Name

		if entry.Type == "dir" {
			if err := h.addDirToZip(r, user, zw, childAbs, childZip); err != nil {
				return err
			}
		} else {
			if err := h.addFileToZip(r, user, zw, childAbs, childZip); err != nil {
				return err
			}
		}
	}

	return nil
}

// resolvePath converts a virtual path like "/media/movies" to the real filesystem path.
// Virtual paths start with the share name as the first component.
func (h *Handlers) resolvePath(virtualPath string) string {
	// Clean the path
	virtualPath = filepath.Clean("/" + virtualPath)

	// Split into components: /sharename/rest/of/path
	parts := strings.SplitN(strings.TrimPrefix(virtualPath, "/"), "/", 2)
	if len(parts) == 0 {
		return virtualPath
	}

	shareName := parts[0]
	for _, s := range h.Config.Shares {
		if s.Name == shareName {
			if len(parts) == 1 {
				return s.Path
			}
			return filepath.Join(s.Path, parts[1])
		}
	}

	// If no share matched, return as-is (will fail validation in helper)
	return virtualPath
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeJSONError(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func writeHelperError(w http.ResponseWriter, err error) {
	if he, ok := err.(*fileop.HelperError); ok {
		status := http.StatusInternalServerError
		if he.IsPermission() {
			status = http.StatusForbidden
		} else if he.IsNotFound() {
			status = http.StatusNotFound
		} else if he.IsExists() {
			status = http.StatusConflict
		}
		writeJSONError(w, he.Message, status)
		return
	}
	writeJSONError(w, err.Error(), http.StatusInternalServerError)
}
