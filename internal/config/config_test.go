package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadValid(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	content := `
server:
  listen: ":9090"
  dev_mode: true
  dev_user: "testuser"
  static_dir: "./dist"

helper:
  path: "/usr/local/bin/fileshelf-helper"
  timeout: 60s

shares:
  - name: "media"
    path: "/tank/media"
  - name: "docs"
    path: "/tank/docs"
`
	os.WriteFile(cfgPath, []byte(content), 0644)

	cfg, err := Load(cfgPath)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.Server.Listen != ":9090" {
		t.Errorf("listen=%q, want %q", cfg.Server.Listen, ":9090")
	}
	if !cfg.Server.DevMode {
		t.Error("expected dev_mode=true")
	}
	if cfg.Server.DevUser != "testuser" {
		t.Errorf("dev_user=%q, want %q", cfg.Server.DevUser, "testuser")
	}
	if len(cfg.Shares) != 2 {
		t.Errorf("shares=%d, want 2", len(cfg.Shares))
	}
	if cfg.Helper.Timeout.Seconds() != 60 {
		t.Errorf("timeout=%v, want 60s", cfg.Helper.Timeout)
	}
}

func TestLoadDefaults(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	content := `
server:
  dev_mode: true
  dev_user: "testuser"

shares:
  - name: "media"
    path: "/tank/media"
`
	os.WriteFile(cfgPath, []byte(content), 0644)

	cfg, err := Load(cfgPath)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.Server.Listen != ":8080" {
		t.Errorf("default listen=%q, want %q", cfg.Server.Listen, ":8080")
	}
	if cfg.Helper.Timeout.Seconds() != 30 {
		t.Errorf("default timeout=%v, want 30s", cfg.Helper.Timeout)
	}
}

func TestValidateNoShares(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	content := `
server:
  dev_mode: true
  dev_user: "testuser"
shares: []
`
	os.WriteFile(cfgPath, []byte(content), 0644)

	_, err := Load(cfgPath)
	if err == nil {
		t.Error("expected error for no shares")
	}
}

func TestValidateDevModeNoUser(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	content := `
server:
  dev_mode: true
shares:
  - name: "media"
    path: "/tank/media"
`
	os.WriteFile(cfgPath, []byte(content), 0644)

	_, err := Load(cfgPath)
	if err == nil {
		t.Error("expected error for dev_mode without dev_user")
	}
}

func TestValidateNoHelperPath(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	content := `
server:
  dev_mode: false
shares:
  - name: "media"
    path: "/tank/media"
`
	os.WriteFile(cfgPath, []byte(content), 0644)

	_, err := Load(cfgPath)
	if err == nil {
		t.Error("expected error for missing helper.path in non-dev mode")
	}
}

func TestShareBasePaths(t *testing.T) {
	cfg := &Config{
		Shares: []Share{
			{Name: "a", Path: "/tank/a"},
			{Name: "b", Path: "/tank/b"},
		},
	}
	paths := cfg.ShareBasePaths()
	if len(paths) != 2 || paths[0] != "/tank/a" || paths[1] != "/tank/b" {
		t.Errorf("unexpected base paths: %v", paths)
	}
}
