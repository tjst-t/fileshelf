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
	base := t.TempDir()
	bases := []string{base}
	uid := os.Getuid()
	gid := os.Getgid()

	// mkdir
	dirPath := filepath.Join(base, "testdir")
	t.Run("mkdir", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "mkdir", UID: uid, GID: gid, Path: dirPath, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("mkdir failed: code=%d stderr=%s", code, stderr.String())
		}
		if _, err := os.Stat(dirPath); err != nil {
			t.Fatalf("directory not created: %v", err)
		}
	})

	// mkdir existing — should fail
	t.Run("mkdir existing", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "mkdir", UID: uid, GID: gid, Path: dirPath, Bases: bases}, nil, &stdout, &stderr)
		if code == ExitOK {
			t.Fatal("expected failure for existing directory")
		}
	})

	// write
	filePath := filepath.Join(base, "testfile.txt")
	t.Run("write", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "write", UID: uid, GID: gid, Path: filePath, Bases: bases},
			strings.NewReader("hello world"), &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("write failed: code=%d stderr=%s", code, stderr.String())
		}
		// Verify write response includes size
		var resp WriteResponse
		if err := json.Unmarshal(stdout.Bytes(), &resp); err != nil {
			t.Fatalf("parse write response: %v", err)
		}
		if resp.Size != 11 {
			t.Errorf("write size=%d, want 11", resp.Size)
		}
	})

	// read
	t.Run("read", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "read", UID: uid, GID: gid, Path: filePath, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("read failed: code=%d stderr=%s", code, stderr.String())
		}
		if stdout.String() != "hello world" {
			t.Errorf("read got %q, want %q", stdout.String(), "hello world")
		}
	})

	// read directory — should fail
	t.Run("read directory", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "read", UID: uid, GID: gid, Path: dirPath, Bases: bases}, nil, &stdout, &stderr)
		if code == ExitOK {
			t.Fatal("expected failure for reading directory")
		}
	})

	// stat
	t.Run("stat", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "stat", UID: uid, GID: gid, Path: filePath, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("stat failed: code=%d stderr=%s", code, stderr.String())
		}
		var entry Entry
		if err := json.Unmarshal(stdout.Bytes(), &entry); err != nil {
			t.Fatalf("parse stat: %v", err)
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

	// stat nonexistent
	t.Run("stat nonexistent", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "stat", UID: uid, GID: gid, Path: filepath.Join(base, "nope"), Bases: bases}, nil, &stdout, &stderr)
		if code != ExitNotFound {
			t.Errorf("expected ExitNotFound(%d), got %d", ExitNotFound, code)
		}
	})

	// list
	t.Run("list", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "list", UID: uid, GID: gid, Path: base, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("list failed: code=%d stderr=%s", code, stderr.String())
		}
		var result ListResponse
		if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
			t.Fatalf("parse list: %v", err)
		}
		if len(result.Entries) != 2 {
			t.Errorf("list entries=%d, want 2", len(result.Entries))
		}
	})

	// list on file — should fail
	t.Run("list on file", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "list", UID: uid, GID: gid, Path: filePath, Bases: bases}, nil, &stdout, &stderr)
		if code == ExitOK {
			t.Fatal("expected failure for listing a file")
		}
	})

	// list empty dir
	t.Run("list empty dir", func(t *testing.T) {
		emptyDir := filepath.Join(base, "emptydir")
		os.Mkdir(emptyDir, 0755)
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "list", UID: uid, GID: gid, Path: emptyDir, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("list empty failed: code=%d stderr=%s", code, stderr.String())
		}
		var result ListResponse
		json.Unmarshal(stdout.Bytes(), &result)
		if len(result.Entries) != 0 {
			t.Errorf("list empty entries=%d, want 0", len(result.Entries))
		}
	})

	// copy
	copyDest := filepath.Join(base, "testfile_copy.txt")
	t.Run("copy", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "copy", UID: uid, GID: gid, Path: filePath, Dest: copyDest, Bases: bases}, nil, &stdout, &stderr)
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

	// copy to existing dest — should fail
	t.Run("copy to existing", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "copy", UID: uid, GID: gid, Path: filePath, Dest: copyDest, Bases: bases}, nil, &stdout, &stderr)
		if code == ExitOK {
			t.Fatal("expected failure for copy to existing")
		}
	})

	// rename
	renameDest := filepath.Join(base, "testfile_renamed.txt")
	t.Run("rename", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "rename", UID: uid, GID: gid, Path: copyDest, Dest: renameDest, Bases: bases}, nil, &stdout, &stderr)
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

	// rename to existing dest — should fail
	t.Run("rename to existing", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "rename", UID: uid, GID: gid, Path: filePath, Dest: renameDest, Bases: bases}, nil, &stdout, &stderr)
		if code == ExitOK {
			t.Fatal("expected failure for rename to existing")
		}
	})

	// access
	t.Run("access", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "access", UID: uid, GID: gid, Path: base, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("access failed: code=%d stderr=%s", code, stderr.String())
		}
	})

	// delete base path — should be rejected
	t.Run("delete base path", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "delete", UID: uid, GID: gid, Path: base, Bases: bases}, nil, &stdout, &stderr)
		if code == ExitOK {
			t.Fatal("expected failure for deleting base path")
		}
	})

	// delete
	t.Run("delete", func(t *testing.T) {
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "delete", UID: uid, GID: gid, Path: renameDest, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("delete failed: code=%d stderr=%s", code, stderr.String())
		}
		if _, err := os.Stat(renameDest); !os.IsNotExist(err) {
			t.Errorf("delete should have removed the file")
		}
	})

	// copy directory recursively
	t.Run("copy dir recursive", func(t *testing.T) {
		srcDir := filepath.Join(base, "srcdir")
		os.Mkdir(srcDir, 0755)
		os.WriteFile(filepath.Join(srcDir, "a.txt"), []byte("aaa"), 0644)
		subDir := filepath.Join(srcDir, "sub")
		os.Mkdir(subDir, 0755)
		os.WriteFile(filepath.Join(subDir, "b.txt"), []byte("bbb"), 0644)

		dstDir := filepath.Join(base, "dstdir")
		var stdout, stderr bytes.Buffer
		code := Run(Params{Op: "copy", UID: uid, GID: gid, Path: srcDir, Dest: dstDir, Bases: bases}, nil, &stdout, &stderr)
		if code != ExitOK {
			t.Fatalf("copy dir failed: code=%d stderr=%s", code, stderr.String())
		}
		data, _ := os.ReadFile(filepath.Join(dstDir, "a.txt"))
		if string(data) != "aaa" {
			t.Errorf("copy dir: a.txt=%q, want %q", string(data), "aaa")
		}
		data, _ = os.ReadFile(filepath.Join(dstDir, "sub", "b.txt"))
		if string(data) != "bbb" {
			t.Errorf("copy dir: sub/b.txt=%q, want %q", string(data), "bbb")
		}
	})
}
