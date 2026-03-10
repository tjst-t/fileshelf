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

	"github.com/tjst-t/fileshelf/internal/config"
	"github.com/tjst-t/fileshelf/internal/fileop"
)

// accessFilterMock wraps mockFileOperator but denies access to certain paths.
type accessFilterMock struct {
	mockFileOperator
	denyPaths map[string]bool
}

func (m *accessFilterMock) Access(_ context.Context, _ fileop.User, path string) error {
	if m.denyPaths[path] {
		return &fileop.HelperError{Message: "access denied", ExitCode: 1}
	}
	return nil
}

func TestIntegrationShareAccess(t *testing.T) {
	cfg := &config.Config{
		Server: config.ServerConfig{DevMode: true, DevUser: "testuser"},
		Shares: []config.Share{
			{Name: "media", Path: "/tank/media"},
			{Name: "docs", Path: "/tank/docs"},
			{Name: "secret", Path: "/tank/secret"},
		},
	}

	mock := &accessFilterMock{
		denyPaths: map[string]bool{"/tank/secret": true},
	}

	h := &Handlers{FileOp: mock, Config: cfg}

	req := httptest.NewRequest("GET", "/api/shares", nil)
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()

	h.HandleShares(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d, want 200", rr.Code)
	}

	var shares []map[string]string
	json.Unmarshal(rr.Body.Bytes(), &shares)

	if len(shares) != 2 {
		t.Errorf("shares=%d, want 2 (secret should be filtered)", len(shares))
	}
}

func TestIntegrationUploadDownload(t *testing.T) {
	mock := &mockFileOperator{readData: "uploaded content"}
	cfg := testConfig()
	h := &Handlers{FileOp: mock, Config: cfg}

	// Upload
	uploadReq := httptest.NewRequest("PUT", "/api/files/upload?path=/media/new.txt", strings.NewReader("uploaded content"))
	uploadReq = withUser(uploadReq, testUser())
	uploadRR := httptest.NewRecorder()
	h.HandleFilesUpload(uploadRR, uploadReq)
	if uploadRR.Code != http.StatusOK {
		t.Fatalf("upload status=%d, want 200", uploadRR.Code)
	}

	// Download
	dlReq := httptest.NewRequest("GET", "/api/files/download?path=/media/new.txt", nil)
	dlReq = withUser(dlReq, testUser())
	dlRR := httptest.NewRecorder()
	h.HandleFilesDownload(dlRR, dlReq)
	if dlRR.Code != http.StatusOK {
		t.Fatalf("download status=%d, want 200", dlRR.Code)
	}
	if dlRR.Body.String() != "uploaded content" {
		t.Errorf("body=%q, want %q", dlRR.Body.String(), "uploaded content")
	}
}

func TestIntegrationCopyMove(t *testing.T) {
	mock := &mockFileOperator{}
	cfg := testConfig()
	h := &Handlers{FileOp: mock, Config: cfg}

	// Copy
	copyBody := `{"path":"/media/src.txt","dest":"/docs/copy.txt"}`
	copyReq := httptest.NewRequest("POST", "/api/files/copy", bytes.NewBufferString(copyBody))
	copyReq = withUser(copyReq, testUser())
	copyRR := httptest.NewRecorder()
	h.HandleFilesCopy(copyRR, copyReq)
	if copyRR.Code != http.StatusOK {
		t.Fatalf("copy status=%d, want 200", copyRR.Code)
	}

	// Rename/Move
	moveBody := `{"path":"/media/old.txt","dest":"/media/new.txt"}`
	moveReq := httptest.NewRequest("POST", "/api/files/rename", bytes.NewBufferString(moveBody))
	moveReq = withUser(moveReq, testUser())
	moveRR := httptest.NewRecorder()
	h.HandleFilesRename(moveRR, moveReq)
	if moveRR.Code != http.StatusOK {
		t.Fatalf("rename status=%d, want 200", moveRR.Code)
	}
}

func TestIntegrationFullRouter(t *testing.T) {
	mock := &mockFileOperator{
		entries: []fileop.Entry{
			{Name: "file1.txt", Type: "file", Size: 100},
		},
		statEntry: &fileop.Entry{Name: "file1.txt", Type: "file", Size: 100},
		readData:  "file content",
	}

	cfg := &config.Config{
		Server: config.ServerConfig{
			DevMode:   true,
			DevUser:   "ubuntu",
			StaticDir: "/nonexistent",
		},
		Shares: []config.Share{
			{Name: "media", Path: "/tank/media"},
		},
	}

	router := NewRouter(cfg, mock)
	ts := httptest.NewServer(router)
	defer ts.Close()

	// GET /api/shares
	resp, err := http.Get(ts.URL + "/api/shares")
	if err != nil {
		t.Fatalf("shares: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("shares status=%d, want 200", resp.StatusCode)
	}
	resp.Body.Close()

	// GET /api/files?path=/media
	resp, err = http.Get(ts.URL + "/api/files?path=/media")
	if err != nil {
		t.Fatalf("files: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("files status=%d, want 200", resp.StatusCode)
	}
	resp.Body.Close()

	// GET /api/files/download?path=/media/file1.txt
	resp, err = http.Get(ts.URL + "/api/files/download?path=/media/file1.txt")
	if err != nil {
		t.Fatalf("download: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("download status=%d, want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "file content" {
		t.Errorf("download body=%q, want %q", string(body), "file content")
	}
	resp.Body.Close()

	// POST /api/files/mkdir
	mkdirBody := `{"path":"/media/newdir"}`
	resp, err = http.Post(ts.URL+"/api/files/mkdir", "application/json", strings.NewReader(mkdirBody))
	if err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("mkdir status=%d, want 200", resp.StatusCode)
	}
	resp.Body.Close()

	// DELETE /api/files?path=/media/file1.txt
	delReq, _ := http.NewRequest("DELETE", ts.URL+"/api/files?path=/media/file1.txt", nil)
	resp, err = http.DefaultClient.Do(delReq)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("delete status=%d, want 200", resp.StatusCode)
	}
	resp.Body.Close()

	// PUT /api/files/upload?path=/media/upload.txt
	uploadReq, _ := http.NewRequest("PUT", ts.URL+"/api/files/upload?path=/media/upload.txt", strings.NewReader("upload data"))
	resp, err = http.DefaultClient.Do(uploadReq)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("upload status=%d, want 200", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestIntegrationPermissionErrorFlow(t *testing.T) {
	mock := &mockFileOperator{
		listErr: &fileop.HelperError{Message: "permission denied", ExitCode: 1},
	}
	cfg := testConfig()
	h := &Handlers{FileOp: mock, Config: cfg}

	req := httptest.NewRequest("GET", "/api/files?path=/media/secret", nil)
	req = withUser(req, testUser())
	rr := httptest.NewRecorder()
	h.HandleFilesList(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("status=%d, want 403", rr.Code)
	}

	var body map[string]string
	json.Unmarshal(rr.Body.Bytes(), &body)
	if body["error"] != "permission denied" {
		t.Errorf("error=%q, want %q", body["error"], "permission denied")
	}
}
