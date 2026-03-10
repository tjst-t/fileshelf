package fileop

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// mockHelperPath builds a mock helper script for testing.
// Since we can't use the real setuid helper in tests, we test
// the ForkFileOperator with a simple shell script that mimics the helper interface.
func buildMockHelper(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()
	script := filepath.Join(dir, "mock-helper")

	content := `#!/bin/sh
# Mock helper for testing ForkFileOperator.
# Parses -op, -uid, -gid, -path, -dest, -bases flags.

OP=""
UID_VAL=""
GID_VAL=""
PATH_VAL=""
DEST_VAL=""
BASES_VAL=""

while [ $# -gt 0 ]; do
  case "$1" in
    -op)    OP="$2"; shift 2;;
    -uid)   UID_VAL="$2"; shift 2;;
    -gid)   GID_VAL="$2"; shift 2;;
    -path)  PATH_VAL="$2"; shift 2;;
    -dest)  DEST_VAL="$2"; shift 2;;
    -bases) BASES_VAL="$2"; shift 2;;
    *)      shift;;
  esac
done

# Reject uid=0
if [ "$UID_VAL" = "0" ]; then
  echo '{"error":"refusing to run as uid=0 (root)"}' >&2
  exit 10
fi

case "$OP" in
  access)
    if [ -r "$PATH_VAL" ] && [ -x "$PATH_VAL" ]; then
      echo '{"ok":true}'
    else
      echo '{"error":"access denied"}' >&2
      exit 1
    fi
    ;;
  list)
    echo '{"entries":[{"name":"test.txt","type":"file","size":100,"modified":"2025-01-01T00:00:00Z","perms":"-rw-r--r--"}]}'
    ;;
  read)
    cat "$PATH_VAL" 2>/dev/null || { echo '{"error":"not found"}' >&2; exit 2; }
    ;;
  write)
    cat > "$PATH_VAL"
    echo '{"ok":true}'
    ;;
  mkdir)
    mkdir -p "$PATH_VAL" && echo '{"ok":true}' || { echo '{"error":"mkdir failed"}' >&2; exit 3; }
    ;;
  delete)
    rm -rf "$PATH_VAL" && echo '{"ok":true}' || { echo '{"error":"delete failed"}' >&2; exit 3; }
    ;;
  rename)
    mv "$PATH_VAL" "$DEST_VAL" && echo '{"ok":true}' || { echo '{"error":"rename failed"}' >&2; exit 3; }
    ;;
  copy)
    cp -r "$PATH_VAL" "$DEST_VAL" && echo '{"ok":true}' || { echo '{"error":"copy failed"}' >&2; exit 3; }
    ;;
  stat)
    if [ -f "$PATH_VAL" ]; then
      SIZE=$(wc -c < "$PATH_VAL" | tr -d ' ')
      echo "{\"name\":\"$(basename "$PATH_VAL")\",\"type\":\"file\",\"size\":${SIZE},\"modified\":\"2025-01-01T00:00:00Z\",\"perms\":\"-rw-r--r--\"}"
    elif [ -d "$PATH_VAL" ]; then
      echo "{\"name\":\"$(basename "$PATH_VAL")\",\"type\":\"dir\",\"size\":0,\"modified\":\"2025-01-01T00:00:00Z\",\"perms\":\"drwxr-xr-x\"}"
    else
      echo '{"error":"not found"}' >&2
      exit 2
    fi
    ;;
  *)
    echo '{"error":"unknown operation"}' >&2
    exit 1
    ;;
esac
`
	if err := os.WriteFile(script, []byte(content), 0755); err != nil {
		t.Fatalf("writing mock helper: %v", err)
	}
	return script
}

func newTestOperator(t *testing.T) (*ForkFileOperator, string) {
	t.Helper()
	helperPath := buildMockHelper(t)
	base := t.TempDir()
	return &ForkFileOperator{
		HelperPath: helperPath,
		Bases:      []string{base},
		Timeout:    10 * time.Second,
	}, base
}

func TestForkAccess(t *testing.T) {
	op, base := newTestOperator(t)
	ctx := context.Background()
	user := User{Username: "test", UID: 1000, GID: 1000}

	if err := op.Access(ctx, user, base); err != nil {
		t.Errorf("Access failed: %v", err)
	}
}

func TestForkList(t *testing.T) {
	op, _ := newTestOperator(t)
	ctx := context.Background()
	user := User{Username: "test", UID: 1000, GID: 1000}

	entries, err := op.List(ctx, user, "/tmp")
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(entries) != 1 {
		t.Errorf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Name != "test.txt" {
		t.Errorf("expected test.txt, got %s", entries[0].Name)
	}
}

func TestForkWriteAndRead(t *testing.T) {
	op, base := newTestOperator(t)
	ctx := context.Background()
	user := User{Username: "test", UID: 1000, GID: 1000}

	filePath := filepath.Join(base, "hello.txt")

	// Write
	err := op.Write(ctx, user, filePath, strings.NewReader("hello fork"))
	if err != nil {
		t.Fatalf("Write failed: %v", err)
	}

	// Read
	rc, err := op.Read(ctx, user, filePath)
	if err != nil {
		t.Fatalf("Read failed: %v", err)
	}
	defer rc.Close()

	data, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("reading: %v", err)
	}
	if string(data) != "hello fork" {
		t.Errorf("got %q, want %q", string(data), "hello fork")
	}
}

func TestForkStat(t *testing.T) {
	op, base := newTestOperator(t)
	ctx := context.Background()
	user := User{Username: "test", UID: 1000, GID: 1000}

	filePath := filepath.Join(base, "stat-test.txt")
	os.WriteFile(filePath, []byte("stat me"), 0644)

	entry, err := op.Stat(ctx, user, filePath)
	if err != nil {
		t.Fatalf("Stat failed: %v", err)
	}
	if entry.Name != "stat-test.txt" {
		t.Errorf("name=%q, want %q", entry.Name, "stat-test.txt")
	}
	if entry.Type != "file" {
		t.Errorf("type=%q, want %q", entry.Type, "file")
	}
}

func TestForkMkdir(t *testing.T) {
	op, base := newTestOperator(t)
	ctx := context.Background()
	user := User{Username: "test", UID: 1000, GID: 1000}

	dirPath := filepath.Join(base, "newdir")
	if err := op.Mkdir(ctx, user, dirPath); err != nil {
		t.Fatalf("Mkdir failed: %v", err)
	}
	info, err := os.Stat(dirPath)
	if err != nil {
		t.Fatalf("dir not created: %v", err)
	}
	if !info.IsDir() {
		t.Error("expected directory")
	}
}

func TestForkDelete(t *testing.T) {
	op, base := newTestOperator(t)
	ctx := context.Background()
	user := User{Username: "test", UID: 1000, GID: 1000}

	filePath := filepath.Join(base, "todelete.txt")
	os.WriteFile(filePath, []byte("delete me"), 0644)

	if err := op.Delete(ctx, user, filePath); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}
	if _, err := os.Stat(filePath); !os.IsNotExist(err) {
		t.Error("file should have been deleted")
	}
}

func TestForkRename(t *testing.T) {
	op, base := newTestOperator(t)
	ctx := context.Background()
	user := User{Username: "test", UID: 1000, GID: 1000}

	oldPath := filepath.Join(base, "old.txt")
	newPath := filepath.Join(base, "new.txt")
	os.WriteFile(oldPath, []byte("rename"), 0644)

	if err := op.Rename(ctx, user, oldPath, newPath); err != nil {
		t.Fatalf("Rename failed: %v", err)
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Error("new file not found")
	}
}

func TestForkCopy(t *testing.T) {
	op, base := newTestOperator(t)
	ctx := context.Background()
	user := User{Username: "test", UID: 1000, GID: 1000}

	src := filepath.Join(base, "src.txt")
	dst := filepath.Join(base, "dst.txt")
	os.WriteFile(src, []byte("copy"), 0644)

	if err := op.Copy(ctx, user, src, dst); err != nil {
		t.Fatalf("Copy failed: %v", err)
	}
	data, _ := os.ReadFile(dst)
	if string(data) != "copy" {
		t.Errorf("got %q, want %q", string(data), "copy")
	}
}

func TestForkUID0Rejected(t *testing.T) {
	op, base := newTestOperator(t)
	ctx := context.Background()
	user := User{Username: "root", UID: 0, GID: 0}

	err := op.Access(ctx, user, base)
	if err == nil {
		t.Error("expected error for uid=0")
	}
}
