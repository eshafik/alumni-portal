package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
)

const (
	OTPTTL            = 10 * time.Minute
	OTPMaxAttempts    = 5
	OTPResendCooldown = 60 * time.Second
	// OTPResendCooldownSeconds is OTPResendCooldown as a plain int, for handlers that need to
	// report "the full cooldown" in a JSON response without having a time.Duration on hand
	// (e.g. a branch that intentionally never calls CreateOTP, so there's nothing to measure).
	OTPResendCooldownSeconds = int(OTPResendCooldown / time.Second)
)

var (
	ErrOTPInvalid  = errors.New("invalid or expired code")
	ErrOTPTooMany  = errors.New("too many attempts, request a new code")
	ErrOTPCooldown = errors.New("please wait before requesting another code")
)

func GenerateOTPCode() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	n := (uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])) % 1000000
	return fmt.Sprintf("%06d", n), nil
}

func hashOTP(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

// CreateOTP invalidates prior unconsumed OTPs for email+purpose and inserts a fresh one.
// Returns the plaintext code to be emailed, and the cooldown window (from now) before the
// next resend is allowed — always OTPResendCooldown on success, since a fresh code just
// (re)started that window. Callers surface this to the client so the UI's countdown reflects
// server truth (e.g. after a page reload mid-cooldown) rather than assuming a fixed duration.
func CreateOTP(db *sqlx.DB, email, purpose string) (string, time.Duration, error) {
	if remaining := RemainingCooldown(db, email, purpose); remaining > 0 {
		return "", remaining, ErrOTPCooldown
	}

	code, err := GenerateOTPCode()
	if err != nil {
		return "", OTPResendCooldown, err
	}
	_, err = db.Exec(
		`INSERT INTO otps (email, code_hash, purpose, expires_at) VALUES (?, ?, ?, datetime('now', '+10 minutes'))`,
		email, hashOTP(code), purpose,
	)
	if err != nil {
		return "", OTPResendCooldown, err
	}
	return code, OTPResendCooldown, nil
}

// RemainingCooldown returns how long until the next OTP resend is allowed for email+purpose —
// zero if none is currently in effect. At least OTPResendCooldown (60s) always applies between
// resends, matching the product requirement that resends are rate-limited to no more than
// once a minute.
func RemainingCooldown(db *sqlx.DB, email, purpose string) time.Duration {
	var lastCreated *string
	_ = db.Get(&lastCreated, `SELECT created_at FROM otps WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1`, email, purpose)
	if lastCreated == nil {
		return 0
	}
	t, err := time.Parse("2006-01-02 15:04:05", *lastCreated)
	if err != nil {
		return 0
	}
	elapsed := time.Since(t)
	if elapsed >= OTPResendCooldown {
		return 0
	}
	return OTPResendCooldown - elapsed
}

// VerifyOTP checks the latest unconsumed OTP for email+purpose against the supplied code.
func VerifyOTP(db *sqlx.DB, email, purpose, code string) error {
	var otp struct {
		ID       int64  `db:"id"`
		CodeHash string `db:"code_hash"`
		Attempts int    `db:"attempts"`
	}
	err := db.Get(&otp, `SELECT id, code_hash, attempts FROM otps
		WHERE email = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > datetime('now')
		ORDER BY id DESC LIMIT 1`, email, purpose)
	if err != nil {
		return ErrOTPInvalid
	}
	if otp.Attempts >= OTPMaxAttempts {
		return ErrOTPTooMany
	}
	if otp.CodeHash != hashOTP(code) {
		_, _ = db.Exec(`UPDATE otps SET attempts = attempts + 1 WHERE id = ?`, otp.ID)
		return ErrOTPInvalid
	}
	_, err = db.Exec(`UPDATE otps SET consumed_at = datetime('now') WHERE id = ?`, otp.ID)
	return err
}
