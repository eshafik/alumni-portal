package smsgateway

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"alumni-portal/internal/config"
)

func TestBulkSMSBDDriver_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req bulkSMSBDRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		if strings.Contains(req.Number, "+") {
			t.Errorf("bulksmsbd number must not contain '+', got %q", req.Number)
		}
		if req.Number != "8801740999768" {
			t.Errorf("unexpected number %q", req.Number)
		}
		_ = json.NewEncoder(w).Encode(bulkSMSBDResponse{ResponseCode: 202, MessageID: 1, SuccessMsg: "SMS Submitted Successfully"})
	}))
	defer srv.Close()

	d := &bulkSMSBDDriver{cfg: config.Config{SMSAPIURL: srv.URL, SMSAPIKey: "key", SMSSenderID: "sender"}}
	res, err := d.Send("+8801740999768", "hello")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Success || res.StatusCode != "202" {
		t.Errorf("got %+v, want success with code 202", res)
	}
}

func TestBulkSMSBDDriver_Failure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(bulkSMSBDResponse{ResponseCode: 1007, ErrorMessage: "Balance Insufficient"})
	}))
	defer srv.Close()

	d := &bulkSMSBDDriver{cfg: config.Config{SMSAPIURL: srv.URL}}
	res, err := d.Send("+8801689252523", "hello")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Success || res.StatusCode != "1007" || res.ErrorMessage != "Balance Insufficient" {
		t.Errorf("got %+v, want failure code 1007 with balance-insufficient message", res)
	}
}

// withTwilioMock points twilioAPIBase at an httptest mock for the duration of fn, restoring it
// afterward — lets tests exercise the real twilioDriver.Send code path (not a reimplementation)
// without hitting the real api.twilio.com.
func withTwilioMock(t *testing.T, handler http.HandlerFunc, fn func(srv *httptest.Server)) {
	t.Helper()
	srv := httptest.NewServer(handler)
	defer srv.Close()
	original := twilioAPIBase
	twilioAPIBase = srv.URL
	defer func() { twilioAPIBase = original }()
	fn(srv)
}

func TestTwilioDriver_Success(t *testing.T) {
	withTwilioMock(t, func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.FormValue("To") != "+8801740999768" {
			t.Errorf("twilio must keep '+' prefix, got %q", r.FormValue("To"))
		}
		user, pass, ok := r.BasicAuth()
		if !ok || user != "AC_test" || pass != "token_test" {
			t.Errorf("missing/incorrect basic auth: %q %q", user, pass)
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(twilioMessageResponse{SID: "SM123", Status: "queued"})
	}, func(srv *httptest.Server) {
		d := &twilioDriver{cfg: config.Config{TwilioAccountSID: "AC_test", TwilioAuthToken: "token_test", TwilioFromNumber: "+15550000000"}}
		res, err := d.Send("+8801740999768", "hello")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !res.Success || res.StatusCode != "queued" {
			t.Errorf("got %+v, want success with status queued", res)
		}
	})
}

func TestTwilioDriver_Failure(t *testing.T) {
	// Twilio's immediate-rejection error envelope (e.g. malformed "To") uses top-level "code"/
	// "message" fields — a different shape from the Message resource's "error_code" (which only
	// applies to a message that was accepted then failed asynchronously, not tested here).
	withTwilioMock(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		code := 21211
		_ = json.NewEncoder(w).Encode(twilioMessageResponse{Code: &code, Message: "Invalid 'To' Phone Number"})
	}, func(srv *httptest.Server) {
		d := &twilioDriver{cfg: config.Config{TwilioAccountSID: "AC_test", TwilioAuthToken: "token_test", TwilioFromNumber: "+15550000000"}}
		res, err := d.Send("+8801740999768", "hello")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Success || res.StatusCode != "21211" || res.ErrorMessage != "Invalid 'To' Phone Number" {
			t.Errorf("got %+v, want failure code 21211", res)
		}
	})
}
