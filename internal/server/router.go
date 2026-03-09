package server

import (
	"io/fs"
	"net/http"
	"os"
	"strings"

	"github.com/tjst-t/fileshelf/internal/config"
	"github.com/tjst-t/fileshelf/internal/fileop"
)

// NewRouter creates the HTTP router with all routes and middleware.
func NewRouter(cfg *config.Config, fop fileop.FileOperator) http.Handler {
	mux := http.NewServeMux()

	h := &Handlers{
		FileOp: fop,
		Config: cfg,
	}

	// Apply auth middleware
	var authMiddleware func(http.Handler) http.Handler
	if cfg.Server.DevMode {
		authMiddleware = DevMiddleware(cfg.Server.DevUser)
	} else {
		authMiddleware = func(next http.Handler) http.Handler {
			return AutheliaMiddleware(next)
		}
	}

	// API routes
	apiMux := http.NewServeMux()
	apiMux.HandleFunc("GET /api/shares", h.HandleShares)
	apiMux.HandleFunc("GET /api/files", h.HandleFilesList)
	apiMux.HandleFunc("GET /api/files/stat", h.HandleFilesStat)
	apiMux.HandleFunc("GET /api/files/download", h.HandleFilesDownload)
	apiMux.HandleFunc("GET /api/files/preview", h.HandleFilesPreview)
	apiMux.HandleFunc("PUT /api/files/upload", h.HandleFilesUpload)
	apiMux.HandleFunc("POST /api/files/mkdir", h.HandleFilesMkdir)
	apiMux.HandleFunc("DELETE /api/files", h.HandleFilesDelete)
	apiMux.HandleFunc("POST /api/files/rename", h.HandleFilesRename)
	apiMux.HandleFunc("POST /api/files/copy", h.HandleFilesCopy)

	// Wrap API with auth middleware
	mux.Handle("/api/", authMiddleware(apiMux))

	// Serve static files (React SPA)
	staticDir := cfg.Server.StaticDir
	if _, err := os.Stat(staticDir); err == nil {
		spa := &spaHandler{
			staticFS:    os.DirFS(staticDir),
			fileServer:  http.FileServer(http.Dir(staticDir)),
			staticDir:   staticDir,
		}
		mux.Handle("/", spa)
	}

	return mux
}

// spaHandler serves static files and falls back to index.html for SPA routing.
type spaHandler struct {
	staticFS   fs.FS
	fileServer http.Handler
	staticDir  string
}

func (s *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}

	// Check if file exists
	_, err := fs.Stat(s.staticFS, path)
	if err != nil {
		// Fall back to index.html for SPA routes
		http.ServeFile(w, r, s.staticDir+"/index.html")
		return
	}

	s.fileServer.ServeHTTP(w, r)
}
