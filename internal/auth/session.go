package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"time"

	"github.com/jmoiron/sqlx"
)

const (
	SessionCookieName = "session"
	SessionTTL        = 30 * 24 * time.Hour
)

var ErrSessionInvalid = errors.New("invalid or expired session")

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// CreateSession inserts a session row and sets the cookie on w. secure controls the Secure cookie flag
// (should be true in production behind HTTPS).
func CreateSession(w http.ResponseWriter, db *sqlx.DB, userID int64, userAgent string, secure bool) error {
	token, err := newToken()
	if err != nil {
		return err
	}
	id := hashToken(token)
	_, err = db.Exec(
		`INSERT INTO sessions (id, user_id, user_agent, expires_at) VALUES (?, ?, ?, datetime('now', '+30 days'))`,
		id, userID, userAgent,
	)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(SessionTTL.Seconds()),
	})
	return nil
}

func ClearSession(w http.ResponseWriter, db *sqlx.DB, r *http.Request) {
	if c, err := r.Cookie(SessionCookieName); err == nil {
		_, _ = db.Exec(`DELETE FROM sessions WHERE id = ?`, hashToken(c.Value))
	}
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
}

// UserIDFromSession resolves the current request's session cookie to a user id.
func UserIDFromSession(db *sqlx.DB, r *http.Request) (int64, error) {
	c, err := r.Cookie(SessionCookieName)
	if err != nil {
		return 0, ErrSessionInvalid
	}
	var userID int64
	err = db.Get(&userID, `SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')`, hashToken(c.Value))
	if err != nil {
		return 0, ErrSessionInvalid
	}
	return userID, nil
}
