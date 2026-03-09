package helper

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"syscall"
)

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
	Op    string
	UID   int
	GID   int
	Path  string
	Dest  string
	Bases []string
}

// Run executes the helper operation and writes results to stdout/stderr.
// Returns the exit code.
func Run(p Params, stdin io.Reader, stdout, stderr io.Writer) int {
	if !AllowedOps[p.Op] {
		writeError(stderr, fmt.Sprintf("unknown operation: %s", p.Op), ExitBadArgs)
		return ExitBadArgs
	}

	if p.UID == 0 {
		writeError(stderr, "refusing to run as uid=0 (root)", ExitSecurity)
		return ExitSecurity
	}

	// Validate path
	cleanPath, err := ValidatePath(p.Path, p.Bases)
	if err != nil {
		writeError(stderr, err.Error(), ExitSecurity)
		return ExitSecurity
	}
	p.Path = cleanPath

	// Validate dest if needed
	if p.Op == "rename" || p.Op == "copy" {
		if p.Dest == "" {
			writeError(stderr, "dest is required for "+p.Op, ExitBadArgs)
			return ExitBadArgs
		}
		cleanDest, err := ValidateDestPath(p.Dest, p.Bases)
		if err != nil {
			writeError(stderr, err.Error(), ExitSecurity)
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
		writeJSON(stdout, map[string]bool{"ok": true})
		return ExitOK

	case "list":
		result, err := OpList(p.Path)
		if err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, result)
		return ExitOK

	case "read":
		if err := OpRead(p.Path, stdout); err != nil {
			return writeOpError(stderr, err)
		}
		return ExitOK

	case "write":
		if err := OpWrite(p.Path, stdin); err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, map[string]bool{"ok": true})
		return ExitOK

	case "mkdir":
		if err := OpMkdir(p.Path); err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, map[string]bool{"ok": true})
		return ExitOK

	case "delete":
		if err := OpDelete(p.Path); err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, map[string]bool{"ok": true})
		return ExitOK

	case "rename":
		if err := OpRename(p.Path, p.Dest); err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, map[string]bool{"ok": true})
		return ExitOK

	case "copy":
		if err := OpCopy(p.Path, p.Dest); err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, map[string]bool{"ok": true})
		return ExitOK

	case "stat":
		result, err := OpStat(p.Path)
		if err != nil {
			return writeOpError(stderr, err)
		}
		writeJSON(stdout, result)
		return ExitOK

	default:
		writeError(stderr, "unknown operation: "+p.Op, ExitBadArgs)
		return ExitBadArgs
	}
}

func writeJSON(w io.Writer, v interface{}) {
	enc := json.NewEncoder(w)
	enc.Encode(v)
}

func writeError(w io.Writer, msg string, _ int) {
	writeJSON(w, ErrorResponse{Error: msg})
}

func writeOpError(w io.Writer, err error) int {
	code := classifyError(err)
	writeError(w, err.Error(), code)
	return code
}

func classifyError(err error) int {
	if errors.Is(err, os.ErrPermission) {
		return ExitPermisson
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
			return ExitPermisson
		case syscall.ENOENT:
			return ExitNotFound
		case syscall.EEXIST:
			return ExitExists
		}
	}
	return ExitInternal
}
