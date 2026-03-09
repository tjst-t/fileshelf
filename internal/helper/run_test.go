package helper

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunRejectsUID0(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run(Params{
		Op:    "list",
		UID:   0,
		GID:   1000,
		Path:  "/tmp",
		Bases: []string{"/tmp"},
	}, nil, &stdout, &stderr)

	if code != ExitSecurity {
		t.Errorf("expected ExitSecurity(%d), got %d", ExitSecurity, code)
	}
}

func TestRunRejectsUnknownOp(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run(Params{
		Op:    "evil",
		UID:   1000,
		GID:   1000,
		Path:  "/tmp",
		Bases: []string{"/tmp"},
	}, nil, &stdout, &stderr)

	if code != ExitBadArgs {
		t.Errorf("expected ExitBadArgs(%d), got %d", ExitBadArgs, code)
	}
}

func TestRunRejectsPathTraversal(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run(Params{
		Op:    "list",
		UID:   1000,
		GID:   1000,
		Path:  "/tmp/../../etc/passwd",
		Bases: []string{"/tmp"},
	}, nil, &stdout, &stderr)

	if code != ExitSecurity {
		t.Errorf("expected ExitSecurity(%d), got %d", ExitSecurity, code)
	}
}

func TestRunRenameRequiresDest(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run(Params{
		Op:    "rename",
		UID:   1000,
		GID:   1000,
		Path:  "/tmp/foo",
		Dest:  "",
		Bases: []string{"/tmp"},
	}, nil, &stdout, &stderr)

	if code != ExitBadArgs {
		t.Errorf("expected ExitBadArgs(%d), got %d", ExitBadArgs, code)
	}
}

func TestOperationsIntegration(t *testing.T) {
	// Use a real temp directory as base
	base := t.TempDir()
	bases := []string{base}

	// Test mkdir
	dirPath := filepath.Join(base, "testdir")
	t.Run("mkdir", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "mkdir", UID: os.Getuid(), GID: os.Getgid(), Path: dirPath, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("mkdir failed: code=%d stderr=%s", code, stderr.String())
		}
		if _, err := os.Stat(dirPath); err != nil {
			t.Fatalf("directory not created: %v", err)
		}
	})

	// Test write
	filePath := filepath.Join(base, "testfile.txt")
	t.Run("write", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "write", UID: os.Getuid(), GID: os.Getgid(), Path: filePath, Bases: bases},
			strings.NewReader("hello world"), &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("write failed: code=%d stderr=%s", code, stderr.String())
		}
	})

	// Test read
	t.Run("read", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "read", UID: os.Getuid(), GID: os.Getgid(), Path: filePath, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("read failed: code=%d stderr=%s", code, stderr.String())
		}
		if stdout.String() != "hello world" {
			t.Errorf("read got %q, want %q", stdout.String(), "hello world")
		}
	})

	// Test stat
	t.Run("stat", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "stat", UID: os.Getuid(), GID: os.Getgid(), Path: filePath, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("stat failed: code=%d stderr=%s", code, stderr.String())
		}
		var entry Entry
		if err := json.Unmarshal(stdout.Bytes(), &entry); err != nil {
			t.Fatalf("failed to parse stat output: %v", err)
		}
		if entry.Name != "testfile.txt" {
			t.Errorf("stat name=%q, want %q", entry.Name, "testfile.txt")
		}
		if entry.Type != "file" {
			t.Errorf("stat type=%q, want %q", entry.Type, "file")
		}
		if entry.Size != 11 {
			t.Errorf("stat size=%d, want 11", entry.Size)
		}
	})

	// Test list
	t.Run("list", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "list", UID: os.Getuid(), GID: os.Getgid(), Path: base, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("list failed: code=%d stderr=%s", code, stderr.String())
		}
		var result ListResponse
		if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
			t.Fatalf("failed to parse list output: %v", err)
		}
		if len(result.Entries) != 2 {
			t.Errorf("list entries=%d, want 2", len(result.Entries))
		}
	})

	// Test copy
	copyDest := filepath.Join(base, "testfile_copy.txt")
	t.Run("copy", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "copy", UID: os.Getuid(), GID: os.Getgid(), Path: filePath, Dest: copyDest, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("copy failed: code=%d stderr=%s", code, stderr.String())
		}
		data, err := os.ReadFile(copyDest)
		if err != nil {
			t.Fatalf("copy dest not found: %v", err)
		}
		if string(data) != "hello world" {
			t.Errorf("copy content=%q, want %q", string(data), "hello world")
		}
	})

	// Test rename
	renameDest := filepath.Join(base, "testfile_renamed.txt")
	t.Run("rename", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "rename", UID: os.Getuid(), GID: os.Getgid(), Path: copyDest, Dest: renameDest, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("rename failed: code=%d stderr=%s", code, stderr.String())
		}
		if _, err := os.Stat(renameDest); err != nil {
			t.Fatalf("rename dest not found: %v", err)
		}
		if _, err := os.Stat(copyDest); !os.IsNotExist(err) {
			t.Errorf("rename source should not exist")
		}
	})

	// Test access
	t.Run("access", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "access", UID: os.Getuid(), GID: os.Getgid(), Path: base, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("access failed: code=%d stderr=%s", code, stderr.String())
		}
	})

	// Test delete
	t.Run("delete", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "delete", UID: os.Getuid(), GID: os.Getgid(), Path: renameDest, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("delete failed: code=%d stderr=%s", code, stderr.String())
		}
		if _, err := os.Stat(renameDest); !os.IsNotExist(err) {
			t.Errorf("delete should have removed the file")
		}
	})
}
