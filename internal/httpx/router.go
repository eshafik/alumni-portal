package httpx

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// NewRouter builds the base chi router with standard middleware. Route registration for
// each resource happens in main.go, which has access to all the handler structs.
func NewRouter() *chi.Mux {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(RequireXRequestedWithOnMutations)
	return r
}

// RequireXRequestedWithOnMutations is a lightweight CSRF mitigation: since the SPA and API
// share one origin, browsers won't set this header on cross-site form/img/script-triggered
// requests, but our own fetch() client always sets it.
func RequireXRequestedWithOnMutations(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
			if r.URL.Path == "/api/auth/login" || r.URL.Path == "/api/auth/signup" {
				// allow first-contact requests without the header (no session yet to protect)
				next.ServeHTTP(w, r)
				return
			}
			if r.Header.Get("X-Requested-With") == "" {
				Error(w, http.StatusForbidden, "missing required header")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
