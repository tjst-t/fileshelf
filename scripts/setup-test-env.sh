#!/bin/bash
# Setup test environment for fileshelf-helper integration tests.
# Must be run as root.
set -euo pipefail

TEST_BASE="/tmp/fileshelf-test"
TEST_USER="fileshelf-test-user"
TEST_DENIED="fileshelf-test-denied"

echo "=== Setting up fileshelf test environment ==="

# Create test users if they don't exist
if ! id "$TEST_USER" &>/dev/null; then
    useradd -r -s /usr/sbin/nologin "$TEST_USER"
    echo "Created user: $TEST_USER"
else
    echo "User already exists: $TEST_USER"
fi

if ! id "$TEST_DENIED" &>/dev/null; then
    useradd -r -s /usr/sbin/nologin "$TEST_DENIED"
    echo "Created user: $TEST_DENIED"
else
    echo "User already exists: $TEST_DENIED"
fi

# Clean up old test directory
rm -rf "$TEST_BASE"

# Create directory structure
mkdir -p "$TEST_BASE/media/movies"
mkdir -p "$TEST_BASE/media/music"
mkdir -p "$TEST_BASE/documents"
mkdir -p "$TEST_BASE/documents/secret"
mkdir -p "$TEST_BASE/backups"

# Create test files
echo "test video content" > "$TEST_BASE/media/movies/test.mkv"
echo "test audio content" > "$TEST_BASE/media/music/test.flac"
echo "This is a readme." > "$TEST_BASE/documents/readme.txt"
echo "Top secret data" > "$TEST_BASE/documents/secret/secret.txt"
echo "backup data" > "$TEST_BASE/backups/dump.tar.gz"

# Set ownership — all files owned by root
chown -R root:root "$TEST_BASE"

# Set base permissions
chmod -R 755 "$TEST_BASE"
chmod 644 "$TEST_BASE/media/movies/test.mkv"
chmod 644 "$TEST_BASE/media/music/test.flac"
chmod 644 "$TEST_BASE/documents/readme.txt"
chmod 644 "$TEST_BASE/documents/secret/secret.txt"
chmod 644 "$TEST_BASE/backups/dump.tar.gz"

# Set ACLs to deny test-user access to certain directories
# Requires acl package (setfacl)
if command -v setfacl &>/dev/null; then
    setfacl -m u:"$TEST_USER":--- "$TEST_BASE/documents/secret"
    setfacl -m u:"$TEST_USER":--- "$TEST_BASE/backups"
    echo "ACLs set for $TEST_USER (denied: secret, backups)"
else
    # Fallback: use chmod to restrict
    chmod 700 "$TEST_BASE/documents/secret"
    chmod 700 "$TEST_BASE/backups"
    echo "WARNING: setfacl not available, using chmod fallback"
fi

echo ""
echo "Test environment created at: $TEST_BASE"
echo "Test user: $TEST_USER (uid=$(id -u "$TEST_USER"))"
echo "Denied user: $TEST_DENIED (uid=$(id -u "$TEST_DENIED"))"
echo ""
echo "Directory structure:"
find "$TEST_BASE" -type f -o -type d | sort
