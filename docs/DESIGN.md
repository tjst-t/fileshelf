# fileshelf Design Document

## 1. Goals

- Provide a web-based file explorer for a Linux NAS (Ubuntu Server + ZFS + Samba)
- Authenticate users via Authelia (Forward Auth / OIDC)
- Enforce file access control using Linux POSIX ACLs (same as Samba)
- Windows Explorer-like 2-pane UI with preview
- Support copy, move, rename, delete, upload, download, mkdir

## 2. Architecture

### 2.1 Component Diagram

```
┌──────────┐     ┌──────────┐     ┌─────────────────┐     ┌─────────────────────┐
│ Browser  │────▶│ Authelia  │────▶│ fileshelf-server │────▶│ fileshelf-helper     │
│ (React)  │◀────│ (Forward  │◀────│ (Go, non-root)   │◀────│ (Go, setuid root)    │
│          │     │  Auth)    │     │                   │     │ setuid→target user   │
└──────────┘     └──────────┘     └─────────────────┘     └──────────┬────────────┘
                                                                      │
                                                                ┌─────▼─────┐
                                                                │ Linux FS  │
                                                                │ POSIX ACL │
                                                                └───────────┘
```

### 2.2 fileshelf-server

- Go HTTP server (net/http or chi router)
- Runs as dedicated non-root user (e.g., `fileshelf`)
- Middleware: extract `Remote-User` / `Remote-Groups` from Authelia headers
- Resolve Linux uid/gid from username via `os/user.Lookup`
- For each file operation, fork `fileshelf-helper` with target uid/gid
- Serve React SPA static files
- Dev mode: skip Authelia, use configurable mock user

### 2.3 fileshelf-helper

- Setuid root binary (mode 4755, owner root)
- Invocation: `fileshelf-helper -op <operation> -uid <uid> -gid <gid> -path <path> [-dest <dest>]`
- On startup:
  1. `runtime.LockOSThread()`
  2. Parse and validate args
  3. Validate path is under allowed base paths
  4. Reject uid=0
  5. `syscall.Setgroups()` with target user's supplementary groups
  6. `syscall.Setgid(gid)`
  7. `syscall.Setuid(uid)` (must be after Setgid)
  8. Perform operation
  9. Output JSON result to stdout
  10. Exit

#### Operations

| Operation | Args | Description |
|-----------|------|-------------|
| `access`  | path | Check if user can access directory (for share visibility) |
| `list`    | path | List directory contents with stat info |
| `read`    | path | Read file content to stdout (binary) |
| `write`   | path | Write stdin to file (atomic: tmpfile + rename) |
| `mkdir`   | path | Create directory |
| `delete`  | path | Remove file or directory (recursive) |
| `rename`  | path, dest | Rename/move file or directory |
| `copy`    | path, dest | Copy file or directory |
| `stat`    | path | Get detailed file/directory info |

#### Security

- Operations whitelist: only the above operations are accepted
- Path validation: all paths must be under a configured base path, after `filepath.Clean` and symlink resolution
- uid=0 rejection: never switch to root
- No shell execution: all operations use Go stdlib
- Minimal binary: no network, no config file parsing, base paths passed as args

### 2.4 FileOperator Interface

```go
type FileOperator interface {
    Access(ctx context.Context, user User, path string) error
    List(ctx context.Context, user User, path string) ([]Entry, error)
    Read(ctx context.Context, user User, path string) (io.ReadCloser, error)
    Write(ctx context.Context, user User, path string, r io.Reader) error
    Mkdir(ctx context.Context, user User, path string) error
    Delete(ctx context.Context, user User, path string) error
    Rename(ctx context.Context, user User, oldPath, newPath string) error
    Copy(ctx context.Context, user User, srcPath, dstPath string) error
    Stat(ctx context.Context, user User, path string) (*Entry, error)
}
```

Current implementation: `ForkFileOperator` (forks helper per request).
Future: `PoolFileOperator` (reuses long-running helper processes per user).

### 2.5 Configuration

```yaml
server:
  listen: ":8080"
  dev_mode: false
  dev_user: "tjstkm"  # used when dev_mode=true
  static_dir: "./frontend/dist"  # React build output

helper:
  path: "/usr/local/bin/fileshelf-helper"
  timeout: 30s  # per-operation timeout

shares:
  - name: "media"
    path: "/tank/media"
  - name: "documents"
    path: "/tank/documents"
  - name: "backups"
    path: "/tank/backups"
```

## 3. API Design

All endpoints require Authelia authentication (Remote-User header).

### 3.1 Shares

```
GET /api/shares
  → [{ "name": "media", "path": "/tank/media" }, ...]
  (filtered by user access)
```

### 3.2 File Operations

```
GET    /api/files?path=/media/movies
  → { "entries": [{ "name": "...", "type": "file|dir", "size": N, "modified": "...", "perms": "..." }] }

GET    /api/files/stat?path=/media/movies/inception.mkv
  → { "name": "...", "type": "file", "size": N, "modified": "...", "perms": "..." }

GET    /api/files/download?path=/media/movies/inception.mkv
  → binary stream (Content-Disposition: attachment)

GET    /api/files/preview?path=/documents/readme.txt
  → text content (for text preview in browser)

PUT    /api/files/upload?path=/media/movies/new_movie.mkv
  → request body streamed to helper stdin
  → { "ok": true }

POST   /api/files/mkdir
  body: { "path": "/media/new_folder" }
  → { "ok": true }

DELETE /api/files?path=/media/old_file.mkv
  → { "ok": true }

POST   /api/files/rename
  body: { "path": "/media/old_name", "dest": "/media/new_name" }
  → { "ok": true }

POST   /api/files/copy
  body: { "path": "/media/source.mkv", "dest": "/documents/source.mkv" }
  → { "ok": true }
```

### 3.3 Error Responses

```json
{
  "error": "permission denied",
  "code": "EPERM"
}
```

HTTP status codes:
- 400: bad request (invalid path, missing params)
- 403: permission denied (POSIX ACL)
- 404: not found
- 500: internal error

## 4. Frontend Design

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│ fileshelf                                    user ○     │
├─────────────────────────────────────────────────────────┤
│ ← │ / media / movies                │ + New │ ⬆ Upload │
├────────┬────────────────────────────┬───────────────────┤
│ Shares │ Name    Size  Modified Perm│ Preview           │
│ ▶ media│ file1   4GB   2024-12-01   │ 🖼 preview area   │
│   ▶ mov│ file2   5GB   2024-11-15   │                   │
│   ▶ mus│ dir1/         2025-01-20   │ Path: /tank/...   │
│ ▶ docs │                            │ Size: 4.0 GB      │
│ ▶ back │                            │ Modified: ...     │
├────────┴────────────────────────────┴───────────────────┤
│ 3 items (1 dirs, 2 files)                    9.0 GB     │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘C | Copy selected |
| ⌘X | Cut selected |
| ⌘V | Paste |
| ⌘A | Select all |
| Space | Toggle preview |
| Enter | Open dir / preview file |
| Delete | Delete selected |
| Esc | Clear selection / close panel |

### 4.3 Tech Stack

- React (Vite)
- TypeScript
- Tailwind CSS
- No state management library (React state + context sufficient for this scope)

## 5. Deployment

### 5.1 Binary Installation (Ansible)

```yaml
- name: Install fileshelf-server
  copy:
    src: fileshelf-server
    dest: /usr/local/bin/fileshelf-server
    owner: fileshelf
    group: fileshelf
    mode: "0755"

- name: Install fileshelf-helper
  copy:
    src: fileshelf-helper
    dest: /usr/local/bin/fileshelf-helper
    owner: root
    group: root
    mode: "4755"  # setuid root

- name: Install config
  template:
    src: fileshelf.yaml.j2
    dest: /etc/fileshelf/config.yaml
    owner: fileshelf
    group: fileshelf
    mode: "0640"

- name: Install systemd service
  template:
    src: fileshelf.service.j2
    dest: /etc/systemd/system/fileshelf.service
  notify: restart fileshelf
```

### 5.2 Authelia Configuration

```yaml
access_control:
  rules:
    - domain: fileshelf.example.com
      policy: two_factor
```

### 5.3 Reverse Proxy (Caddy)

```
fileshelf.example.com {
    forward_auth authelia:9091 {
        uri /api/verify?rd=https://auth.example.com
        copy_headers Remote-User Remote-Groups
    }
    reverse_proxy fileshelf-server:8080
}
```
