package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/audit"
	"alumni-portal/internal/auth"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/models"
	"alumni-portal/internal/storage"
)

type CommitteeHandler struct {
	DB      *sqlx.DB
	Storage storage.Driver
}

type positionWithMembers struct {
	models.CommitteePosition
	Members []memberInfo `json:"members" db:"-"`
}

// memberInfo is deliberately minimal — the spec restricts public committee display to
// name, photo, and position only. Never add other profile fields to this struct.
type memberInfo struct {
	UserID             int64  `db:"user_id" json:"userId"`
	FullName           string `db:"full_name" json:"fullName"`
	AvatarAttachmentID *int64 `db:"avatar_attachment_id" json:"avatarAttachmentId,omitempty"`
	AvatarURL          string `db:"-" json:"avatarUrl,omitempty"`
}

// List returns every committee term, most recent first, so the public committee page can offer
// a "previous committees" switcher instead of only ever showing the current one.
func (h *CommitteeHandler) List(w http.ResponseWriter, r *http.Request) {
	committees := []models.Committee{}
	if err := h.DB.Select(&committees, `SELECT * FROM committees ORDER BY term_start DESC`); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list failed")
		return
	}
	httpx.JSON(w, http.StatusOK, committees)
}

func (h *CommitteeHandler) Current(w http.ResponseWriter, r *http.Request) {
	var committee models.Committee
	if err := h.DB.Get(&committee, `SELECT * FROM committees WHERE is_current = 1 LIMIT 1`); err != nil {
		httpx.Error(w, http.StatusNotFound, "no current committee")
		return
	}
	h.respondWithPositions(w, committee)
}

func (h *CommitteeHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var committee models.Committee
	if err := h.DB.Get(&committee, `SELECT * FROM committees WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusNotFound, "committee not found")
		return
	}
	h.respondWithPositions(w, committee)
}

func (h *CommitteeHandler) respondWithPositions(w http.ResponseWriter, committee models.Committee) {
	var positions []models.CommitteePosition
	_ = h.DB.Select(&positions, `SELECT * FROM committee_positions WHERE committee_id = ? AND is_active = 1 ORDER BY sort_order`, committee.ID)

	result := make([]positionWithMembers, 0, len(positions))
	for _, p := range positions {
		members := []memberInfo{}
		_ = h.DB.Select(&members, `SELECT u.id AS user_id, u.full_name, COALESCE(ap.avatar_attachment_id, sp.avatar_attachment_id) AS avatar_attachment_id
			FROM committee_members cm
			JOIN users u ON u.id = cm.user_id
			LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
			LEFT JOIN student_profiles sp ON sp.user_id = u.id
			WHERE cm.committee_position_id = ?`, p.ID)
		for i := range members {
			members[i].AvatarURL = attachmentURL(h.DB, h.Storage, members[i].AvatarAttachmentID)
		}
		result = append(result, positionWithMembers{CommitteePosition: p, Members: members})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"committee": committee, "positions": result})
}

type createCommitteeRequest struct {
	TermStart int `json:"termStart"`
	TermEnd   int `json:"termEnd"`
}

// CreateCommittee starts a new term, demoting the previous current committee (preserved as
// history, never deleted) and seeding the three default positions again.
func (h *CommitteeHandler) CreateCommittee(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	var req createCommitteeRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.TermStart == 0 {
		httpx.Error(w, http.StatusBadRequest, "termStart is required")
		return
	}

	tx, err := h.DB.Beginx()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`UPDATE committees SET is_current = 0 WHERE institution_id = ?`, actor.InstitutionID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	res, err := tx.Exec(`INSERT INTO committees (institution_id, term_start, term_end, is_current) VALUES (?, ?, ?, 1)`,
		actor.InstitutionID, req.TermStart, req.TermEnd)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	committeeID, _ := res.LastInsertId()

	defaults := []struct {
		title string
		order int
	}{{"President", 1}, {"Secretary", 2}, {"Organizing Secretary", 3}}
	for _, p := range defaults {
		if _, err := tx.Exec(`INSERT INTO committee_positions (committee_id, title, is_default_admin, sort_order) VALUES (?, ?, 1, ?)`,
			committeeID, p.title, p.order); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "create failed")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "committee.term_started", "committee", &committeeID, nil, req)
	httpx.JSON(w, http.StatusCreated, map[string]int64{"committeeId": committeeID})
}

type createPositionRequest struct {
	Title     string `json:"title"`
	SortOrder int    `json:"sortOrder"`
}

// CreatePosition adds a custom, institution-defined position. Only the three seeded default
// positions ever carry is_default_admin — custom positions never auto-grant Admin.
func (h *CommitteeHandler) CreatePosition(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	committeeID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req createPositionRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "title is required")
		return
	}
	res, err := h.DB.Exec(`INSERT INTO committee_positions (committee_id, title, is_default_admin, sort_order) VALUES (?, ?, 0, ?)`,
		committeeID, req.Title, req.SortOrder)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create failed")
		return
	}
	id, _ := res.LastInsertId()
	var p models.CommitteePosition
	_ = h.DB.Get(&p, `SELECT * FROM committee_positions WHERE id = ?`, id)
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "committee_position.created", "committee_position", &id, nil, p)
	httpx.JSON(w, http.StatusCreated, p)
}

type addMemberRequest struct {
	UserID int64 `json:"userId"`
}

// AddMember assigns a user to a position. If the position is one of the three default
// auto-admin positions, the user's role is promoted to Admin (unless already Admin/SuperAdmin).
func (h *CommitteeHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	positionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req addMemberRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || req.UserID == 0 {
		httpx.Error(w, http.StatusBadRequest, "userId is required")
		return
	}

	var position models.CommitteePosition
	if err := h.DB.Get(&position, `SELECT * FROM committee_positions WHERE id = ?`, positionID); err != nil {
		httpx.Error(w, http.StatusNotFound, "position not found")
		return
	}

	if _, err := h.DB.Exec(`INSERT INTO committee_members (committee_position_id, user_id) VALUES (?, ?)`, positionID, req.UserID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "add member failed")
		return
	}
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "committee_member.added", "committee_position", &positionID, nil, map[string]any{"userId": req.UserID, "position": position.Title})

	if position.IsDefaultAdmin {
		var currentRole int64
		_ = h.DB.Get(&currentRole, `SELECT role_id FROM users WHERE id = ?`, req.UserID)
		if currentRole != models.RoleAdmin && currentRole != models.RoleSuperAdmin {
			_, _ = h.DB.Exec(`UPDATE users SET role_id = ?, updated_at = datetime('now') WHERE id = ?`, models.RoleAdmin, req.UserID)
			audit.Log(h.DB, actor.InstitutionID, &actor.ID, "user.role_auto_granted_admin", "user", &req.UserID,
				map[string]any{"roleId": currentRole}, map[string]any{"roleId": models.RoleAdmin, "viaPosition": position.Title})
		}
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"message": "member added"})
}

func (h *CommitteeHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	positionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	userID, err := strconv.ParseInt(chi.URLParam(r, "userId"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid userId")
		return
	}
	if _, err := h.DB.Exec(`DELETE FROM committee_members WHERE committee_position_id = ? AND user_id = ?`, positionID, userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "remove failed")
		return
	}
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "committee_member.removed", "committee_position", &positionID, map[string]any{"userId": userID}, nil)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "member removed"})
}
