package handlers

import (
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/mailer"
	"alumni-portal/internal/models"
)

// otpCooldownSeconds rounds a cooldown duration up to whole seconds for the JSON response —
// the client-side countdown UI uses this to stay in sync with the server's actual rate limit
// (e.g. across a page reload mid-cooldown) instead of assuming a fixed duration.
func otpCooldownSeconds(d time.Duration) int {
	secs := int(d.Round(time.Second) / time.Second)
	if secs < 0 {
		return 0
	}
	return secs
}

type AuthHandler struct {
	DB     *sqlx.DB
	Secure bool // cookie Secure flag; true in production
}

type signupRequest struct {
	FullName           string `json:"fullName"`
	Email              string `json:"email"`
	Phone              string `json:"phone"`
	Password           string `json:"password"`
	DepartmentID       int64  `json:"departmentId"`
	ProgramID          int64  `json:"programId"`
	BatchID            int64  `json:"batchId"`
	BloodGroupID       int64  `json:"bloodGroupId"`
	AccountType        string `json:"accountType"`        // "alumni" | "student"
	CurrentDesignation string `json:"currentDesignation"` // alumni only, optional
	CompanyName        string `json:"companyName"`        // alumni only, optional
}

// Signup creates a pending_verification user + profile row and emails an OTP.
// Deliberately returns the same generic response whether the email is new or already
// pending, to avoid leaking account existence (spec section 13).
func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.FullName == "" || req.Email == "" || req.Phone == "" || len(req.Password) < 8 {
		httpx.Error(w, http.StatusBadRequest, "full name, email, phone, and an 8+ character password are required")
		return
	}
	if req.AccountType != "alumni" && req.AccountType != "student" {
		httpx.Error(w, http.StatusBadRequest, "accountType must be 'alumni' or 'student'")
		return
	}
	if req.BloodGroupID == 0 {
		httpx.Error(w, http.StatusBadRequest, "blood group is required")
		return
	}

	var institutionID int64
	if err := h.DB.Get(&institutionID, `SELECT id FROM institutions LIMIT 1`); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "institution not configured")
		return
	}

	var existing models.User
	err := h.DB.Get(&existing, `SELECT * FROM users WHERE institution_id = ? AND (email = ? OR phone = ?)`, institutionID, req.Email, req.Phone)
	if err == nil {
		switch existing.Status {
		case models.StatusRejected, models.StatusSuspended:
			// Do not reveal reason; generic message, no new account created.
			httpx.JSON(w, http.StatusOK, map[string]any{"message": "If eligible, a verification code has been sent.", "cooldownSeconds": auth.OTPResendCooldownSeconds})
			return
		case models.StatusPendingVerification:
			cooldown := h.sendOTP(req.Email)
			httpx.JSON(w, http.StatusOK, map[string]any{"message": "Verification code re-sent to your email.", "cooldownSeconds": cooldown})
			return
		default:
			httpx.JSON(w, http.StatusOK, map[string]any{"message": "If eligible, a verification code has been sent.", "cooldownSeconds": auth.OTPResendCooldownSeconds})
			return
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusInternalServerError, "signup failed")
		return
	}

	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "signup failed")
		return
	}

	roleID := models.RoleAlumni
	if req.AccountType == "student" {
		roleID = models.RoleStudent
	}

	tx, err := h.DB.Beginx()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "signup failed")
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(
		`INSERT INTO users (institution_id, role_id, full_name, email, phone, password_hash, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		institutionID, roleID, req.FullName, req.Email, req.Phone, passwordHash, models.StatusPendingVerification,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "signup failed")
		return
	}
	userID, _ := res.LastInsertId()

	var alumniProfileID int64
	if req.AccountType == "student" {
		_, err = tx.Exec(
			`INSERT INTO student_profiles (user_id, program_id, batch_id, blood_group_id) VALUES (?, ?, ?, ?)`,
			userID, req.ProgramID, req.BatchID, req.BloodGroupID,
		)
	} else {
		var res2 sql.Result
		res2, err = tx.Exec(
			`INSERT INTO alumni_profiles (user_id, program_id, batch_id, blood_group_id, current_designation) VALUES (?, ?, ?, ?, ?)`,
			userID, req.ProgramID, req.BatchID, req.BloodGroupID, req.CurrentDesignation,
		)
		if err == nil {
			alumniProfileID, _ = res2.LastInsertId()
		}
	}
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid department/program/batch/blood group")
		return
	}

	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "signup failed")
		return
	}

	if req.AccountType == "alumni" && req.CompanyName != "" {
		_ = upsertCurrentEmployment(h.DB, alumniProfileID, req.CurrentDesignation, req.CompanyName)
	}

	cooldown := h.sendOTP(req.Email)
	httpx.JSON(w, http.StatusCreated, map[string]any{"message": "Account created. Check your email for a verification code.", "cooldownSeconds": cooldown})
}

// sendOTP creates+enqueues a verification code and returns the cooldown (in seconds) before
// the next resend is allowed. The cooldown is always safe to return to the client — unlike an
// error message, it doesn't reveal whether the account exists, only OTP subsystem timing.
func (h *AuthHandler) sendOTP(email string) int {
	code, cooldown, err := auth.CreateOTP(h.DB, email, "verify")
	if err != nil {
		// Not surfaced as an error (avoids leaking account existence), but logged — this is the
		// most common reason a user reports "never got the OTP": a double-submitted signup/
		// resend hitting the cooldown and silently producing no email.
		log.Printf("auth: OTP not generated for %s: %v", email, err)
		return otpCooldownSeconds(cooldown)
	}
	log.Printf("auth: OTP generated for %s, enqueuing email", email)
	mailer.Enqueue(h.DB, email, "Your verification code",
		"<p>Your verification code is <strong>"+code+"</strong>. It expires in 10 minutes.</p>")
	return otpCooldownSeconds(cooldown)
}

type otpRequest struct {
	Email string `json:"email"`
}

func (h *AuthHandler) ResendOTP(w http.ResponseWriter, r *http.Request) {
	var req otpRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	cooldown := h.sendOTP(strings.ToLower(strings.TrimSpace(req.Email)))
	httpx.JSON(w, http.StatusOK, map[string]any{"message": "If eligible, a new code has been sent.", "cooldownSeconds": cooldown})
}

type verifyOTPRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func (h *AuthHandler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req verifyOTPRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if err := auth.VerifyOTP(h.DB, email, "verify", req.Code); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	_, err := h.DB.Exec(
		`UPDATE users SET status = ?, updated_at = datetime('now') WHERE email = ? AND status = ?`,
		models.StatusPendingApproval, email, models.StatusPendingVerification,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "verification failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "Email verified. Your account is now pending approval."})
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	var u models.User
	if err := h.DB.Get(&u, `SELECT * FROM users WHERE email = ?`, email); err != nil {
		httpx.Error(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if !auth.VerifyPassword(u.PasswordHash, req.Password) {
		httpx.Error(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	switch u.Status {
	case models.StatusPendingVerification:
		httpx.Error(w, http.StatusForbidden, "please verify your email first")
		return
	case models.StatusPendingApproval:
		httpx.Error(w, http.StatusForbidden, "your account is pending approval")
		return
	case models.StatusRejected:
		httpx.Error(w, http.StatusForbidden, "your registration was not approved")
		return
	case models.StatusSuspended:
		httpx.Error(w, http.StatusForbidden, "your account is suspended")
		return
	}

	if err := auth.CreateSession(w, h.DB, u.ID, r.UserAgent(), h.Secure); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "login failed")
		return
	}
	_, _ = h.DB.Exec(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`, u.ID)
	httpx.JSON(w, http.StatusOK, u)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	auth.ClearSession(w, h.DB, r)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

type meResponse struct {
	models.User
	// HasAvatar drives the mandatory profile-setup redirect for alumni/students — false for
	// roles with no profile row at all (Admin/SuperAdmin/Moderator), which never gates.
	HasAvatar bool `json:"hasAvatar"`
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	u := auth.CurrentUser(r)
	if u == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}
	resp := meResponse{User: *u}
	switch u.RoleID {
	case models.RoleAlumni:
		_ = h.DB.Get(&resp.HasAvatar, `SELECT avatar_attachment_id IS NOT NULL FROM alumni_profiles WHERE user_id = ?`, u.ID)
	case models.RoleStudent:
		_ = h.DB.Get(&resp.HasAvatar, `SELECT avatar_attachment_id IS NOT NULL FROM student_profiles WHERE user_id = ?`, u.ID)
	default:
		resp.HasAvatar = true // gate never applies to Admin/SuperAdmin/Moderator
	}
	httpx.JSON(w, http.StatusOK, resp)
}

type forgotPasswordRequest struct {
	Email string `json:"email"`
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req forgotPasswordRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	code, cooldown, err := auth.CreateOTP(h.DB, email, "password_reset")
	if err != nil {
		log.Printf("auth: password reset OTP not generated for %s: %v", email, err)
	} else {
		log.Printf("auth: password reset OTP generated for %s, enqueuing email", email)
		mailer.Enqueue(h.DB, email, "Password reset code",
			"<p>Your password reset code is <strong>"+code+"</strong>. It expires in 10 minutes.</p>")
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"message": "If that email exists, a reset code has been sent.", "cooldownSeconds": otpCooldownSeconds(cooldown)})
}

type resetPasswordRequest struct {
	Email       string `json:"email"`
	Code        string `json:"code"`
	NewPassword string `json:"newPassword"`
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetPasswordRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if len(req.NewPassword) < 8 {
		httpx.Error(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	if err := auth.VerifyOTP(h.DB, email, "password_reset", req.Code); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "reset failed")
		return
	}
	if _, err := h.DB.Exec(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE email = ?`, hash, email); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "reset failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "Password updated. You can now log in."})
}
