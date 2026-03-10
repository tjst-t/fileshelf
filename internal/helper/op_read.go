package helper

import (
	"fmt"
	"io"
	"os"
)

// OpRead copies file content to the given writer.
// Returns an error if path is a directory.
func OpRead(path string, w io.Writer) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("cannot read directory: %s", path)
	}

	_, err = io.Copy(w, f)
	return err
}
