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

// StatResponse is the output of the stat operation.
type StatResponse = Entry

// Exit codes matching errno-style categories.
const (
	ExitOK        = 0
	ExitBadArgs   = 1
	ExitSecurity  = 2
	ExitPermisson = 3  // EPERM / EACCES
	ExitNotFound  = 4  // ENOENT
	ExitExists    = 5  // EEXIST
	ExitInternal  = 10 // unexpected errors
)
