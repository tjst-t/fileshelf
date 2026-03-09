package helper

import (
	"fmt"
	"os/user"
	"runtime"
	"strconv"
	"syscall"
)

// DropPrivileges locks the OS thread and switches to the target uid/gid.
// Must be called before any file operations.
// Order: LockOSThread → Setgroups → Setgid → Setuid
func DropPrivileges(uid, gid int) error {
	if uid == 0 {
		return fmt.Errorf("refusing to run as uid=0 (root)")
	}

	runtime.LockOSThread()

	groups, err := lookupSupplementaryGroups(uid)
	if err != nil {
		return fmt.Errorf("looking up supplementary groups: %w", err)
	}

	if err := syscall.Setgroups(groups); err != nil {
		return fmt.Errorf("setgroups: %w", err)
	}

	if err := syscall.Setgid(gid); err != nil {
		return fmt.Errorf("setgid(%d): %w", gid, err)
	}

	if err := syscall.Setuid(uid); err != nil {
		return fmt.Errorf("setuid(%d): %w", uid, err)
	}

	return nil
}

func lookupSupplementaryGroups(uid int) ([]int, error) {
	u, err := user.LookupId(strconv.Itoa(uid))
	if err != nil {
		return nil, fmt.Errorf("looking up uid %d: %w", uid, err)
	}

	gids, err := u.GroupIds()
	if err != nil {
		return nil, fmt.Errorf("getting group ids for %s: %w", u.Username, err)
	}

	groups := make([]int, 0, len(gids))
	for _, g := range gids {
		gid, err := strconv.Atoi(g)
		if err != nil {
			continue
		}
		groups = append(groups, gid)
	}

	return groups, nil
}
