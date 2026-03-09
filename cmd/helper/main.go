package main

import (
	"flag"
	"os"
	"strings"

	"github.com/tjst-t/fileshelf/internal/helper"
)

func main() {
	op := flag.String("op", "", "operation: access|list|read|write|mkdir|delete|rename|copy|stat")
	uid := flag.Int("uid", -1, "target user uid")
	gid := flag.Int("gid", -1, "target user gid")
	path := flag.String("path", "", "target path")
	dest := flag.String("dest", "", "destination path (for rename/copy)")
	bases := flag.String("bases", "", "comma-separated allowed base paths")
	flag.Parse()

	if *op == "" || *uid < 0 || *gid < 0 || *path == "" || *bases == "" {
		helper.Run(helper.Params{Op: "invalid"}, os.Stdin, os.Stdout, os.Stderr)
		os.Exit(helper.ExitBadArgs)
	}

	baseList := strings.Split(*bases, ",")

	p := helper.Params{
		Op:    *op,
		UID:   *uid,
		GID:   *gid,
		Path:  *path,
		Dest:  *dest,
		Bases: baseList,
	}

	// Drop privileges before any file operation.
	if err := helper.DropPrivileges(p.UID, p.GID); err != nil {
		// Write error as JSON to stderr
		os.Stderr.WriteString(`{"error":"` + err.Error() + `"}` + "\n")
		os.Exit(helper.ExitSecurity)
	}

	code := helper.Run(p, os.Stdin, os.Stdout, os.Stderr)
	os.Exit(code)
}
