// Must match internal/auth/otp.go's OTPResendCooldown on the backend. The server is the
// actual source of truth/enforcement — this only drives the client-side countdown UI so users
// aren't left free to spam-click a button that silently no-ops server-side during the window.
export const OTP_RESEND_COOLDOWN_SECONDS = 60
