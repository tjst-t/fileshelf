//go:build integration

package helper_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/tjst-t/fileshelf/internal/helper"
)

const (
	testBase = "/tmp/fileshelf-test"
	testUser = "fileshelf-test-user"
)

var (
	helperBin string
	testUID   int
	testGID   int
	bases     string
)

func TestMain(m *testing.M) {
	// Build helper binary
	tmpDir, err := os.MkdirTemp("", "fileshelf-helper-test-*")
	if err != nil {
		fmt.Fprintf(os.Stderr, "creating temp dir: %v\n", err)
		os.Exit(1)
	}
	defer os.RemoveAll(tmpDir)

	helperBin = filepath.Join(tmpDir, "fileshelf-helper")
	cmd := exec.Command("go", "build", "-o", helperBin, "../../cmd/helper")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "building helper: %v\n", err)
		os.Exit(1)
	}

	// Look up test user
	u, err := user.Lookup(testUser)
	if err != nil {
		fmt.Fprintf(os.Stderr, "looking up test user %q: %v\n", testUser, err)
		fmt.Fprintf(os.Stderr, "Run 'sudo scripts/setup-test-env.sh' first.\n")
		os.Exit(1)
	}
	testUID, _ = strconv.Atoi(u.Uid)
	testGID, _ = strconv.Atoi(u.Gid)

	bases = testBase + "/media," + testBase + "/documents," + testBase + "/backups"

	os.Exit(m.Run())
}

func runHelper(t *testing.T, op, path, dest string) ([]byte, []byte, int) {
	t.Helper()
	args := []string{
		"-op", op,
		"-uid", strconv.Itoa(testUID),
		"-gid", strconv.Itoa(testGID),
		"-path", path,
		"-bases", bases,
	}
	if dest != "" {
		args = append(args, "-dest", dest)
	}

	cmd := exec.Command(helperBin, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			t.Fatalf("running helper: %v", err)
		}
	}
	return stdout.Bytes(), stderr.Bytes(), exitCode
}

func TestIntegrationAccess(t *testing.T) {
	t.Run("allowed directory", func(t *testing.T) {
		_, _, code := runHelper(t, "access", testBase+"/media", "")
		if code != 0 {
			t.Errorf("expected exit 0, got %d", code)
		}
	})

	t.Run("denied directory", func(t *testing.T) {
		_, _, code := runHelper(t, "access", testBase+"/backups", "")
		if code == 0 {
			t.Error("expected non-zero exit for denied directory")
		}
	})
}

func TestIntegrationList(t *testing.T) {
	t.Run("normal directory", func(t *testing.T) {
		stdout, _, code := runHelper(t, "list", testBase+"/media", "")
		if code != 0 {
			t.Fatalf("expected exit 0, got %d", code)
		}
		var resp helper.ListResponse
		if err := json.Unmarshal(stdout, &resp); err != nil {
			t.Fatalf("parse response: %v", err)
		}
		if len(resp.Entries) < 2 {
			t.Errorf("expected at least 2 entries, got %d", len(resp.Entries))
		}
	})

	t.Run("empty directory", func(t *testing.T) {
		emptyDir := testBase + "/media/empty-test"
		// Create empty dir as root (test env should handle this)
		os.Mkdir(emptyDir, 0755)
		defer os.Remove(emptyDir)

		stdout, _, code := runHelper(t, "list", emptyDir, "")
		if code != 0 {
			t.Fatalf("expected exit 0, got %d", code)
		}
		var resp helper.ListResponse
		json.Unmarshal(stdout, &resp)
		if len(resp.Entries) != 0 {
			t.Errorf("expected 0 entries, got %d", len(resp.Entries))
		}
	})
}

func TestIntegrationRead(t *testing.T) {
	stdout, _, code := runHelper(t, "read", testBase+"/documents/readme.txt", "")
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	if string(stdout) != "This is a readme.\n" {
		t.Errorf("content=%q, want %q", string(stdout), "This is a readme.\n")
	}
}

func TestIntegrationWrite(t *testing.T) {
	target := testBase + "/media/write-test.txt"
	defer os.Remove(target)

	args := []string{
		"-op", "write",
		"-uid", strconv.Itoa(testUID),
		"-gid", strconv.Itoa(testGID),
		"-path", target,
		"-bases", bases,
	}
	cmd := exec.Command(helperBin, args...)
	cmd.Stdin = bytes.NewBufferString("written by test")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		t.Fatalf("write failed: %v (stderr: %s)", err, stderr.String())
	}

	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("reading written file: %v", err)
	}
	if string(data) != "written by test" {
		t.Errorf("content=%q, want %q", string(data), "written by test")
	}
}

func TestIntegrationMkdirDelete(t *testing.T) {
	dir := testBase + "/media/testdir-integ"

	// mkdir
	_, _, code := runHelper(t, "mkdir", dir, "")
	if code != 0 {
		t.Fatalf("mkdir: expected exit 0, got %d", code)
	}
	if _, err := os.Stat(dir); err != nil {
		t.Fatalf("directory not created: %v", err)
	}

	// delete
	_, _, code = runHelper(t, "delete", dir, "")
	if code != 0 {
		t.Fatalf("delete: expected exit 0, got %d", code)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Error("directory should have been deleted")
	}
}

func TestIntegrationRename(t *testing.T) {
	src := testBase + "/media/rename-src.txt"
	dst := testBase + "/media/rename-dst.txt"
	os.WriteFile(src, []byte("rename me"), 0644)
	defer os.Remove(dst)

	_, _, code := runHelper(t, "rename", src, dst)
	if code != 0 {
		t.Fatalf("rename: expected exit 0, got %d", code)
	}
	if _, err := os.Stat(dst); err != nil {
		t.Fatal("dest not found after rename")
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Error("source should not exist after rename")
	}
}

func TestIntegrationCopy(t *testing.T) {
	src := testBase + "/media/movies/test.mkv"
	dst := testBase + "/media/test-copy.mkv"
	defer os.Remove(dst)

	_, _, code := runHelper(t, "copy", src, dst)
	if code != 0 {
		t.Fatalf("copy: expected exit 0, got %d", code)
	}

	srcData, _ := os.ReadFile(src)
	dstData, _ := os.ReadFile(dst)
	if string(srcData) != string(dstData) {
		t.Error("copied content doesn't match source")
	}
}

func TestIntegrationPermissionDenied(t *testing.T) {
	_, _, code := runHelper(t, "list", testBase+"/documents/secret", "")
	if code == 0 {
		t.Error("expected non-zero exit for permission denied")
	}
}

func TestIntegrationStat(t *testing.T) {
	stdout, _, code := runHelper(t, "stat", testBase+"/documents/readme.txt", "")
	if code != 0 {
		t.Fatalf("stat: expected exit 0, got %d", code)
	}
	var entry helper.Entry
	if err := json.Unmarshal(stdout, &entry); err != nil {
		t.Fatalf("parse stat: %v", err)
	}
	if entry.Name != "readme.txt" {
		t.Errorf("name=%q, want %q", entry.Name, "readme.txt")
	}
	if entry.Type != "file" {
		t.Errorf("type=%q, want %q", entry.Type, "file")
	}
}
