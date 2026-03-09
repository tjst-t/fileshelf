package server

import (
	"context"
	"net/http"
	"os/user"
	"strconv"

	"github.com/tjst-t/fileshelf/internal/fileop"
)

type contextKey string

const userContextKey contextKey = "user"

// UserFromContext extracts the User from the request context.
func UserFromContext(ctx context.Context) *fileop.User {
	u, _ := ctx.Value(userContextKey).(*fileop.User)
	return u
}

// AutheliaMiddleware extracts user info from Authelia Forward Auth headers.
func AutheliaMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		username := r.Header.Get("Remote-User")
		if username == "" {
			writeJSONError(w, "authentication required", http.StatusUnauthorized)
			return
		}

		u, err := resolveUser(username)
		if err != nil {
			writeJSONError(w, "user not found: "+username, http.StatusForbidden)
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, u)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// DevMiddleware sets a fixed dev user for testing without Authelia.
func DevMiddleware(devUser string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, err := resolveUser(devUser)
			if err != nil {
				writeJSONError(w, "dev user not found: "+devUser, http.StatusInternalServerError)
				return
			}
			ctx := context.WithValue(r.Context(), userContextKey, u)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func resolveUser(username string) (*fileop.User, error) {
	u, err := user.Lookup(username)
	if err != nil {
		return nil, err
	}

	uid, err := strconv.Atoi(u.Uid)
	if err != nil {
		return nil, err
	}

	gid, err := strconv.Atoi(u.Gid)
	if err != nil {
		return nil, err
	}

	return &fileop.User{
		Username: username,
		UID:      uid,
		GID:      gid,
	}, nil
}
