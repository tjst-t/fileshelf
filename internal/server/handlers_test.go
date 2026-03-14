package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/tjst-t/fileshelf/internal/config"
	"github.com/tjst-t/fileshelf/internal/fileop"
)

// mockFileOperator implements fileop.FileOperator for testing.
type mockFileOperator struct {
	accessErr error
	entries   []fileop.Entry
	listErr   error
	readData  string
	readErr   error
	writeErr  error
	mkdirErr  error
	deleteErr error
	renameErr error
	copyErr   error
	statEntry *fileop.Entry
	statErr   error
}

func (m *mockFileOperator) Access(_ context.Context, _ fileop.User, _ string) error {
	return m.accessErr
}
func (m *mockFileOperator) List(_ context.Context, _ fileop.User, _ string) ([]fileop.Entry, error) {
	return m.entries, m.listErr
}
func (m *mockFileOperator) Read(_ context.Context, _ fileop.User, _ string) (io.ReadCloser, error) {
	if m.readErr != nil {
		return nil, m.readErr
	}
	return io.NopCloser(strings.NewReader(m.readData)), nil
}
func (m *mockFileOperator) Write(_ context.Context, _ fileop.User, _ string, _ io.Reader) error {
	return m.writeErr
}
func (m *mockFileOperator) Mkdir(_ context.Context, _ fileop.User, _ string) error {
	return m.mkdirErr
}
func (m *mockFileOperator) Delete(_ context.Context, _ fileop.User, _ string) error {
	return m.deleteErr
}
func (m *mockFileOperator) Rename(_ context.Context, _ fileop.User, _, _ string) error {
	return m.renameErr
}
func (m *mockFileOperator) Copy(_ context.Context, _ fileop.User, _, _ string) error {
	return m.copyErr
}
func (m *mockFileOperator) ReadRange(_ context.Context, _ fileop.User, _ string, offset, length int64) (io.ReadCloser, error) {
	if m.readErr != nil {
		return nil, m.readErr
	}
	data := m.readData
	if offset > 0 && int(offset) < len(data) {
		data = data[offset:]
	}
	if length > 0 && int(length) < len(data) {
		data = data[:length]
	}
	return io.NopCloser(strings.NewReader(data)), nil
}
func (m *mockFileOperator) Stat(_ context.Context, _ fileop.User, _ string) (*fileop.Entry, error) {
	return m.statEntry, m.statErr
}

func testConfig() *config.Config {
	return &config.Config{
		Server: config.ServerConfig{
			DevMode: true,
			DevUser: "testuser",
		},
		Shares: []config.Share{
			{Name: "media", Path: "/tank/media"},
			{Name: "docs", Path: "/tank/docs"},
		},
	}
}

func testUser() *fileop.User {
	return &fileop.User{Username: "testuser", UID: 1000, GID: 1000}
}

// withUser injects a user into the request context for testing.
func withUser(r *http.Request, u *fileop.User) *http.Request {
	ctx := context.WithValue(r.Context(), userContextKey, u)
	return r.WithContext(ctx)
}

func TestHandleShares(t *testing.T) {
	mock := &mockFileOperator{accessErr: nil}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/shares", nil)
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleShares(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusOK)
	}

	var shares []map[string]string
	json.Unmarshal(rr.Body.Bytes(), &shares)
	if len(shares) != 2 {
		t.Errorf("shares=%d, want 2", len(shares))
	}
}

func TestHandleFilesList(t *testing.T) {
	mock := &mockFileOperator{
		entries: []fileop.Entry{
			{Name: "movie.mkv", Type: "file", Size: 1024, Modified: time.Now(), Perms: "-rw-r--r--"},
		},
	}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/files?path=/media/movies", nil)
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesList(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusOK)
	}

	var result map[string][]fileop.Entry
	json.Unmarshal(rr.Body.Bytes(), &result)
	if len(result["entries"]) != 1 {
		t.Errorf("entries=%d, want 1", len(result["entries"]))
	}
}

func TestHandleFilesListMissingPath(t *testing.T) {
	h := &Handlers{FileOp: &mockFileOperator{}, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/files", nil)
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesList(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusBadRequest)
	}
}

func TestHandleFilesStat(t *testing.T) {
	mock := &mockFileOperator{
		statEntry: &fileop.Entry{Name: "file.txt", Type: "file", Size: 42},
	}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/files/stat?path=/media/file.txt", nil)
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesStat(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusOK)
	}
}

func TestHandleFilesDownload(t *testing.T) {
	mock := &mockFileOperator{readData: "file content"}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/files/download?path=/media/test.txt", nil)
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesDownload(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusOK)
	}
	if rr.Body.String() != "file content" {
		t.Errorf("body=%q, want %q", rr.Body.String(), "file content")
	}
	if !strings.Contains(rr.Header().Get("Content-Disposition"), "attachment") {
		t.Error("expected Content-Disposition: attachment")
	}
}

func TestHandleFilesMkdir(t *testing.T) {
	mock := &mockFileOperator{}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	body := `{"path":"/media/newdir"}`
	req := httptest.NewRequest("POST", "/api/files/mkdir", bytes.NewBufferString(body))
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesMkdir(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusOK)
	}
}

func TestHandleFilesDelete(t *testing.T) {
	mock := &mockFileOperator{}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("DELETE", "/api/files?path=/media/old.txt", nil)
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesDelete(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusOK)
	}
}

func TestHandleFilesRename(t *testing.T) {
	mock := &mockFileOperator{}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	body := `{"path":"/media/old.txt","dest":"/media/new.txt"}`
	req := httptest.NewRequest("POST", "/api/files/rename", bytes.NewBufferString(body))
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesRename(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusOK)
	}
}

func TestHandleFilesCopy(t *testing.T) {
	mock := &mockFileOperator{}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	body := `{"path":"/media/src.txt","dest":"/docs/dst.txt"}`
	req := httptest.NewRequest("POST", "/api/files/copy", bytes.NewBufferString(body))
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesCopy(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusOK)
	}
}

func TestHandleHelperPermissionError(t *testing.T) {
	mock := &mockFileOperator{
		listErr: &fileop.HelperError{Message: "permission denied", ExitCode: 1},
	}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/files?path=/media/secret", nil)
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesList(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusForbidden)
	}
}

func TestHandleHelperNotFoundError(t *testing.T) {
	mock := &mockFileOperator{
		statErr: &fileop.HelperError{Message: "not found", ExitCode: 2},
	}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/files/stat?path=/media/missing.txt", nil)
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesStat(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusNotFound)
	}
}

func TestHandleFilesPreviewNoRange(t *testing.T) {
	mock := &mockFileOperator{
		readData:  "hello world video data",
		statEntry: &fileop.Entry{Name: "clip.mp4", Type: "file", Size: 22},
	}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/files/preview?path=/media/clip.mp4", nil)
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesPreview(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusOK)
	}
	if rr.Header().Get("Accept-Ranges") != "bytes" {
		t.Error("expected Accept-Ranges: bytes")
	}
	if rr.Header().Get("Content-Length") != "22" {
		t.Errorf("Content-Length=%q, want %q", rr.Header().Get("Content-Length"), "22")
	}
	if rr.Body.String() != "hello world video data" {
		t.Errorf("body=%q, want %q", rr.Body.String(), "hello world video data")
	}
}

func TestHandleFilesPreviewRangeNormal(t *testing.T) {
	// "0123456789" (10 bytes), request bytes=0-4 → "01234"
	mock := &mockFileOperator{
		readData:  "0123456789",
		statEntry: &fileop.Entry{Name: "clip.mp4", Type: "file", Size: 10},
	}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/files/preview?path=/media/clip.mp4", nil)
	req.Header.Set("Range", "bytes=0-4")
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesPreview(rr, req)

	if rr.Code != http.StatusPartialContent {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusPartialContent)
	}
	if got := rr.Header().Get("Content-Range"); got != "bytes 0-4/10" {
		t.Errorf("Content-Range=%q, want %q", got, "bytes 0-4/10")
	}
	if rr.Header().Get("Content-Length") != "5" {
		t.Errorf("Content-Length=%q, want %q", rr.Header().Get("Content-Length"), "5")
	}
	if rr.Body.String() != "01234" {
		t.Errorf("body=%q, want %q", rr.Body.String(), "01234")
	}
}

func TestHandleFilesPreviewRangeOpenEnded(t *testing.T) {
	// "0123456789" (10 bytes), request bytes=7- → "789"
	mock := &mockFileOperator{
		readData:  "0123456789",
		statEntry: &fileop.Entry{Name: "clip.mp4", Type: "file", Size: 10},
	}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/files/preview?path=/media/clip.mp4", nil)
	req.Header.Set("Range", "bytes=7-")
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesPreview(rr, req)

	if rr.Code != http.StatusPartialContent {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusPartialContent)
	}
	if got := rr.Header().Get("Content-Range"); got != "bytes 7-9/10" {
		t.Errorf("Content-Range=%q, want %q", got, "bytes 7-9/10")
	}
	if rr.Body.String() != "789" {
		t.Errorf("body=%q, want %q", rr.Body.String(), "789")
	}
}

func TestHandleFilesPreviewRangeSuffix(t *testing.T) {
	// "0123456789" (10 bytes), request bytes=-3 → "789"
	mock := &mockFileOperator{
		readData:  "0123456789",
		statEntry: &fileop.Entry{Name: "clip.mp4", Type: "file", Size: 10},
	}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/files/preview?path=/media/clip.mp4", nil)
	req.Header.Set("Range", "bytes=-3")
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesPreview(rr, req)

	if rr.Code != http.StatusPartialContent {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusPartialContent)
	}
	if got := rr.Header().Get("Content-Range"); got != "bytes 7-9/10" {
		t.Errorf("Content-Range=%q, want %q", got, "bytes 7-9/10")
	}
	if rr.Body.String() != "789" {
		t.Errorf("body=%q, want %q", rr.Body.String(), "789")
	}
}

func TestHandleFilesPreviewRangeInvalid(t *testing.T) {
	mock := &mockFileOperator{
		readData:  "0123456789",
		statEntry: &fileop.Entry{Name: "clip.mp4", Type: "file", Size: 10},
	}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	tests := []struct {
		name       string
		rangeVal   string
		wantStatus int
	}{
		{"start beyond size", "bytes=20-30", http.StatusRequestedRangeNotSatisfiable},
		{"start > end", "bytes=5-3", http.StatusRequestedRangeNotSatisfiable},
		{"multiple ranges", "bytes=0-1,3-4", http.StatusRequestedRangeNotSatisfiable},
		{"not bytes unit", "items=0-4", http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/files/preview?path=/media/clip.mp4", nil)
			req.Header.Set("Range", tt.rangeVal)
			req = withUser(req, testUser())
			rr := httptest.NewRecorder()

			h.HandleFilesPreview(rr, req)

			if rr.Code != tt.wantStatus {
				t.Errorf("status=%d, want %d", rr.Code, tt.wantStatus)
			}
		})
	}
}

func TestHandleFilesPreviewRangeClampEnd(t *testing.T) {
	// end exceeds file size → clamped to totalSize-1
	mock := &mockFileOperator{
		readData:  "0123456789",
		statEntry: &fileop.Entry{Name: "clip.mp4", Type: "file", Size: 10},
	}
	h := &Handlers{FileOp: mock, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/files/preview?path=/media/clip.mp4", nil)
	req.Header.Set("Range", "bytes=5-999")
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleFilesPreview(rr, req)

	if rr.Code != http.StatusPartialContent {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusPartialContent)
	}
	if got := rr.Header().Get("Content-Range"); got != "bytes 5-9/10" {
		t.Errorf("Content-Range=%q, want %q", got, "bytes 5-9/10")
	}
	if rr.Body.String() != "56789" {
		t.Errorf("body=%q, want %q", rr.Body.String(), "56789")
	}
}

func TestResolvePath(t *testing.T) {
	h := &Handlers{Config: testConfig()}

	tests := []struct {
		virtual string
		want    string
	}{
		{"/media/movies", "/tank/media/movies"},
		{"/media", "/tank/media"},
		{"/docs/readme.txt", "/tank/docs/readme.txt"},
		{"/unknown/path", "/unknown/path"},
	}

	for _, tt := range tests {
		got := h.resolvePath(tt.virtual)
		if got != tt.want {
			t.Errorf("resolvePath(%q)=%q, want %q", tt.virtual, got, tt.want)
		}
	}
}

func TestNoAuth(t *testing.T) {
	h := &Handlers{FileOp: &mockFileOperator{}, Config: testConfig()}

	req := httptest.NewRequest("GET", "/api/shares", nil)
	// No user in context
	rr := httptest.NewRecorder()

	h.HandleShares(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("status=%d, want %d", rr.Code, http.StatusUnauthorized)
	}
}
