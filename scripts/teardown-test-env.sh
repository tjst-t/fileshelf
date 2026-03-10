#!/bin/bash
# Teardown test environment for fileshelf-helper integration tests.
# Must be run as root.
set -euo pipefail

TEST_BASE="/tmp/fileshelf-test"
TEST_USER="fileshelf-test-user"
TEST_DENIED="fileshelf-test-denied"

echo "=== Tearing down fileshelf test environment ==="

# Remove test directory
if [ -d "$TEST_BASE" ]; then
    rm -rf "$TEST_BASE"
    echo "Removed: $TEST_BASE"
fi

# Remove test users
if id "$TEST_USER" &>/dev/null; then
    userdel "$TEST_USER" 2>/dev/null || true
    echo "Removed user: $TEST_USER"
fi

if id "$TEST_DENIED" &>/dev/null; then
    userdel "$TEST_DENIED" 2>/dev/null || true
    echo "Removed user: $TEST_DENIED"
fi

echo "Teardown complete."
