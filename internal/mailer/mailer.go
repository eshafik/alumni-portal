package mailer

import (
	"crypto/tls"
	"fmt"
	"log"
	"mime"
	"net/smtp"
	"time"

	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/config"
)

// Enqueue writes an email into the outbox table for the background sender to pick up.
// Callers should not depend on delivery timing — this is fire-and-forget from the request's
// point of view, keeping OTP/notification requests fast and independent of SMTP latency.
func Enqueue(db *sqlx.DB, toEmail, subject, bodyHTML string) {
	res, err := db.Exec(
		`INSERT INTO email_outbox (to_email, subject, body_html) VALUES (?, ?, ?)`,
		toEmail, subject, bodyHTML,
	)
	if err != nil {
		log.Printf("mailer: FAILED to enqueue email to=%s subject=%q error=%v", toEmail, subject, err)
		return
	}
	id, _ := res.LastInsertId()
	log.Printf("mailer: enqueued id=%d to=%s subject=%q (picked up by background sender within a few seconds)", id, toEmail, subject)
}

type Sender struct {
	cfg config.Config
}

func NewSender(cfg config.Config) *Sender {
	return &Sender{cfg: cfg}
}

// Run polls email_outbox every interval and sends pending messages via SMTP.
// Intended to run as a single background goroutine (started once from main).
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

func (s *Sender) processBatch(db *sqlx.DB) {
	type row struct {
		ID       int64  `db:"id"`
		ToEmail  string `db:"to_email"`
		Subject  string `db:"subject"`
		BodyHTML string `db:"body_html"`
		Attempts int    `db:"attempts"`
	}
	var rows []row
	if err := db.Select(&rows, `SELECT id, to_email, subject, body_html, attempts FROM email_outbox
		WHERE status = 'pending' AND attempts < 5 ORDER BY id LIMIT 20`); err != nil {
		log.Printf("mailer: poll failed: %v", err)
		return
	}
	for _, m := range rows {
		if s.cfg.SMTPHost == "" {
			// No SMTP configured (e.g. local dev) — log and mark sent so the queue doesn't jam.
			log.Printf("mailer: [dev-noop, SMTP_HOST not set] to=%s subject=%q body=%s", m.ToEmail, m.Subject, m.BodyHTML)
			_, _ = db.Exec(`UPDATE email_outbox SET status = 'sent', sent_at = datetime('now') WHERE id = ?`, m.ID)
			continue
		}
		if err := s.send(m.ToEmail, m.Subject, m.BodyHTML); err != nil {
			log.Printf("mailer: SEND FAILED id=%d to=%s subject=%q attempt=%d error=%v", m.ID, m.ToEmail, m.Subject, m.Attempts+1, err)
			_, _ = db.Exec(`UPDATE email_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?`, err.Error(), m.ID)
			if m.Attempts+1 >= 5 {
				log.Printf("mailer: giving up on id=%d to=%s after %d attempts", m.ID, m.ToEmail, m.Attempts+1)
				_, _ = db.Exec(`UPDATE email_outbox SET status = 'failed' WHERE id = ?`, m.ID)
			}
			continue
		}
		log.Printf("mailer: sent id=%d to=%s subject=%q via=%s:%d", m.ID, m.ToEmail, m.Subject, s.cfg.SMTPHost, s.cfg.SMTPPort)
		_, _ = db.Exec(`UPDATE email_outbox SET status = 'sent', sent_at = datetime('now') WHERE id = ?`, m.ID)
	}
}

func (s *Sender) send(to, subject, bodyHTML string) error {
	return SendEmail(s.cfg, to, subject, bodyHTML)
}

// SendEmail sends one HTML email via SMTP using cfg's settings. Exported so other packages
// (e.g. internal/outreach) can send email without duplicating the SMTP-dial logic below —
// Sender.send is just a thin wrapper kept for backward compatibility with existing call sites.
func SendEmail(cfg config.Config, to, subject, bodyHTML string) error {
	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort)
	var auth smtp.Auth
	if cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
	}
	from := cfg.SMTPFrom
	if cfg.SMTPFromName != "" {
		from = fmt.Sprintf("%s <%s>", mime.QEncoding.Encode("UTF-8", cfg.SMTPFromName), cfg.SMTPFrom)
	}
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		from, to, subject, bodyHTML)

	// Port 465 is "implicit TLS" (SMTPS) — the connection must be TLS-encrypted from the very
	// first byte, which net/smtp.SendMail cannot do (it only ever negotiates STARTTLS *after*
	// an initial plaintext handshake, which is correct for 587/25 but hangs/fails against 465).
	// This is one of the most common real-world SMTP misconfigurations (many providers'
	// dashboards list 465 first), so it's handled explicitly rather than left to silently fail.
	if cfg.SMTPPort == 465 {
		return sendImplicitTLS(addr, cfg.SMTPHost, auth, cfg.SMTPFrom, to, []byte(msg))
	}
	return smtp.SendMail(addr, auth, cfg.SMTPFrom, []string{to}, []byte(msg))
}

func sendImplicitTLS(addr, host string, auth smtp.Auth, envelopeFrom, to string, msg []byte) error {
	conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: host})
	if err != nil {
		return fmt.Errorf("tls dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := client.Mail(envelopeFrom); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("rcpt to: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("write body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("close body: %w", err)
	}
	return client.Quit()
}
