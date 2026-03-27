package helper

import (
	"fmt"
	"os"
	"os/user"
	"syscall"
	"time"
)

func entryFromFileInfo(name string, info os.FileInfo) Entry {
	t := "file"
	if info.IsDir() {
		t = "dir"
	}

	owner, group := resolveOwnerGroup(info)

	return Entry{
		Name:     name,
		Type:     t,
		Size:     info.Size(),
		Modified: info.ModTime().UTC().Truncate(time.Second),
		Perms:    info.Mode().Perm().String(),
		Owner:    owner,
		Group:    group,
	}
}

func resolveOwnerGroup(info os.FileInfo) (string, string) {
	sys, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return "", ""
	}

	uid := fmt.Sprintf("%d", sys.Uid)
	gid := fmt.Sprintf("%d", sys.Gid)

	owner := uid
	if u, err := user.LookupId(uid); err == nil {
		owner = u.Username
	}

	group := gid
	if g, err := user.LookupGroupId(gid); err == nil {
		group = g.Name
	}

	return owner, group
}
