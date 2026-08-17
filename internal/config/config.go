package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port               string
	DBPath             string
	SessionSecret      string
	StorageDriver      string // local | s3
	LocalPath          string
	S3Bucket           string
	S3Region           string
	S3Endpoint         string
	S3AccessKey        string
	S3SecretKey        string
	S3PublicURL        string
	S3BackupBucket     string // separate bucket (or same one, different prefix) for cmd/backup-sync
	SMTPHost           string
	SMTPPort           int
	SMTPUser           string
	SMTPPass           string
	SMTPFrom           string
	SMTPFromName       string
	PublicBaseURL      string
	AppEnv             string
	SuperAdminEmail    string
	SuperAdminPassword string
	Timezone           string

	OutreachEmailEnable bool
	OutreachSMSEnable   bool
	EmailCostPerUnit    float64
	EmailCostCurrency   string
	SMSCostPerUnit      float64
	SMSCostCurrency     string

	SMSDriver string // "twilio" | "bulksmsbd"

	SMSAPIURL   string // bulksmsbd
	SMSAPIKey   string
	SMSSenderID string

	TwilioAccountSID string
	TwilioAuthToken  string
	TwilioFromNumber string
}

func Load() Config {
	// Loads a .env file from the current working directory into the process environment, if
	// one exists — this is what makes `go run ./cmd/server` (or any built binary run manually)
	// pick up a hand-edited .env file at all. godotenv.Load never overrides a variable already
	// set in the real environment (e.g. by systemd's EnvironmentFile= or a shell export), so
	// production deployments that don't ship a .env file are unaffected. Its only error is
	// "file not found", which is expected and fine in that case — deliberately ignored.
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		log.Printf("config: found .env but failed to parse it: %v", err)
	}

	cfg := Config{
		Port:               getEnv("PORT", "8080"),
		DBPath:             getEnv("DB_PATH", "./data/data.db"),
		SessionSecret:      getEnv("SESSION_SECRET", "dev-insecure-secret-change-me"),
		StorageDriver:      getEnv("STORAGE_DRIVER", "local"),
		LocalPath:          getEnv("STORAGE_LOCAL_PATH", "./data/uploads"),
		S3Bucket:           getEnv("S3_BUCKET", ""),
		S3Region:           getEnv("S3_REGION", ""),
		S3Endpoint:         getEnv("S3_ENDPOINT", ""),
		S3AccessKey:        getEnv("S3_ACCESS_KEY", ""),
		S3SecretKey:        getEnv("S3_SECRET_KEY", ""),
		S3PublicURL:        getEnv("S3_PUBLIC_URL", ""),
		S3BackupBucket:     getEnv("S3_BACKUP_BUCKET", ""),
		SMTPHost:           getEnv("SMTP_HOST", ""),
		SMTPPort:           getEnvInt("SMTP_PORT", 587),
		SMTPUser:           getEnv("SMTP_USER", ""),
		SMTPPass:           getEnv("SMTP_PASS", ""),
		SMTPFrom:           getEnv("SMTP_FROM", "no-reply@example.edu"),
		SMTPFromName:       getEnv("SMTP_FROM_NAME", "Alumni Portal"),
		PublicBaseURL:      getEnv("PUBLIC_BASE_URL", "http://localhost:8080"),
		AppEnv:             getEnv("APP_ENV", "development"),
		SuperAdminEmail:    getEnv("SUPERADMIN_EMAIL", ""),
		SuperAdminPassword: getEnv("SUPERADMIN_PASSWORD", ""),
		Timezone:           getEnv("TIMEZONE", "Asia/Dhaka"),

		OutreachEmailEnable: getEnvBool("OUTREACH_EMAIL_ENABLE", false),
		OutreachSMSEnable:   getEnvBool("OUTREACH_SMS_ENABLE", false),
		EmailCostPerUnit:    getEnvFloat("EMAIL_COST_PER_UNIT", 1),
		EmailCostCurrency:   getEnv("EMAIL_COST_CURRENCY", "BDT"),
		SMSCostPerUnit:      getEnvFloat("SMS_COST_PER_UNIT", 0.5),
		SMSCostCurrency:     getEnv("SMS_COST_CURRENCY", "BDT"),

		SMSDriver: getEnv("SMS_DRIVER", "twilio"),

		SMSAPIURL:   getEnv("SMS_API_URL", "http://bulksmsbd.net/api/smsapi"),
		SMSAPIKey:   getEnv("SMS_API_KEY", ""),
		SMSSenderID: getEnv("SMS_SENDER_ID", ""),

		TwilioAccountSID: getEnv("TWILIO_ACCOUNT_SID", ""),
		TwilioAuthToken:  getEnv("TWILIO_AUTH_TOKEN", ""),
		TwilioFromNumber: getEnv("TWILIO_FROM_NUMBER", ""),
	}

	// Visible-at-a-glance confirmation of what the mailer will actually do — the single most
	// common support question ("I set SMTP creds but got no email") is answerable just by
	// reading this one line instead of guessing whether the env vars were ever picked up.
	if cfg.SMTPHost == "" {
		log.Printf("config: SMTP_HOST not set — emails will be logged, not sent (dev-noop mode)")
	} else {
		log.Printf("config: SMTP configured host=%s port=%d user=%q from=%s (%s)",
			cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPFrom, cfg.SMTPFromName)
	}

	return cfg
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return def
}

func getEnvFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}

func getEnvBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return def
}
