package fileop

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"time"
)

// ForkFileOperator implements FileOperator by forking the helper binary per request.
type ForkFileOperator struct {
	HelperPath string
	Bases      []string
	Timeout    time.Duration
}

var _ FileOperator = (*ForkFileOperator)(nil)

func (f *ForkFileOperator) Access(ctx context.Context, user User, path string) error {
	_, err := f.run(ctx, user, "access", path, "", nil)
	return err
}

func (f *ForkFileOperator) List(ctx context.Context, user User, path string) ([]Entry, error) {
	out, err := f.run(ctx, user, "list", path, "", nil)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Entries []Entry `json:"entries"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, fmt.Errorf("parsing list output: %w", err)
	}
	return resp.Entries, nil
}

func (f *ForkFileOperator) Read(ctx context.Context, user User, path string) (io.ReadCloser, error) {
	ctx, cancel := f.contextWithTimeout(ctx)

	cmd := f.command(ctx, user, "read", path, "")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("starting helper: %w", err)
	}

	return &readCloser{
		ReadCloser: stdout,
		cmd:        cmd,
		stderr:     &stderr,
		cancel:     cancel,
	}, nil
}

func (f *ForkFileOperator) Write(ctx context.Context, user User, path string, r io.Reader) error {
	_, err := f.run(ctx, user, "write", path, "", r)
	return err
}

func (f *ForkFileOperator) Mkdir(ctx context.Context, user User, path string) error {
	_, err := f.run(ctx, user, "mkdir", path, "", nil)
	return err
}

func (f *ForkFileOperator) Delete(ctx context.Context, user User, path string) error {
	_, err := f.run(ctx, user, "delete", path, "", nil)
	return err
}

func (f *ForkFileOperator) Rename(ctx context.Context, user User, oldPath, newPath string) error {
	_, err := f.run(ctx, user, "rename", oldPath, newPath, nil)
	return err
}

func (f *ForkFileOperator) Copy(ctx context.Context, user User, srcPath, dstPath string) error {
	_, err := f.run(ctx, user, "copy", srcPath, dstPath, nil)
	return err
}

func (f *ForkFileOperator) Stat(ctx context.Context, user User, path string) (*Entry, error) {
	out, err := f.run(ctx, user, "stat", path, "", nil)
	if err != nil {
		return nil, err
	}

	var entry Entry
	if err := json.Unmarshal(out, &entry); err != nil {
		return nil, fmt.Errorf("parsing stat output: %w", err)
	}
	return &entry, nil
}

func (f *ForkFileOperator) contextWithTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	timeout := f.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	return context.WithTimeout(ctx, timeout)
}

func (f *ForkFileOperator) command(ctx context.Context, user User, op, path, dest string) *exec.Cmd {
	args := []string{
		"-op", op,
		"-uid", fmt.Sprintf("%d", user.UID),
		"-gid", fmt.Sprintf("%d", user.GID),
		"-path", path,
		"-bases", strings.Join(f.Bases, ","),
	}
	if dest != "" {
		args = append(args, "-dest", dest)
	}
	return exec.CommandContext(ctx, f.HelperPath, args...)
}

func (f *ForkFileOperator) run(ctx context.Context, user User, op, path, dest string, stdin io.Reader) ([]byte, error) {
	ctx, cancel := f.contextWithTimeout(ctx)
	defer cancel()

	cmd := f.command(ctx, user, op, path, dest)
	if stdin != nil {
		cmd.Stdin = stdin
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return nil, f.parseError(err, stderr.Bytes(), stdout.Bytes())
	}

	return stdout.Bytes(), nil
}

func (f *ForkFileOperator) parseError(err error, stderr, stdout []byte) error {
	// Try to extract error message from stderr (JSON format)
	var errResp struct {
		Error string `json:"error"`
	}

	// Try stderr first, then stdout
	for _, data := range [][]byte{stderr, stdout} {
		if json.Unmarshal(data, &errResp) == nil && errResp.Error != "" {
			exitErr, ok := err.(*exec.ExitError)
			if ok {
				return &HelperError{
					Message:  errResp.Error,
					ExitCode: exitErr.ExitCode(),
				}
			}
			return &HelperError{
				Message:  errResp.Error,
				ExitCode: -1,
			}
		}
	}

	return fmt.Errorf("helper error: %w (stderr: %s)", err, string(stderr))
}

// HelperError represents an error from the helper binary.
type HelperError struct {
	Message  string
	ExitCode int
}

func (e *HelperError) Error() string {
	return e.Message
}

// IsPermission returns true if the error is a permission error.
func (e *HelperError) IsPermission() bool {
	return e.ExitCode == 3
}

// IsNotFound returns true if the error is a not found error.
func (e *HelperError) IsNotFound() bool {
	return e.ExitCode == 4
}

// IsExists returns true if the error is an already exists error.
func (e *HelperError) IsExists() bool {
	return e.ExitCode == 5
}

// readCloser wraps a ReadCloser and waits for the command to finish on Close.
type readCloser struct {
	io.ReadCloser
	cmd    *exec.Cmd
	stderr *bytes.Buffer
	cancel context.CancelFunc
}

func (r *readCloser) Close() error {
	defer r.cancel()
	r.ReadCloser.Close()
	err := r.cmd.Wait()
	if err != nil {
		return fmt.Errorf("helper read error: %w (stderr: %s)", err, r.stderr.String())
	}
	return nil
}
