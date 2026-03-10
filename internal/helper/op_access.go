package helper

import "syscall"

const xOK = 0x1 // X_OK: test for execute (search) permission

// OpAccess checks if the current user can access the directory.
// Uses access(2) with X_OK to check execute permission (directory traversal).
func OpAccess(path string) error {
	return syscall.Access(path, xOK)
}
