package helper

import "os"

// OpMkdir creates a directory with 0755 permissions.
// Uses os.Mkdir (not MkdirAll) to prevent unintended intermediate directory creation.
func OpMkdir(path string) error {
	return os.Mkdir(path, 0755)
}

// OpMkdirAll creates a directory and all parent directories with 0755 permissions.
func OpMkdirAll(path string) error {
	return os.MkdirAll(path, 0755)
}
