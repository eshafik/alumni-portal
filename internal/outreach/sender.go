package outreach

import (
	"log"
	"time"

	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/config"
	"alumni-portal/internal/mailer"
	"alumni-portal/internal/smsgateway"
)

const (
	maxAttempts = 3
	batchSize   = 20
)

type Sender struct {
	cfg config.Config
	sms smsgateway.Driver
}

func NewSender(cfg config.Config) *Sender {
	return &Sender{cfg: cfg, sms: smsgateway.New(cfg)}
}

// Run polls outreach_recipients every interval and sends pending rows. Mirrors
// internal/mailer.Sender.Run exactly (same ticker/batch-size shape) — intended as a single
// background goroutine, isolated from the OTP mailer so a problem here can never affect login.
func (s *Sender) Run(db *sqlx.DB, interval time.Duration, stop <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			s.processBatch(db)
		}
	}
}

type pendingRow struct {
	ID         int64  `db:"id"`
	CampaignID int64  `db:"campaign_id"`
	Channel    string `db:"channel"`
	Subject    string `db:"subject"`
	Message    string `db:"message"`
	Email      string `db:"recipient_email"`
	Phone      string `db:"recipient_phone"`
	Attempts   int    `db:"attempts"`
}

func (s *Sender) processBatch(db *sqlx.DB) {
	var rows []pendingRow
	err := db.Select(&rows, `SELECT r.id, r.campaign_id, c.channel, c.subject, c.message,
			r.recipient_email, r.recipient_phone, r.attempts
		FROM outreach_recipients r
		JOIN outreach_campaigns c ON c.id = r.campaign_id
		WHERE r.status = 'pending' AND r.attempts < ?
		ORDER BY r.campaign_id, r.id LIMIT ?`, maxAttempts, batchSize)
	if err != nil {
		log.Printf("outreach: poll failed: %v", err)
		return
	}

	touchedCampaigns := map[int64]bool{}
	for _, row := range rows {
		touchedCampaigns[row.CampaignID] = true

		var success bool
		var statusCode, errMsg string
		if row.Channel == "email" {
			if err := mailer.SendEmail(s.cfg, row.Email, row.Subject, row.Message); err != nil {
				errMsg = err.Error()
			} else {
				success = true
				statusCode = "sent"
			}
		} else {
			result, err := s.sms.Send(row.Phone, row.Message)
			if err != nil {
				errMsg = err.Error()
			} else {
				success = result.Success
				statusCode = result.StatusCode
				errMsg = result.ErrorMessage
			}
		}

		if success {
			_, _ = db.Exec(`UPDATE outreach_recipients SET status = 'sent', status_code = ?, error_message = '', sent_at = datetime('now'), attempts = attempts + 1 WHERE id = ?`,
				statusCode, row.ID)
			continue
		}

		attempts := row.Attempts + 1
		newStatus := "pending"
		if attempts >= maxAttempts {
			newStatus = "failed"
		}
		_, _ = db.Exec(`UPDATE outreach_recipients SET status = ?, status_code = ?, error_message = ?, attempts = ? WHERE id = ?`,
			newStatus, statusCode, errMsg, attempts, row.ID)
		if attempts >= maxAttempts {
			log.Printf("outreach: recipient id=%d campaign=%d giving up after %d attempts: %s", row.ID, row.CampaignID, attempts, errMsg)
		}
	}

	for campaignID := range touchedCampaigns {
		s.maybeCompleteCampaign(db, campaignID)
	}
}

// maybeCompleteCampaign flips a campaign to completed/completed_with_errors once it has no more
// pending recipients, recomputing success/failed counts from the recipients table itself (the
// source of truth) rather than incrementally tracking counters that could drift.
func (s *Sender) maybeCompleteCampaign(db *sqlx.DB, campaignID int64) {
	var pending int
	if err := db.Get(&pending, `SELECT COUNT(*) FROM outreach_recipients WHERE campaign_id = ? AND status = 'pending'`, campaignID); err != nil || pending > 0 {
		return
	}

	var successCount, failedCount int
	_ = db.Get(&successCount, `SELECT COUNT(*) FROM outreach_recipients WHERE campaign_id = ? AND status = 'sent'`, campaignID)
	_ = db.Get(&failedCount, `SELECT COUNT(*) FROM outreach_recipients WHERE campaign_id = ? AND status = 'failed'`, campaignID)

	status := "completed"
	if failedCount > 0 {
		status = "completed_with_errors"
	}
	_, _ = db.Exec(`UPDATE outreach_campaigns SET status = ?, success_count = ?, failed_count = ?, completed_at = datetime('now') WHERE id = ? AND status IN ('queued', 'processing')`,
		status, successCount, failedCount, campaignID)
}
