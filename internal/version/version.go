package version

// These variables are set at build time via ldflags.
var (
	Version = "dev"
	Commit  = "unknown"
)

// String returns a formatted version string.
func String() string {
	if Commit == "unknown" || len(Commit) < 7 {
		return Version
	}
	return Version + " (" + Commit[:7] + ")"
}
