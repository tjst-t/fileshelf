package main

import (
	"encoding/json"
	"flag"
	"fmt"
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

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: fileshelf-helper -op <op> -uid <uid> -gid <gid> -path <path> -bases <bases> [-dest <dest>]\n\n")
		fmt.Fprintf(os.Stderr, "Operations: access, list, read, write, mkdir, delete, rename, copy, stat\n\n")
		flag.PrintDefaults()
	}

	flag.Parse()

	// Validate required flags
	var missing []string
	if *op == "" {
		missing = append(missing, "-op")
	}
	if *uid < 0 {
		missing = append(missing, "-uid")
	}
	if *gid < 0 {
		missing = append(missing, "-gid")
	}
	if *path == "" {
		missing = append(missing, "-path")
	}
	if *bases == "" {
		missing = append(missing, "-bases")
	}

	if len(missing) > 0 {
		writeJSONError(fmt.Sprintf("missing required flags: %s", strings.Join(missing, ", ")))
		flag.Usage()
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
		writeJSONError(err.Error())
		os.Exit(helper.ExitSecurity)
	}

	code := helper.Run(p, os.Stdin, os.Stdout, os.Stderr)
	os.Exit(code)
}

func writeJSONError(msg string) {
	json.NewEncoder(os.Stderr).Encode(helper.ErrorResponse{Error: msg})
}
