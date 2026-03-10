# fileshelf

A web-based file explorer for Linux NAS systems with Authelia authentication and POSIX ACL integration.

## Overview

fileshelf provides a browser-based file management interface for self-hosted NAS environments. It leverages Linux POSIX ACLs for access control, ensuring that file permissions in the web UI are identical to those enforced by Samba.

### Architecture

```
[Browser] <-> [Authelia] <-> [fileshelf-server] <-> [fileshelf-helper (setuid)]
                                                          |
                                                    Linux filesystem (POSIX ACL)
```

- **fileshelf-server** — Go HTTP API server (runs as non-root user)
- **fileshelf-helper** — setuid root binary that drops privileges to the authenticated user before performing file operations
- **Frontend** — React SPA with directory tree, file list, and preview pane

### Features

- Authelia Forward Auth integration
- POSIX ACL-based access control (kernel-enforced via setuid helper)
- Directory tree with lazy loading and auto-expand
- Sortable file list with multi-select (Shift/Ctrl+click)
- File preview panel (text, image, audio, video, PDF)
- Copy/Cut/Paste with keyboard shortcuts
- Context menu operations (right-click)
- Drag & drop file upload
- Zip download for folders and multi-selection
- Inline rename with smart selection (filename without extension)
- Dark / Light theme toggle
- Configurable share roots via YAML

## Installation

### Prerequisites

- Linux (amd64 or arm64)
- Go 1.23+ and Node.js 22+ (for building from source)
- A dedicated system user to run the server (e.g., `fileshelf`)

### Download Release

Download the latest release from [GitHub Releases](https://github.com/tjst-t/fileshelf/releases):

```bash
# Example for linux/amd64
curl -fsSL https://github.com/tjst-t/fileshelf/releases/download/v0.1.0/fileshelf-v0.1.0-linux-amd64.tar.gz \
  | tar xz -C /tmp

# The archive contains:
#   fileshelf-server-linux-amd64
#   fileshelf-helper-linux-amd64
#   frontend-dist/
```

### Build from Source

```bash
git clone https://github.com/tjst-t/fileshelf.git
cd fileshelf
make build
```

This builds `bin/fileshelf-server`, `bin/fileshelf-helper`, and `frontend/dist/`.

Version information from the git tag is automatically embedded into binaries:

```bash
./bin/fileshelf-server --version
# fileshelf-server v0.1.0 (abc1234)
```

## Setup

### 1. Create a Dedicated User

```bash
sudo useradd -r -s /usr/sbin/nologin fileshelf
```

### 2. Install Binaries

```bash
# Server binary (runs as non-root)
sudo install -o fileshelf -g fileshelf -m 0755 \
  fileshelf-server-linux-amd64 /usr/local/bin/fileshelf-server

# Helper binary (setuid root — this is critical)
sudo install -o root -g root -m 4755 \
  fileshelf-helper-linux-amd64 /usr/local/bin/fileshelf-helper
```

> **Important:** The helper binary must be owned by root with the setuid bit set (`4755`). This allows it to drop privileges to the authenticated user before performing file operations. The helper rejects uid=0 to prevent running as root.

### 3. Install Frontend

```bash
sudo mkdir -p /opt/fileshelf
sudo cp -r frontend-dist /opt/fileshelf/frontend
sudo chown -R fileshelf:fileshelf /opt/fileshelf
```

### 4. Create Configuration

```bash
sudo mkdir -p /etc/fileshelf
sudo tee /etc/fileshelf/config.yaml > /dev/null <<'EOF'
server:
  listen: ":8080"
  static_dir: "/opt/fileshelf/frontend"

helper:
  path: "/usr/local/bin/fileshelf-helper"
  timeout: 30s

shares:
  - name: "media"
    path: "/tank/media"
  - name: "documents"
    path: "/tank/documents"
  - name: "backups"
    path: "/tank/backups"
EOF

sudo chown fileshelf:fileshelf /etc/fileshelf/config.yaml
sudo chmod 640 /etc/fileshelf/config.yaml
```

#### Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `server.listen` | string | `:8080` | Address and port to listen on |
| `server.dev_mode` | bool | `false` | Enable development mode (skip Authelia) |
| `server.dev_user` | string | — | Linux username to impersonate in dev mode |
| `server.static_dir` | string | `./frontend/dist` | Path to the built frontend files |
| `helper.path` | string | — | Path to `fileshelf-helper` binary (required in production) |
| `helper.timeout` | duration | `30s` | Per-operation timeout |
| `shares[].name` | string | — | Display name and virtual path prefix |
| `shares[].path` | string | — | Absolute path on the filesystem |

Each share creates a virtual path namespace. A share named `media` with path `/tank/media` means the URL path `/media/movies/file.mkv` maps to `/tank/media/movies/file.mkv`.

Only shares that the authenticated user can access (via `access(2)` syscall) are shown in the UI.

### 5. Create systemd Service

```bash
sudo tee /etc/systemd/system/fileshelf.service > /dev/null <<'EOF'
[Unit]
Description=fileshelf - Web File Explorer
After=network.target

[Service]
Type=simple
User=fileshelf
Group=fileshelf
ExecStart=/usr/local/bin/fileshelf-server -config /etc/fileshelf/config.yaml
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now fileshelf
```

### 6. Configure Reverse Proxy with Authelia

fileshelf requires [Authelia](https://www.authelia.com/) for authentication. The reverse proxy must forward authentication headers.

#### Caddy Example

```
fileshelf.example.com {
    forward_auth authelia:9091 {
        uri /api/verify?rd=https://auth.example.com
        copy_headers Remote-User Remote-Groups
    }
    reverse_proxy localhost:8080
}
```

#### nginx Example

```nginx
server {
    listen 443 ssl;
    server_name fileshelf.example.com;

    # Authelia forward auth
    include /etc/nginx/snippets/authelia-location.conf;

    location / {
        include /etc/nginx/snippets/authelia-authrequest.conf;
        proxy_pass http://127.0.0.1:8080;
    }
}
```

#### Authelia Access Control

```yaml
access_control:
  rules:
    - domain: fileshelf.example.com
      policy: two_factor
```

The server reads the `Remote-User` header set by Authelia, resolves the corresponding Linux uid/gid via `os/user.Lookup`, and passes them to the helper binary for every file operation.

## Development

### Quick Start

```bash
# Build and run in dev mode (no Authelia required)
make build
FILESHELF_DEV=1 ./bin/fileshelf-server -config config.yaml
```

Dev mode uses `LocalFileOperator` which accesses the filesystem directly as the current process user, without the setuid helper.

### Makefile Targets

| Target | Description |
|--------|-------------|
| `make build` | Build server, helper, and frontend |
| `make build-server` | Build server binary only |
| `make build-helper` | Build helper binary only |
| `make build-frontend` | Build frontend (`npm ci && npm run build`) |
| `make dev` | Run server in dev mode with `go run` |
| `make serve` | Build and run with [portman](https://github.com/tjst-t/port-manager) for port management |
| `make test` | Run Go tests |
| `make test-integration` | Run integration tests (requires root) |
| `make clean` | Remove build artifacts |

### Frontend Development

```bash
cd frontend
npm install
npm run dev    # Start Vite dev server with HMR (proxies /api to :8080)
```

The Vite dev server proxies `/api` requests to `http://localhost:8080`, so you need the Go server running alongside.

### Dev Mode Config Example

```yaml
server:
  listen: ":8080"
  dev_mode: true
  dev_user: "your_username"
  static_dir: "./frontend/dist"

helper:
  path: "./bin/fileshelf-helper"
  timeout: 30s

shares:
  - name: "home"
    path: "/home/your_username"
```

## Security Model

The two-binary architecture ensures the web server process has **no filesystem privileges**:

1. `fileshelf-server` runs as a non-root user with no access to shared files
2. For every file operation, the server forks `fileshelf-helper` with the target user's uid/gid
3. The helper (setuid root) drops privileges to the target user before touching the filesystem
4. The Linux kernel enforces POSIX ACLs — the same permissions that Samba uses
5. Path traversal is prevented by resolving symlinks and validating all paths are under configured share base paths
6. Operations with uid=0 are always rejected

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/version` | No | Server version info |
| `GET` | `/api/shares` | Yes | List accessible shares |
| `GET` | `/api/files?path=` | Yes | List directory |
| `GET` | `/api/files/stat?path=` | Yes | Get file/directory info |
| `GET` | `/api/files/download?path=` | Yes | Download file |
| `GET` | `/api/files/preview?path=` | Yes | Preview file content |
| `GET` | `/api/files/download-zip?paths=` | Yes | Download items as zip |
| `PUT` | `/api/files/upload?path=` | Yes | Upload file (body = file data) |
| `POST` | `/api/files/mkdir` | Yes | Create directory |
| `POST` | `/api/files/rename` | Yes | Rename/move file or directory |
| `POST` | `/api/files/copy` | Yes | Copy file or directory |
| `DELETE` | `/api/files?path=` | Yes | Delete file or directory |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + C | Copy selected |
| Ctrl/Cmd + X | Cut selected |
| Ctrl/Cmd + V | Paste |
| Ctrl/Cmd + A | Select all |
| Space | Toggle preview pane |
| Delete / Backspace | Delete selected |
| Escape | Clear selection |

## License

MIT
