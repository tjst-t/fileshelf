package helper

import "os"

// OpList lists directory entries.
// Returns an error if path is not a directory (ReadDir will fail naturally).
func OpList(path string) (*ListResponse, error) {
	dirEntries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	entries := make([]Entry, 0, len(dirEntries))
	for _, de := range dirEntries {
		fi, err := de.Info()
		if err != nil {
			continue
		}
		entries = append(entries, entryFromFileInfo(de.Name(), fi))
	}

	return &ListResponse{Entries: entries}, nil
}
