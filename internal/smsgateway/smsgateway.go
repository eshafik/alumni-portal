// Package smsgateway sends a single SMS through one of two pluggable drivers, selected at
// startup by config.Config.SMSDriver ("twilio", the default, or "bulksmsbd"). Both talk to
// their provider's plain HTTP API directly (no SDK dependency), matching this app's existing
// hand-rolled net/smtp approach in internal/mailer.
package smsgateway

import "alumni-portal/internal/config"

// Result is the provider's answer to a single send attempt — always populated when err is nil.
// err (returned separately by Driver.Send) means a transport/network failure that never even
// reached the provider; Result means the provider was reached and responded, successfully or not.
type Result struct {
	Success      bool
	StatusCode   string // driver-native code, whatever that provider calls it
	ErrorMessage string
}

type Driver interface {
	// Send submits one SMS to one phone number. Each driver formats the phone number to its own
	// provider's expected shape (see bulksmsbd.go/twilio.go) — callers always pass the number in
	// this app's stored format (E.164 with a leading "+", e.g. "+8801XXXXXXXXX").
	Send(phone, message string) (Result, error)
}

// New selects the configured driver. Defaults to Twilio if SMSDriver is unset/unrecognized.
func New(cfg config.Config) Driver {
	if cfg.SMSDriver == "bulksmsbd" {
		return &bulkSMSBDDriver{cfg: cfg}
	}
	return &twilioDriver{cfg: cfg}
}
