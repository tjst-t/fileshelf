package helper

import "os"

// OpMkdir creates a directory with 0755 permissions.
// Uses os.Mkdir (not MkdirAll) to prevent unintended intermediate directory creation.
func OpMkdir(path string) error {
	return os.Mkdir(path, 0755)
}
