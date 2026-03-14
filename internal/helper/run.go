package helper

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"syscall"
)

var okResult = map[string]bool{"ok": true}

// AllowedOps is the set of valid operations.
var AllowedOps = map[string]bool{
	"access": true,
	"list":   true,
	"read":   true,
	"write":  true,
	"mkdir":  true,
	"delete": true,
	"rename": true,
	"copy":   true,
	"stat":   true,
}

// Params holds the parsed command-line arguments.
type Params struct {
	Op     string
	UID    int
	GID    int
	Path   string
	Dest   string
	Bases  []string
	Offset int64
	Length int64
}

// Run executes the helper operation and writes results to stdout/stderr.
// Returns the exit code.
func Run(p Params, stdin io.Reader, stdout, stderr io.Writer) int {
	if !AllowedOps[p.Op] {
		writeError(stderr, fmt.Sprintf("unknown operation: %s", p.Op))
		return ExitBadArgs
	}

	if p.UID == 0 {
		writeError(stderr, "refusing to run as uid=0 (root)")
		return ExitSecurity
	}

	// Validate path
	cleanPath, err := ValidatePath(p.Path, p.Bases)
	if err != nil {
		writeError(stderr, err.Error())
		return ExitSecurity
	}
	p.Path = cleanPath

	// Validate dest if needed
	if p.Op == "rename" || p.Op == "copy" {
		if p.Dest == "" {
			writeError(stderr, "dest is required for "+p.Op)
			return ExitBadArgs
		}
		cleanDest, err := ValidatePath(p.Dest, p.Bases)
		if err != nil {
			writeError(stderr, err.Error())
			return ExitSecurity
		}
		p.Dest = cleanDest
	}

	return execute(p, stdin, stdout, stderr)
}

func execute(p Params, stdin io.Reader, stdout, stderr io.Writer) int {
	switch p.Op {
	case "access":
		if err := OpAccess(p.Path); err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, okResult)
		return ExitOK

	case "list":
		result, err := OpList(p.Path)
		if err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, result)
		return ExitOK

	case "read":
		if err := OpRead(p.Path, p.Offset, p.Length, stdout); err != nil {
			// read errors go to stderr since stdout is the binary stream
			return writeOpError(stderr, err)
		}
		return ExitOK

	case "write":
		resp, err := OpWrite(p.Path, stdin)
		if err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, resp)
		return ExitOK

	case "mkdir":
		if err := OpMkdir(p.Path); err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, okResult)
		return ExitOK

	case "delete":
		if err := OpDelete(p.Path, p.Bases); err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, okResult)
		return ExitOK

	case "rename":
		if err := OpRename(p.Path, p.Dest); err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, okResult)
		return ExitOK

	case "copy":
		if err := OpCopy(p.Path, p.Dest); err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, okResult)
		return ExitOK

	case "stat":
		result, err := OpStat(p.Path)
		if err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, result)
		return ExitOK

	default:
		writeError(stderr, "unknown operation: "+p.Op)
		return ExitBadArgs
	}
}

func writeJSON(w io.Writer, v interface{}) {
	json.NewEncoder(w).Encode(v)
}

func writeError(w io.Writer, msg string) {
	writeJSON(w, ErrorResponse{Error: msg})
}

func writeOpError(w io.Writer, err error) int {
	code := classifyError(err)
	writeError(w, err.Error())
	return code
}

func classifyError(err error) int {
	if errors.Is(err, os.ErrPermission) {
		return ExitPerm
	}
	if errors.Is(err, os.ErrNotExist) {
		return ExitNotFound
	}
	if errors.Is(err, os.ErrExist) {
		return ExitExists
	}
	var errno syscall.Errno
	if errors.As(err, &errno) {
		switch errno {
		case syscall.EACCES, syscall.EPERM:
			return ExitPerm
		case syscall.ENOENT:
			return ExitNotFound
		case syscall.EEXIST:
			return ExitExists
		}
	}
	return ExitGeneral
}
