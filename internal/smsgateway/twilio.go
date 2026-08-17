package smsgateway

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"alumni-portal/internal/config"
)

type twilioDriver struct {
	cfg config.Config
}

// twilioAPIBase is a var (not a const) purely so tests can point it at an httptest mock server
// instead of the real api.twilio.com.
var twilioAPIBase = "https://api.twilio.com"

// twilioMessageResponse covers both the success shape (sid/status set, error_code null) and the
// error shape Twilio returns on request-level rejects (e.g. malformed "To" number) — Twilio uses
// the same Messages endpoint for both, distinguished by HTTP status + whether error_code is set.
type twilioMessageResponse struct {
	SID       string `json:"sid"`
	Status    string `json:"status"`     // "queued"/"accepted" on success
	ErrorCode *int   `json:"error_code"` // present + non-null only on failure
	Message   string `json:"message"`    // Twilio's human-readable error text (error responses only)
	Code      *int   `json:"code"`       // Twilio's numeric error code (error responses only)
}

// Send calls Twilio's official REST API directly via net/http (Basic Auth with Account SID +
// Auth Token) — no SDK dependency, matching this app's existing hand-rolled net/smtp approach.
// Unlike bulksmsbd, Twilio requires the full E.164 number *including* the leading "+".
//
// A 201 response with no error_code means the message was accepted for delivery — not a final
// delivery confirmation (that requires status-callback webhooks, out of scope here) — which
// matches bulksmsbd's own "submitted successfully" semantics, so both drivers agree on what
// "sent" means in this app's outreach log.
func (d *twilioDriver) Send(phone, message string) (Result, error) {
	endpoint := fmt.Sprintf("%s/2010-04-01/Accounts/%s/Messages.json", twilioAPIBase, d.cfg.TwilioAccountSID)

	form := url.Values{}
	form.Set("To", phone)
	form.Set("From", d.cfg.TwilioFromNumber)
	form.Set("Body", message)

	req, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return Result{}, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(d.cfg.TwilioAccountSID, d.cfg.TwilioAuthToken)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	var parsed twilioMessageResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return Result{}, fmt.Errorf("decode response: %w", err)
	}

	if resp.StatusCode == http.StatusCreated && parsed.ErrorCode == nil {
		return Result{Success: true, StatusCode: parsed.Status}, nil
	}

	statusCode := strconv.Itoa(resp.StatusCode)
	if parsed.Code != nil {
		statusCode = strconv.Itoa(*parsed.Code)
	}
	return Result{Success: false, StatusCode: statusCode, ErrorMessage: parsed.Message}, nil
}
