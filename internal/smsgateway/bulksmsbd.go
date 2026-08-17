package smsgateway

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"alumni-portal/internal/config"
)

// bulkSMSBDCodeMeanings documents every response_code bulksmsbd.net's API can return, so a
// failed send's status_code is human-decodable straight from the outreach log without needing
// to go re-read their docs. Only 202 means success; everything else is some form of failure.
var bulkSMSBDCodeMeanings = map[int]string{
	202:  "SMS Submitted Successfully",
	1001: "Invalid Number",
	1002: "Sender ID incorrect or disabled",
	1003: "Required field(s) missing",
	1005: "Internal Error",
	1006: "Balance Validity Not Available",
	1007: "Balance Insufficient",
	1011: "User ID not found",
	1012: "Masking SMS must be sent in Bengali",
	1013: "Sender ID not found for gateway by this API key",
	1014: "Sender type name not found for this sender by API key",
	1015: "Sender ID has no valid gateway for this API key",
	1016: "Sender type active price info not found for this sender ID",
	1017: "Sender type price info not found for this sender ID",
	1018: "The owner of this account is disabled",
	1019: "The sender type price of this account is disabled",
	1020: "The parent of this account was not found",
	1021: "The parent's active sender type price was not found",
	1031: "Account not verified — contact administrator",
	1032: "IP not whitelisted",
}

type bulkSMSBDDriver struct {
	cfg config.Config
}

type bulkSMSBDRequest struct {
	APIKey   string `json:"api_key"`
	SenderID string `json:"senderid"`
	Number   string `json:"number"`
	Message  string `json:"message"`
}

type bulkSMSBDResponse struct {
	ResponseCode int    `json:"response_code"`
	MessageID    int64  `json:"message_id"`
	SuccessMsg   string `json:"success_message"`
	ErrorMessage string `json:"error_message"`
}

// Send POSTs one number per call — bulksmsbd's "number" field does accept a comma-joined list
// to message many recipients at once, but that returns a single response_code for the whole
// batch, which would make true per-recipient success/failure logging impossible. One call per
// recipient is what makes the outreach log's per-row status accurate.
func (d *bulkSMSBDDriver) Send(phone, message string) (Result, error) {
	number := strings.TrimPrefix(phone, "+")

	body, err := json.Marshal(bulkSMSBDRequest{
		APIKey:   d.cfg.SMSAPIKey,
		SenderID: d.cfg.SMSSenderID,
		Number:   number,
		Message:  message,
	})
	if err != nil {
		return Result{}, fmt.Errorf("marshal request: %w", err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(d.cfg.SMSAPIURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return Result{}, fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	var parsed bulkSMSBDResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return Result{}, fmt.Errorf("decode response: %w", err)
	}

	if parsed.ResponseCode == 202 {
		return Result{Success: true, StatusCode: strconv.Itoa(parsed.ResponseCode)}, nil
	}

	errMsg := parsed.ErrorMessage
	if errMsg == "" {
		errMsg = parsed.SuccessMsg
	}
	if meaning, ok := bulkSMSBDCodeMeanings[parsed.ResponseCode]; ok && errMsg == "" {
		errMsg = meaning
	}
	return Result{Success: false, StatusCode: strconv.Itoa(parsed.ResponseCode), ErrorMessage: errMsg}, nil
}
