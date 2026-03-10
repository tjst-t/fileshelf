package helper

import "time"

// Entry represents a file or directory entry.
type Entry struct {
	Name     string    `json:"name"`
	Type     string    `json:"type"` // "file" or "dir"
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
	Perms    string    `json:"perms"`
}

// ErrorResponse is written to stdout on failure.
type ErrorResponse struct {
	Error string `json:"error"`
}

// ListResponse is the output of the list operation.
type ListResponse struct {
	Entries []Entry `json:"entries"`
}

// WriteResponse is the output of the write operation.
type WriteResponse struct {
	OK   bool  `json:"ok"`
	Size int64 `json:"size"`
}

// Exit codes matching the Issue #8 specification.
const (
	ExitOK       = 0
	ExitPerm     = 1  // EPERM / EACCES
	ExitNotFound = 2  // ENOENT
	ExitGeneral  = 3  // other errors
	ExitExists   = 4  // EEXIST
	ExitSecurity = 10 // security violations (uid=0, path traversal)
	ExitBadArgs  = 11 // invalid arguments
)
