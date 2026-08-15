package handlers

import (
	"database/sql"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/audit"
	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/mailer"
	"alumni-portal/internal/models"
)

type AdminHandler struct {
	DB *sqlx.DB
}

// --- User management ---

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	roleID := r.URL.Query().Get("roleId")
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	pg := httpx.ParsePagination(r)

	where := "WHERE 1=1"
	args := []any{}
	if status != "" {
		where += " AND status = ?"
		args = append(args, status)
	}
	if roleID != "" {
		where += " AND role_id = ?"
		args = append(args, roleID)
	}
	if search != "" {
		where += " AND (full_name LIKE ? OR email LIKE ?)"
		like := "%" + search + "%"
		args = append(args, like, like)
	}

	var total int
	_ = h.DB.Get(&total, "SELECT COUNT(*) FROM users "+where, args...)

	users := []models.User{}
	q := "SELECT * FROM users " + where + " ORDER BY created_at DESC LIMIT ? OFFSET ?"
	args = append(args, pg.PageSize, pg.Offset)
	if err := h.DB.Select(&users, q, args...); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: users, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

type updateRoleRequest struct {
	RoleID                     int64  `json:"roleId"`
	ModeratorScopeDepartmentID *int64 `json:"moderatorScopeDepartmentId"`
	ModeratorScopeBatchID      *int64 `json:"moderatorScopeBatchId"`
}

// UpdateUserRole is SuperAdmin/Admin only (enforced by router group). Prevents removing the
// last remaining Admin/SuperAdmin so the institution can never end up with zero administrators.
func (h *AdminHandler) UpdateUserRole(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	targetID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req updateRoleRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RoleID == models.RoleSuperAdmin && actor.RoleID != models.RoleSuperAdmin {
		httpx.Error(w, http.StatusForbidden, "only a SuperAdmin can grant SuperAdmin access")
		return
	}

	var before models.User
	if err := h.DB.Get(&before, `SELECT * FROM users WHERE id = ?`, targetID); err != nil {
		httpx.Error(w, http.StatusNotFound, "user not found")
		return
	}
	if (before.RoleID == models.RoleAdmin || before.RoleID == models.RoleSuperAdmin) && req.RoleID != before.RoleID {
		var adminCount int
		_ = h.DB.Get(&adminCount, `SELECT COUNT(*) FROM users WHERE role_id IN (?, ?) AND status = 'approved'`, models.RoleAdmin, models.RoleSuperAdmin)
		if adminCount <= 1 {
			httpx.Error(w, http.StatusConflict, "cannot remove the last remaining administrator")
			return
		}
	}

	// Scope only ever applies to Moderator — switching a user to any other role always clears
	// it, so a former moderator's old scope can't linger and silently narrow a later Admin grant.
	deptScope, batchScope := req.ModeratorScopeDepartmentID, req.ModeratorScopeBatchID
	if req.RoleID != models.RoleModerator {
		deptScope, batchScope = nil, nil
	}

	if _, err := h.DB.Exec(`UPDATE users SET role_id = ?, moderator_scope_department_id = ?, moderator_scope_batch_id = ?, updated_at = datetime('now') WHERE id = ?`,
		req.RoleID, deptScope, batchScope, targetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "user.role_changed", "user", &targetID, before, req)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "role updated"})
}

type updateStatusRequest struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

func (h *AdminHandler) UpdateUserStatus(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	targetID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if targetID == actor.ID {
		httpx.Error(w, http.StatusForbidden, "cannot change your own status")
		return
	}
	var req updateStatusRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var before models.User
	if err := h.DB.Get(&before, `SELECT * FROM users WHERE id = ?`, targetID); err != nil {
		httpx.Error(w, http.StatusNotFound, "user not found")
		return
	}

	if _, err := h.DB.Exec(`UPDATE users SET status = ?, rejection_reason = ?, updated_at = datetime('now') WHERE id = ?`,
		req.Status, req.Reason, targetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}
	if req.Status == models.StatusSuspended || req.Status == models.StatusRejected {
		_, _ = h.DB.Exec(`DELETE FROM sessions WHERE user_id = ?`, targetID)
	}
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "user.status_changed", "user", &targetID, before, req)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "status updated"})
}

// --- Membership approval (Admin + Moderator, scoped) ---

type pendingRegistrationRow struct {
	UserID         int64  `db:"user_id" json:"userId"`
	FullName       string `db:"full_name" json:"fullName"`
	Email          string `db:"email" json:"email"`
	Phone          string `db:"phone" json:"phone"`
	RoleID         int64  `db:"role_id" json:"roleId"`
	Status         string `db:"status" json:"status"`
	BatchLabel     string `db:"batch_label" json:"batchLabel"`
	DepartmentName string `db:"department_name" json:"departmentName"`
	CreatedAt      string `db:"created_at" json:"createdAt"`
}

// listRegistrationsByStatus is shared by the Pending tab (unverified + pending_approval) and
// the Rejected tab — same shape, same moderator batch/department scoping, different status
// filter. The returned `status` field lets the UI badge "Unverified" vs "Pending Approval".
func (h *AdminHandler) listRegistrationsByStatus(w http.ResponseWriter, r *http.Request, statuses []string) {
	actor := auth.CurrentUser(r)
	pg := httpx.ParsePagination(r)

	placeholders := make([]string, len(statuses))
	args := []any{}
	for i, s := range statuses {
		placeholders[i] = "?"
		args = append(args, s)
	}
	where := "WHERE u.status IN (" + strings.Join(placeholders, ",") + ") AND u.institution_id = ?"
	args = append(args, actor.InstitutionID)

	if actor.RoleID == models.RoleModerator {
		if actor.ModeratorScopeBatchID != nil {
			where += " AND COALESCE(ap.batch_id, sp.batch_id) = ?"
			args = append(args, *actor.ModeratorScopeBatchID)
		}
		if actor.ModeratorScopeDepartmentID != nil {
			where += " AND COALESCE(pr_a.department_id, pr_s.department_id) = ?"
			args = append(args, *actor.ModeratorScopeDepartmentID)
		}
	}

	q := `SELECT u.id AS user_id, u.full_name, u.email, u.phone, u.role_id, u.status,
		COALESCE(b_a.label, b_s.label, '') AS batch_label,
		COALESCE(d_a.name, d_s.name, '') AS department_name,
		u.created_at
		FROM users u
		LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
		LEFT JOIN batches b_a ON b_a.id = ap.batch_id
		LEFT JOIN programs pr_a ON pr_a.id = ap.program_id
		LEFT JOIN departments d_a ON d_a.id = pr_a.department_id
		LEFT JOIN student_profiles sp ON sp.user_id = u.id
		LEFT JOIN batches b_s ON b_s.id = sp.batch_id
		LEFT JOIN programs pr_s ON pr_s.id = sp.program_id
		LEFT JOIN departments d_s ON d_s.id = pr_s.department_id
		` + where + ` ORDER BY u.created_at LIMIT ? OFFSET ?`

	var total int
	countQ := `SELECT COUNT(*) FROM users u
		LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
		LEFT JOIN programs pr_a ON pr_a.id = ap.program_id
		LEFT JOIN student_profiles sp ON sp.user_id = u.id
		LEFT JOIN programs pr_s ON pr_s.id = sp.program_id
		` + where
	_ = h.DB.Get(&total, countQ, args...)

	args = append(args, pg.PageSize, pg.Offset)
	rows := []pendingRegistrationRow{}
	if err := h.DB.Select(&rows, q, args...); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: rows, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

// ListPendingRegistrations includes accounts that never completed OTP verification
// (pending_verification) alongside those awaiting approval (pending_approval) — moderators/
// admins can act on either from one list.
func (h *AdminHandler) ListPendingRegistrations(w http.ResponseWriter, r *http.Request) {
	h.listRegistrationsByStatus(w, r, []string{models.StatusPendingVerification, models.StatusPendingApproval})
}

// ListRejectedRegistrations lets staff reconsider a rejection — accounts here can still be
// approved via the same ApproveRegistration endpoint.
func (h *AdminHandler) ListRejectedRegistrations(w http.ResponseWriter, r *http.Request) {
	h.listRegistrationsByStatus(w, r, []string{models.StatusRejected})
}

func (h *AdminHandler) ApproveRegistration(w http.ResponseWriter, r *http.Request) {
	h.decideRegistration(w, r, models.StatusApproved)
}

func (h *AdminHandler) RejectRegistration(w http.ResponseWriter, r *http.Request) {
	h.decideRegistration(w, r, models.StatusRejected)
}

// decideRegistration is an intentional staff-override path: approving works from
// pending_verification, pending_approval, or rejected (no forced re-verification); rejecting
// works from pending_verification or pending_approval. Anything else is a 409 — e.g. you can't
// "reject" an already-approved or already-suspended account through this endpoint.
func (h *AdminHandler) decideRegistration(w http.ResponseWriter, r *http.Request, newStatus string) {
	actor := auth.CurrentUser(r)
	targetID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var reason string
	if newStatus == models.StatusRejected {
		var body struct {
			Reason string `json:"reason"`
		}
		_ = httpx.DecodeJSON(r, &body)
		reason = body.Reason
	}

	var target models.User
	if err := h.DB.Get(&target, `SELECT * FROM users WHERE id = ?`, targetID); err != nil {
		httpx.Error(w, http.StatusNotFound, "user not found")
		return
	}

	allowedFrom := map[string][]string{
		models.StatusApproved: {models.StatusPendingVerification, models.StatusPendingApproval, models.StatusRejected},
		models.StatusRejected: {models.StatusPendingVerification, models.StatusPendingApproval},
	}
	if !slices.Contains(allowedFrom[newStatus], target.Status) {
		httpx.Error(w, http.StatusConflict, "cannot transition from "+target.Status+" to "+newStatus)
		return
	}

	if _, err := h.DB.Exec(`UPDATE users SET status = ?, rejection_reason = ?, updated_at = datetime('now') WHERE id = ?`,
		newStatus, reason, targetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update failed")
		return
	}

	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "registration."+newStatus, "user", &targetID, target.Status, newStatus)

	if newStatus == models.StatusApproved {
		syncAlumniFTS(h.DB, targetID)
		syncStudentFTS(h.DB, targetID)
		mailer.Enqueue(h.DB, target.Email, "Your membership has been approved",
			"<p>Welcome! Your account has been approved. You can now log in.</p>")
	} else {
		mailer.Enqueue(h.DB, target.Email, "Update on your membership application",
			"<p>Your application was not approved at this time.</p>")
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"message": "registration " + newStatus})
}

// --- Batch conversion ---

// ConvertBatchToAlumni transitions every active student in a batch to alumni in one
// transaction: student_profiles.status -> converted, alumni_profiles row inserted (same
// user_id, no new account), users.role_id -> alumni. Full before/after snapshot recorded
// so the operation can be reverted.
func (h *AdminHandler) ConvertBatchToAlumni(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	batchID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	type studentRow struct {
		UserID    int64 `db:"user_id"`
		ProgramID int64 `db:"program_id"`
		BatchID   int64 `db:"batch_id"`
	}
	var students []studentRow
	if err := h.DB.Select(&students, `SELECT user_id, program_id, batch_id FROM student_profiles WHERE batch_id = ? AND status = 'active'`, batchID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "conversion failed")
		return
	}
	if len(students) == 0 {
		httpx.Error(w, http.StatusBadRequest, "no active students in this batch")
		return
	}

	tx, err := h.DB.Beginx()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "conversion failed")
		return
	}
	defer tx.Rollback()

	for _, s := range students {
		if _, err := tx.Exec(`UPDATE student_profiles SET status = 'converted', updated_at = datetime('now') WHERE user_id = ?`, s.UserID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "conversion failed")
			return
		}
		if _, err := tx.Exec(`INSERT INTO alumni_profiles (user_id, program_id, batch_id) VALUES (?, ?, ?)`, s.UserID, s.ProgramID, s.BatchID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "conversion failed")
			return
		}
		if _, err := tx.Exec(`UPDATE users SET role_id = ?, updated_at = datetime('now') WHERE id = ?`, models.RoleAlumni, s.UserID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "conversion failed")
			return
		}
	}

	convertedUserIDs := make([]int64, len(students))
	for i, s := range students {
		convertedUserIDs[i] = s.UserID
	}
	audit.Log(tx, actor.InstitutionID, &actor.ID, "batch.converted_to_alumni", "batch", &batchID,
		map[string]any{"studentCount": len(students)}, map[string]any{"convertedUserIds": convertedUserIDs})

	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "conversion failed")
		return
	}
	for _, s := range students {
		syncAlumniFTS(h.DB, s.UserID)
		_, _ = h.DB.Exec(`DELETE FROM students_fts WHERE rowid = ?`, s.UserID)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"message": "batch converted to alumni", "count": len(students)})
}

// RevertBatchConversion re-derives the reverse transaction from the most recent conversion
// audit log entry for this batch: alumni_profiles rows deleted, student_profiles reactivated,
// role reverted to student.
func (h *AdminHandler) RevertBatchConversion(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	batchID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	type alumniRow struct {
		UserID int64 `db:"user_id"`
	}
	var alumni []alumniRow
	if err := h.DB.Select(&alumni, `SELECT user_id FROM alumni_profiles WHERE batch_id = ?`, batchID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "revert failed")
		return
	}
	if len(alumni) == 0 {
		httpx.Error(w, http.StatusBadRequest, "no converted alumni found for this batch")
		return
	}

	tx, err := h.DB.Beginx()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "revert failed")
		return
	}
	defer tx.Rollback()

	for _, a := range alumni {
		var hasStudentProfile bool
		_ = tx.Get(&hasStudentProfile, `SELECT EXISTS(SELECT 1 FROM student_profiles WHERE user_id = ?)`, a.UserID)
		if !hasStudentProfile {
			continue // was created directly as alumni, not via conversion; skip
		}
		if _, err := tx.Exec(`DELETE FROM alumni_profiles WHERE user_id = ?`, a.UserID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "revert failed")
			return
		}
		if _, err := tx.Exec(`UPDATE student_profiles SET status = 'active', updated_at = datetime('now') WHERE user_id = ?`, a.UserID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "revert failed")
			return
		}
		if _, err := tx.Exec(`UPDATE users SET role_id = ?, updated_at = datetime('now') WHERE id = ?`, models.RoleStudent, a.UserID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "revert failed")
			return
		}
		_, _ = tx.Exec(`DELETE FROM alumni_fts WHERE rowid = ?`, a.UserID)
	}

	audit.Log(tx, actor.InstitutionID, &actor.ID, "batch.conversion_reverted", "batch", &batchID, nil, nil)

	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "revert failed")
		return
	}
	for _, a := range alumni {
		syncStudentFTS(h.DB, a.UserID)
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "batch conversion reverted"})
}

// --- Audit logs ---

type auditLogRow struct {
	models.AuditLog
	ActorName string `db:"actor_name" json:"actorName,omitempty"`
}

// ListAuditLogs returns every recorded admin action, most recent first — only mutation
// endpoints under the Admin/SuperAdmin route group ever call audit.Log, so this is inherently
// scoped to admin activity (institution settings, dropdown/taxonomy management, notices,
// events, committee, and user approve/reject/role/status changes) without needing an
// allowlist. Optional ?userId= narrows to one actor for a per-admin activity view.
func (h *AdminHandler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	pg := httpx.ParsePagination(r)
	userID := r.URL.Query().Get("userId")

	where := ""
	args := []any{}
	if userID != "" {
		where = "WHERE al.actor_user_id = ?"
		args = append(args, userID)
	}

	var total int
	_ = h.DB.Get(&total, "SELECT COUNT(*) FROM audit_logs al "+where, args...)

	logs := []auditLogRow{}
	q := `SELECT al.*, COALESCE(u.full_name, '') AS actor_name
		FROM audit_logs al
		LEFT JOIN users u ON u.id = al.actor_user_id
		` + where + ` ORDER BY al.created_at DESC LIMIT ? OFFSET ?`
	pagedArgs := append(append([]any{}, args...), pg.PageSize, pg.Offset)
	if err := h.DB.Select(&logs, q, pagedArgs...); err != nil && err != sql.ErrNoRows {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: logs, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}
