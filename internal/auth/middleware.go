package auth

import (
	"context"
	"net/http"

	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/httpx"
	"alumni-portal/internal/models"
)

type ctxKey string

const userCtxKey ctxKey = "currentUser"

// RequireAuth resolves the session cookie, loads the user, and rejects suspended/rejected accounts.
// It does NOT require "approved" status by itself — some routes (e.g. /api/auth/me) must work for
// pending users so the frontend can show "waiting for approval" state.
func RequireAuth(db *sqlx.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, err := UserIDFromSession(db, r)
			if err != nil {
				httpx.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}
			var u models.User
			if err := db.Get(&u, `SELECT * FROM users WHERE id = ?`, userID); err != nil {
				httpx.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}
			if u.Status == models.StatusSuspended || u.Status == models.StatusRejected {
				httpx.Error(w, http.StatusForbidden, "account is "+u.Status)
				return
			}
			ctx := context.WithValue(r.Context(), userCtxKey, &u)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// OptionalAuth resolves the session cookie and attaches the user to the request context if
// one is present and valid, but never blocks the request either way — used by routes that
// must stay reachable by anonymous visitors while still branching their response for a
// logged-in caller (e.g. notices: public ones show to everyone, private ones only once
// CurrentUser(r) resolves to an approved member).
func OptionalAuth(db *sqlx.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, err := UserIDFromSession(db, r)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}
			var u models.User
			if err := db.Get(&u, `SELECT * FROM users WHERE id = ?`, userID); err != nil {
				next.ServeHTTP(w, r)
				return
			}
			ctx := context.WithValue(r.Context(), userCtxKey, &u)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireApproved further restricts to fully approved members (blocks pending_* users).
func RequireApproved(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := CurrentUser(r)
		if u == nil || u.Status != models.StatusApproved {
			httpx.Error(w, http.StatusForbidden, "account pending approval")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireRole restricts to one of the given role IDs. Must run after RequireAuth.
func RequireRole(roleIDs ...int64) func(http.Handler) http.Handler {
	allowed := make(map[int64]bool, len(roleIDs))
	for _, id := range roleIDs {
		allowed[id] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u := CurrentUser(r)
			if u == nil || !allowed[u.RoleID] {
				httpx.Error(w, http.StatusForbidden, "insufficient permissions")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func CurrentUser(r *http.Request) *models.User {
	u, _ := r.Context().Value(userCtxKey).(*models.User)
	return u
}
