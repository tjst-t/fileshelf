package config

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// Config is the top-level configuration.
type Config struct {
	Server ServerConfig `yaml:"server"`
	Helper HelperConfig `yaml:"helper"`
	Shares []Share      `yaml:"shares"`
}

// ServerConfig holds HTTP server settings.
type ServerConfig struct {
	Listen    string `yaml:"listen"`
	DevMode   bool   `yaml:"dev_mode"`
	DevUser   string `yaml:"dev_user"`
	StaticDir string `yaml:"static_dir"`
}

// HelperConfig holds helper binary settings.
type HelperConfig struct {
	Path    string        `yaml:"path"`
	Timeout time.Duration `yaml:"timeout"`
}

// Share represents a configured file share.
type Share struct {
	Name string `yaml:"name"`
	Path string `yaml:"path"`
}

// Load reads and parses a YAML config file.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing config: %w", err)
	}

	cfg.setDefaults()

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	return &cfg, nil
}

func (c *Config) setDefaults() {
	if c.Server.Listen == "" {
		c.Server.Listen = ":8080"
	}
	if c.Helper.Timeout == 0 {
		c.Helper.Timeout = 30 * time.Second
	}
	if c.Server.StaticDir == "" {
		c.Server.StaticDir = "./frontend/dist"
	}
}

// Validate checks the configuration for errors.
func (c *Config) Validate() error {
	if len(c.Shares) == 0 {
		return fmt.Errorf("at least one share must be configured")
	}

	for i, s := range c.Shares {
		if s.Name == "" {
			return fmt.Errorf("share[%d]: name is required", i)
		}
		if s.Path == "" {
			return fmt.Errorf("share[%d] (%s): path is required", i, s.Name)
		}
	}

	if !c.Server.DevMode {
		if c.Helper.Path == "" {
			return fmt.Errorf("helper.path is required")
		}
	}

	if c.Server.DevMode && c.Server.DevUser == "" {
		return fmt.Errorf("server.dev_user is required when dev_mode is enabled")
	}

	return nil
}

// ShareBasePaths returns all share paths for use as base path validation.
func (c *Config) ShareBasePaths() []string {
	paths := make([]string, len(c.Shares))
	for i, s := range c.Shares {
		paths[i] = s.Path
	}
	return paths
}
