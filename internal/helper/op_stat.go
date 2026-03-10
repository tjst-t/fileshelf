package helper

import (
	"os"
	"path/filepath"
)

// OpStat returns file/directory information.
func OpStat(path string) (*Entry, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	e := entryFromFileInfo(filepath.Base(path), info)
	return &e, nil
}
