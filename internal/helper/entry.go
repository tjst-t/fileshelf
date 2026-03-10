package helper

import (
	"os"
	"time"
)

func entryFromFileInfo(name string, info os.FileInfo) Entry {
	t := "file"
	if info.IsDir() {
		t = "dir"
	}

	return Entry{
		Name:     name,
		Type:     t,
		Size:     info.Size(),
		Modified: info.ModTime().UTC().Truncate(time.Second),
		Perms:    info.Mode().Perm().String(),
	}
}
