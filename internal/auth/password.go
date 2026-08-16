package auth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"strconv"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/pbkdf2"
)

const djangoPBKDF2Prefix = "pbkdf2_sha256$"

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// IsDjangoHash reports whether hash is a Django PBKDF2-SHA256 password hash
// ("pbkdf2_sha256$<iterations>$<salt>$<base64-hash>") rather than one of this app's bcrypt
// hashes. Used by the login handler to know when to opportunistically upgrade the stored hash
// to bcrypt after a successful verify.
func IsDjangoHash(hash string) bool {
	return strings.HasPrefix(hash, djangoPBKDF2Prefix)
}

// verifyDjangoPBKDF2 checks password against a Django-format PBKDF2-SHA256 hash, migrated
// verbatim from the old Django/DRF alumni portal (django.contrib.auth.hashers.PBKDF2PasswordHasher).
// Malformed input returns false rather than panicking.
func verifyDjangoPBKDF2(hash, password string) bool {
	parts := strings.Split(hash, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2_sha256" {
		return false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations <= 0 {
		return false
	}
	salt := parts[2]
	want, err := base64.StdEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}
	got := pbkdf2.Key([]byte(password), []byte(salt), iterations, len(want), sha256.New)
	return subtle.ConstantTimeCompare(got, want) == 1
}

// VerifyPassword checks password against hash, dispatching by the hash's own format: a Django
// PBKDF2-SHA256 hash (see IsDjangoHash) is verified natively, anything else is treated as this
// app's own bcrypt hash. Every existing call site is unaffected — they never need to know which
// scheme a given account uses.
func VerifyPassword(hash, password string) bool {
	if IsDjangoHash(hash) {
		return verifyDjangoPBKDF2(hash, password)
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
