package helper

import (
	"fmt"
	"io"
	"os"
)

// OpRead copies file content to the given writer.
// If offset > 0, it seeks to that position before reading.
// If length > 0, it reads at most that many bytes.
// Returns an error if path is a directory.
func OpRead(path string, offset, length int64, w io.Writer) error {
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

	if offset > 0 {
		if _, err := f.Seek(offset, io.SeekStart); err != nil {
			return err
		}
	}

	var r io.Reader = f
	if length > 0 {
		r = io.LimitReader(f, length)
	}

	_, err = io.Copy(w, r)
	return err
}
