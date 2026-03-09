# CLAUDE.md - fileshelf

This file provides context for Claude Code when working on this repository.

## Project Overview

fileshelf is a web-based file explorer for Linux NAS systems. It integrates with Authelia for authentication and uses Linux POSIX ACLs for access control via a setuid helper binary.

## Architecture

### Two-binary design

- **fileshelf-server** (cmd/server/): Go HTTP API server, runs as non-root user
- **fileshelf-helper** (cmd/helper/): setuid root binary, performs file operations as the target user

The server never directly accesses files. All file operations go through the helper binary, which:
1. Receives operation, uid, gid, and path via command-line args
2. Calls `runtime.LockOSThread()` then `syscall.Setgid()` / `syscall.Setuid()` (order matters)
3. Performs the file operation under the target user's identity
4. Returns results as JSON on stdout, errors on stderr

This design ensures:
- The web server process has no filesystem privileges
- Access control is enforced by the Linux kernel, not application code
- POSIX ACL checks are identical to what Samba enforces

### Authentication

Authelia Forward Auth sends `Remote-User` and `Remote-Groups` headers. The server middleware extracts these and resolves the Linux uid/gid via `os/user` package.

### Frontend

React SPA with:
- Left pane: directory tree (lazy-loaded)
- Right pane: file list (sortable columns)
- Right panel: file preview (toggle)
- Clipboard: copy/cut/paste with keyboard shortcuts

## Directory Structure

```
cmd/
  server/         # fileshelf-server entrypoint
  helper/         # fileshelf-helper entrypoint
internal/
  server/         # HTTP server, routes, middleware
  helper/         # Helper operations (list, read, write, delete, mkdir, rename, access)
  config/         # YAML config parsing
  fileop/         # FileOperator interface (abstraction for future process pool)
frontend/         # React app
  src/
    components/   # React components
    hooks/        # Custom hooks
    api/          # API client
docs/             # Design documents
```

## Key Design Decisions

- **FileOperator interface**: All file operations go through `fileop.FileOperator` interface. Current implementation forks a helper process per request. This can later be swapped to a process pool without changing callers.
- **Share config**: Shares are defined in YAML config, not parsed from smb.conf. Ansible generates both smb.conf and fileshelf config from the same vars.
- **Share visibility**: Uses `access(2)` syscall via helper to check if user can enter each share's base directory. Inaccessible shares are hidden.
- **Upload**: stdin stream from server to helper. Helper writes to temp file on same filesystem, then atomic rename.
- **Helper security**: Whitelisted operations only, path traversal prevention (must be under configured base paths), uid=0 switch rejected.

## Build & Run

```bash
# Build both binaries
make build

# Run server in dev mode (no Authelia, mock user)
FILESHELF_DEV=1 ./bin/fileshelf-server -config config.yaml

# Run tests
make test

# Build frontend
cd frontend && npm run build
```

## Config Example

```yaml
server:
  listen: ":8080"
  dev_mode: false
  dev_user: "tjstkm"

helper:
  path: "/usr/local/bin/fileshelf-helper"

shares:
  - name: "media"
    path: "/tank/media"
  - name: "documents"
    path: "/tank/documents"
  - name: "backups"
    path: "/tank/backups"
```

## Conventions

- Go code: `gofmt`, `golangci-lint`
- Error handling: helper returns JSON `{"error": "message"}` with appropriate exit code
- API responses: JSON, errors use `{"error": "message"}` with HTTP status codes
- Commits: Conventional Commits format
- Tests: table-driven tests preferred
