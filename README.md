# fileshelf

A web-based file explorer for Linux NAS systems with Authelia authentication and POSIX ACL integration.

## Overview

fileshelf provides a browser-based file management interface for self-hosted NAS environments. It leverages Linux POSIX ACLs for access control, ensuring that file permissions in the web UI are identical to those enforced by Samba.

## Architecture

```
[Browser] <-> [Authelia] <-> [fileshelf-server] <-> [fileshelf-helper (setuid)]
                                                          |
                                                    Linux filesystem (POSIX ACL)
```

- **fileshelf-server**: Go HTTP API server (runs as non-root)
- **fileshelf-helper**: setuid root binary that performs file operations as the authenticated user
- **Frontend**: React SPA with 2-pane file explorer (tree + file list + preview)

## Key Features

- Authelia Forward Auth integration (OIDC)
- POSIX ACL-based access control (kernel-enforced via setuid helper)
- 2-pane file explorer (directory tree + file list)
- File preview panel (text, image, audio, video, PDF)
- Copy/Cut/Paste with keyboard shortcuts
- Multi-select with Shift/Ctrl+click
- Drag & drop upload
- Context menu operations
- Configurable share roots via YAML

## Development

```bash
# Build
make build

# Run (development)
make dev

# Test
make test
```

## Deployment

Designed to be deployed via Ansible. See [ansible-nas](https://github.com/tjst-t/ansible-nas) for the deployment role.

## License

MIT
