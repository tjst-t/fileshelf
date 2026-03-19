package server

import (
	"archive/zip"
	"compress/flate"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/tjst-t/fileshelf/internal/config"
	"github.com/tjst-t/fileshelf/internal/fileop"
	"github.com/tjst-t/fileshelf/internal/version"
)

// Handlers holds dependencies for HTTP handlers.
type Handlers struct {
	FileOp   fileop.FileOperator
	Config   *config.Config
	zipCache sync.Map // map[string]*zipCacheEntry (key: absPath)
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

// HandleFilesPreview returns file content for preview, with Range request support for media streaming.
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

	ct := mime.TypeByExtension(filepath.Ext(absPath))
	if ct == "" {
		ct = "application/octet-stream"
	}

	// Check for Range header to support video/audio seeking
	rangeHeader := r.Header.Get("Range")
	if rangeHeader != "" {
		h.serveRangePreview(w, r, *user, absPath, ct, rangeHeader)
		return
	}

	// No Range header: serve full file
	entry, err := h.FileOp.Stat(r.Context(), *user, absPath)
	if err != nil {
		writeHelperError(w, err)
		return
	}

	rc, err := h.FileOp.Read(r.Context(), *user, absPath)
	if err != nil {
		writeHelperError(w, err)
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Length", strconv.FormatInt(entry.Size, 10))
	w.Header().Set("Accept-Ranges", "bytes")

	io.Copy(w, rc)
}

// serveRangePreview handles HTTP Range requests for media streaming.
func (h *Handlers) serveRangePreview(w http.ResponseWriter, r *http.Request, user fileop.User, absPath, contentType, rangeHeader string) {
	// Parse "bytes=start-end"
	if !strings.HasPrefix(rangeHeader, "bytes=") {
		writeJSONError(w, "invalid range header", http.StatusBadRequest)
		return
	}

	entry, err := h.FileOp.Stat(r.Context(), user, absPath)
	if err != nil {
		writeHelperError(w, err)
		return
	}
	totalSize := entry.Size

	rangeSpec := strings.TrimPrefix(rangeHeader, "bytes=")
	// Support only single range (what video players use)
	if strings.Contains(rangeSpec, ",") {
		writeJSONError(w, "multiple ranges not supported", http.StatusRequestedRangeNotSatisfiable)
		return
	}

	parts := strings.SplitN(rangeSpec, "-", 2)
	if len(parts) != 2 {
		writeJSONError(w, "invalid range spec", http.StatusBadRequest)
		return
	}

	var start, end int64
	if parts[0] == "" {
		// Suffix range: bytes=-500
		suffixLen, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil || suffixLen <= 0 {
			w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", totalSize))
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		start = totalSize - suffixLen
		if start < 0 {
			start = 0
		}
		end = totalSize - 1
	} else {
		start, err = strconv.ParseInt(parts[0], 10, 64)
		if err != nil || start < 0 {
			w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", totalSize))
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		if parts[1] == "" {
			// Open-ended: bytes=500-
			end = totalSize - 1
		} else {
			end, err = strconv.ParseInt(parts[1], 10, 64)
			if err != nil {
				w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", totalSize))
				w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
				return
			}
		}
	}

	if start > end || start >= totalSize {
		w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", totalSize))
		w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
		return
	}
	if end >= totalSize {
		end = totalSize - 1
	}

	length := end - start + 1

	rc, err := h.FileOp.ReadRange(r.Context(), user, absPath, start, length)
	if err != nil {
		writeHelperError(w, err)
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, totalSize))
	w.Header().Set("Content-Length", strconv.FormatInt(length, 10))
	w.Header().Set("Accept-Ranges", "bytes")
	w.WriteHeader(http.StatusPartialContent)

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
		Path      string `json:"path"`
		Recursive bool   `json:"recursive"`
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

	var err error
	if body.Recursive {
		err = h.FileOp.MkdirAll(r.Context(), *user, absPath)
	} else {
		err = h.FileOp.Mkdir(r.Context(), *user, absPath)
	}
	if err != nil {
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

// zipImageEntry represents an image file found inside a ZIP archive (JSON response).
type zipImageEntry struct {
	Index int    `json:"index"`
	Name  string `json:"name"`
	Size  uint64 `json:"size"`
}

// zipCachedPage holds precomputed metadata for a single image in a ZIP.
type zipCachedPage struct {
	Name           string
	Size           uint64 // uncompressed size
	DataOffset     int64
	CompressedSize int64
	Method         uint16
}

// zipCacheEntry holds cached ZIP metadata so we don't re-parse the central directory.
type zipCacheEntry struct {
	ModTime time.Time
	Size    int64
	Pages   []zipCachedPage
}

// isImageExt returns true if the extension (with leading dot) is a supported image type.
func isImageExt(ext string) bool {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif":
		return true
	}
	return false
}

// fileOpReaderAt implements io.ReaderAt using FileOp.ReadRange.
type fileOpReaderAt struct {
	ctx    context.Context
	fileOp fileop.FileOperator
	user   fileop.User
	path   string
}

func (r *fileOpReaderAt) ReadAt(p []byte, off int64) (int, error) {
	rc, err := r.fileOp.ReadRange(r.ctx, r.user, r.path, off, int64(len(p)))
	if err != nil {
		return 0, err
	}
	defer rc.Close()

	n, err := io.ReadFull(rc, p)
	if err == io.ErrUnexpectedEOF {
		err = io.EOF
	}
	return n, err
}

// getZipPages returns cached ZIP page metadata, parsing the ZIP if not cached or stale.
// Cache is keyed by absPath; mtime is checked to invalidate stale entries.
func (h *Handlers) getZipPages(ctx context.Context, user fileop.User, absPath string) (*zipCacheEntry, error) {
	// Stat once to validate cache or feed the parser
	entry, err := h.FileOp.Stat(ctx, user, absPath)
	if err != nil {
		return nil, err
	}

	// Check cache
	if cached, ok := h.zipCache.Load(absPath); ok {
		ce := cached.(*zipCacheEntry)
		if entry.Modified.Equal(ce.ModTime) && entry.Size == ce.Size {
			return ce, nil
		}
		h.zipCache.Delete(absPath)
	}

	// Parse the ZIP central directory
	ra := &fileOpReaderAt{
		ctx:    ctx,
		fileOp: h.FileOp,
		user:   user,
		path:   absPath,
	}

	zr, err := zip.NewReader(ra, entry.Size)
	if err != nil {
		return nil, fmt.Errorf("failed to parse zip file: %w", err)
	}

	// Collect image entries and precompute DataOffset for each
	var pages []zipCachedPage
	for _, f := range zr.File {
		if f.FileInfo().IsDir() {
			continue
		}
		name := f.Name
		if strings.HasPrefix(name, "__MACOSX/") {
			continue
		}
		base := filepath.Base(name)
		if strings.HasPrefix(base, ".") {
			continue
		}
		if !isImageExt(filepath.Ext(base)) {
			continue
		}
		offset, err := f.DataOffset()
		if err != nil {
			continue
		}
		pages = append(pages, zipCachedPage{
			Name:           name,
			Size:           f.UncompressedSize64,
			DataOffset:     offset,
			CompressedSize: int64(f.CompressedSize64),
			Method:         f.Method,
		})
	}

	sort.Slice(pages, func(i, j int) bool {
		return pages[i].Name < pages[j].Name
	})

	result := &zipCacheEntry{
		ModTime: entry.Modified,
		Size:    entry.Size,
		Pages:   pages,
	}
	h.zipCache.Store(absPath, result)
	return result, nil
}

// HandleZipPages returns the list of image pages in a ZIP file.
func (h *Handlers) HandleZipPages(w http.ResponseWriter, r *http.Request) {
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

	cached, err := h.getZipPages(r.Context(), *user, absPath)
	if err != nil {
		writeHelperError(w, err)
		return
	}

	images := make([]zipImageEntry, len(cached.Pages))
	for i, p := range cached.Pages {
		images[i] = zipImageEntry{Index: i, Name: p.Name, Size: p.Size}
	}

	w.Header().Set("Cache-Control", "private, max-age=86400")
	writeJSON(w, map[string]interface{}{
		"pages": images,
		"total": len(images),
	})
}

// HandleZipPage serves a single image page from a ZIP file.
// Uses cached metadata so only a single ReadRange fork is needed per page.
func (h *Handlers) HandleZipPage(w http.ResponseWriter, r *http.Request) {
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

	pageStr := r.URL.Query().Get("page")
	if pageStr == "" {
		writeJSONError(w, "page parameter is required", http.StatusBadRequest)
		return
	}
	pageIndex, err := strconv.Atoi(pageStr)
	if err != nil || pageIndex < 0 {
		writeJSONError(w, "invalid page parameter", http.StatusBadRequest)
		return
	}

	absPath := h.resolvePath(path)

	cached, err := h.getZipPages(r.Context(), *user, absPath)
	if err != nil {
		writeHelperError(w, err)
		return
	}

	if pageIndex >= len(cached.Pages) {
		writeJSONError(w, "page index out of range", http.StatusNotFound)
		return
	}

	page := cached.Pages[pageIndex]

	ct := mime.TypeByExtension(filepath.Ext(page.Name))
	if ct == "" {
		ct = "application/octet-stream"
	}

	// Single ReadRange call to fetch the compressed data.
	rc, err := h.FileOp.ReadRange(r.Context(), *user, absPath, page.DataOffset, page.CompressedSize)
	if err != nil {
		writeHelperError(w, err)
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "private, max-age=86400, immutable")

	switch page.Method {
	case zip.Store:
		w.Header().Set("Content-Length", strconv.FormatInt(page.CompressedSize, 10))
		io.Copy(w, rc)
	case zip.Deflate:
		w.Header().Set("Content-Length", strconv.FormatUint(page.Size, 10))
		fr := flate.NewReader(rc)
		defer fr.Close()
		io.Copy(w, fr)
	default:
		writeJSONError(w, fmt.Sprintf("unsupported compression method: %d", page.Method), http.StatusUnprocessableEntity)
	}
}

// HandleFilesSearch searches for files by name across accessible shares.
func (h *Handlers) HandleFilesSearch(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	query := r.URL.Query().Get("q")
	if len(query) < 2 {
		writeJSONError(w, "query must be at least 2 characters", http.StatusBadRequest)
		return
	}
	if len(query) > 200 {
		writeJSONError(w, "query too long", http.StatusBadRequest)
		return
	}
	if strings.ContainsRune(query, 0) {
		writeJSONError(w, "invalid query", http.StatusBadRequest)
		return
	}

	maxResults := 200
	scopePath := r.URL.Query().Get("path") // optional: scope search to this virtual path

	type shareResult struct {
		shareName string
		results   []fileop.SearchEntry
		err       error
	}

	type resultEntry struct {
		Name     string `json:"name"`
		Type     string `json:"type"`
		Size     int64  `json:"size"`
		Modified string `json:"modified"`
		Perms    string `json:"perms"`
		Dir      string `json:"dir"` // virtual directory path, e.g. "/media/movies/action"
	}

	var allResults []resultEntry

	if scopePath != "" {
		// Scoped search: search within a specific directory
		absPath := h.resolvePath(scopePath)
		virtualDir := filepath.Clean("/" + scopePath)

		results, err := h.FileOp.Search(r.Context(), *user, absPath, query, maxResults)
		if err != nil {
			writeHelperError(w, err)
			return
		}
		for _, entry := range results {
			dir := virtualDir
			if entry.Dir != "" {
				dir += "/" + entry.Dir
			}
			allResults = append(allResults, resultEntry{
				Name:     entry.Name,
				Type:     entry.Type,
				Size:     entry.Size,
				Modified: entry.Modified,
				Perms:    entry.Perms,
				Dir:      dir,
			})
		}
	} else {
		// Global search: search all accessible shares concurrently
		var accessibleShares []config.Share
		for _, s := range h.Config.Shares {
			if err := h.FileOp.Access(r.Context(), *user, s.Path); err == nil {
				accessibleShares = append(accessibleShares, s)
			}
		}

		ch := make(chan shareResult, len(accessibleShares))
		for _, s := range accessibleShares {
			go func(s config.Share) {
				results, err := h.FileOp.Search(r.Context(), *user, s.Path, query, maxResults)
				ch <- shareResult{shareName: s.Name, results: results, err: err}
			}(s)
		}

		for range accessibleShares {
			sr := <-ch
			if sr.err != nil {
				continue
			}
			for _, entry := range sr.results {
				dir := "/" + sr.shareName
				if entry.Dir != "" {
					dir += "/" + entry.Dir
				}
				allResults = append(allResults, resultEntry{
					Name:     entry.Name,
					Type:     entry.Type,
					Size:     entry.Size,
					Modified: entry.Modified,
					Perms:    entry.Perms,
					Dir:      dir,
				})
				if len(allResults) >= maxResults {
					break
				}
			}
			if len(allResults) >= maxResults {
				break
			}
		}
	}

	if allResults == nil {
		allResults = []resultEntry{}
	}

	writeJSON(w, map[string]interface{}{
		"results": allResults,
		"query":   query,
	})
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
