package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/audit"
	"alumni-portal/internal/auth"
	"alumni-portal/internal/config"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/models"
	"alumni-portal/internal/outreach"
	"alumni-portal/internal/smsgateway"
)

type OutreachHandler struct {
	DB  *sqlx.DB
	Cfg config.Config
}

// GetConfig exposes the env-driven gates/costs so the frontend never hardcodes them — same
// idea as GET /api/institution, just for outreach settings.
func (h *OutreachHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{
		"emailEnabled":      h.Cfg.OutreachEmailEnable,
		"smsEnabled":        h.Cfg.OutreachSMSEnable,
		"emailCostPerUnit":  h.Cfg.EmailCostPerUnit,
		"emailCostCurrency": h.Cfg.EmailCostCurrency,
		"smsCostPerUnit":    h.Cfg.SMSCostPerUnit,
		"smsCostCurrency":   h.Cfg.SMSCostCurrency,
	})
}

type outreachFiltersRequest struct {
	BatchID      string `json:"batchId"`
	DepartmentID string `json:"departmentId"`
	ProgramID    string `json:"programId"`
	BloodGroupID string `json:"bloodGroupId"`
}

type outreachEstimateRequest struct {
	Channel        string                 `json:"channel"`
	TargetAlumni   bool                   `json:"targetAlumni"`
	TargetStudents bool                   `json:"targetStudents"`
	Filters        outreachFiltersRequest `json:"filters"`
	Message        string                 `json:"message"`
	ExtraUserIDs   []int64                `json:"extraUserIds"`
}

// resolveAllRecipients combines the group-based targeting (see outreach.ResolveRecipients) with
// individually-picked recipients (the "Add specific people" search) — used identically by both
// EstimateCost and CreateCampaign so the estimate always matches what actually gets sent.
func resolveAllRecipients(db *sqlx.DB, targetAlumni, targetStudents bool, filters outreach.Filters, extraUserIDs []int64) ([]outreach.Recipient, error) {
	groups, err := outreach.ResolveRecipients(db, targetAlumni, targetStudents, filters)
	if err != nil {
		return nil, err
	}
	extras, err := outreach.FetchUsersByIDs(db, extraUserIDs)
	if err != nil {
		return nil, err
	}
	return outreach.MergeRecipients(groups, extras), nil
}

// EstimateCost resolves the exact same recipient set the actual send would use (see
// resolveAllRecipients) so the estimate an admin sees is never approximate.
func (h *OutreachHandler) EstimateCost(w http.ResponseWriter, r *http.Request) {
	var req outreachEstimateRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !req.TargetAlumni && !req.TargetStudents && len(req.ExtraUserIDs) == 0 {
		httpx.JSON(w, http.StatusOK, map[string]any{"recipientCount": 0, "segments": 0, "unitCost": 0, "estimatedCost": 0, "currency": ""})
		return
	}

	recipients, err := resolveAllRecipients(h.DB, req.TargetAlumni, req.TargetStudents, outreach.Filters{
		BatchID: req.Filters.BatchID, DepartmentID: req.Filters.DepartmentID,
		ProgramID: req.Filters.ProgramID, BloodGroupID: req.Filters.BloodGroupID,
	}, req.ExtraUserIDs)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to resolve recipients")
		return
	}

	count := len(recipients)
	if req.Channel == "sms" {
		segments, _ := smsgateway.CountSegments(req.Message)
		if segments == 0 {
			segments = 1
		}
		unitCost := h.Cfg.SMSCostPerUnit
		httpx.JSON(w, http.StatusOK, map[string]any{
			"recipientCount": count, "segments": segments, "unitCost": unitCost,
			"estimatedCost": float64(count) * float64(segments) * unitCost, "currency": h.Cfg.SMSCostCurrency,
		})
		return
	}

	unitCost := h.Cfg.EmailCostPerUnit
	httpx.JSON(w, http.StatusOK, map[string]any{
		"recipientCount": count, "segments": 1, "unitCost": unitCost,
		"estimatedCost": float64(count) * unitCost, "currency": h.Cfg.EmailCostCurrency,
	})
}

type createCampaignRequest struct {
	Channel        string                 `json:"channel"`
	Subject        string                 `json:"subject"`
	Message        string                 `json:"message"`
	TargetAlumni   bool                   `json:"targetAlumni"`
	TargetStudents bool                   `json:"targetStudents"`
	Filters        outreachFiltersRequest `json:"filters"`
	ExtraUserIDs   []int64                `json:"extraUserIds"`
}

// CreateCampaign validates the channel is actually enabled (defense in depth — the UI already
// prevents this), resolves recipients via the same shared function EstimateCost uses, then
// creates the campaign + snapshots one outreach_recipients row per recipient in a single
// transaction. The background outreach.Sender picks pending rows up within seconds.
func (h *OutreachHandler) CreateCampaign(w http.ResponseWriter, r *http.Request) {
	actor := auth.CurrentUser(r)
	var req createCampaignRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Channel != "email" && req.Channel != "sms" {
		httpx.Error(w, http.StatusBadRequest, "channel must be 'email' or 'sms'")
		return
	}
	if req.Channel == "email" && !h.Cfg.OutreachEmailEnable {
		httpx.Error(w, http.StatusForbidden, "email outreach is not enabled")
		return
	}
	if req.Channel == "sms" && !h.Cfg.OutreachSMSEnable {
		httpx.Error(w, http.StatusForbidden, "SMS outreach is not enabled")
		return
	}
	if !req.TargetAlumni && !req.TargetStudents && len(req.ExtraUserIDs) == 0 {
		httpx.Error(w, http.StatusBadRequest, "select at least one target group or add specific people")
		return
	}
	if strings.TrimSpace(req.Message) == "" {
		httpx.Error(w, http.StatusBadRequest, "message is required")
		return
	}

	recipients, err := resolveAllRecipients(h.DB, req.TargetAlumni, req.TargetStudents, outreach.Filters{
		BatchID: req.Filters.BatchID, DepartmentID: req.Filters.DepartmentID,
		ProgramID: req.Filters.ProgramID, BloodGroupID: req.Filters.BloodGroupID,
	}, req.ExtraUserIDs)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to resolve recipients")
		return
	}
	if len(recipients) == 0 {
		httpx.Error(w, http.StatusBadRequest, "no recipients match this selection")
		return
	}

	segments := 1
	unitCost := h.Cfg.EmailCostPerUnit
	currency := h.Cfg.EmailCostCurrency
	if req.Channel == "sms" {
		segments, _ = smsgateway.CountSegments(req.Message)
		if segments == 0 {
			segments = 1
		}
		unitCost = h.Cfg.SMSCostPerUnit
		currency = h.Cfg.SMSCostCurrency
	}
	estimatedCost := float64(len(recipients)) * float64(segments) * unitCost
	if req.Channel == "email" {
		estimatedCost = float64(len(recipients)) * unitCost
	}

	tx, err := h.DB.Beginx()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start campaign")
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(`INSERT INTO outreach_campaigns
		(channel, subject, message, target_alumni, target_students, filters_json, sms_segments,
		 recipient_count, estimated_cost, currency, status, created_by_user_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
		req.Channel, req.Subject, req.Message, req.TargetAlumni, req.TargetStudents,
		filtersToJSON(req.Filters), segments, len(recipients), estimatedCost, currency, actor.ID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create campaign")
		return
	}
	campaignID, _ := res.LastInsertId()

	for _, rec := range recipients {
		if _, err := tx.Exec(`INSERT INTO outreach_recipients (campaign_id, user_id, recipient_name, recipient_email, recipient_phone)
			VALUES (?, ?, ?, ?, ?)`, campaignID, rec.UserID, rec.Name, rec.Email, rec.Phone); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to queue recipients")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create campaign")
		return
	}

	var campaign models.OutreachCampaign
	_ = h.DB.Get(&campaign, `SELECT * FROM outreach_campaigns WHERE id = ?`, campaignID)
	audit.Log(h.DB, actor.InstitutionID, &actor.ID, "outreach.campaign_created", "outreach_campaign", &campaignID, nil, campaign)

	httpx.JSON(w, http.StatusCreated, campaign)
}

func filtersToJSON(f outreachFiltersRequest) string {
	parts := []string{}
	add := func(key, val string) {
		if val != "" {
			parts = append(parts, `"`+key+`":"`+val+`"`)
		}
	}
	add("batchId", f.BatchID)
	add("departmentId", f.DepartmentID)
	add("programId", f.ProgramID)
	add("bloodGroupId", f.BloodGroupID)
	return "{" + strings.Join(parts, ",") + "}"
}

func (h *OutreachHandler) ListCampaigns(w http.ResponseWriter, r *http.Request) {
	pg := httpx.ParsePagination(r)
	var total int
	_ = h.DB.Get(&total, `SELECT COUNT(*) FROM outreach_campaigns`)

	campaigns := []models.OutreachCampaign{}
	if err := h.DB.Select(&campaigns, `SELECT * FROM outreach_campaigns ORDER BY created_at DESC LIMIT ? OFFSET ?`, pg.PageSize, pg.Offset); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list campaigns")
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: campaigns, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

func (h *OutreachHandler) GetCampaign(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var campaign models.OutreachCampaign
	if err := h.DB.Get(&campaign, `SELECT * FROM outreach_campaigns WHERE id = ?`, id); err != nil {
		httpx.Error(w, http.StatusNotFound, "campaign not found")
		return
	}
	httpx.JSON(w, http.StatusOK, campaign)
}

func (h *OutreachHandler) ListLogs(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	status := r.URL.Query().Get("status")
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	pg := httpx.ParsePagination(r)

	where := []string{"campaign_id = ?"}
	args := []any{id}
	if status != "" {
		where = append(where, "status = ?")
		args = append(args, status)
	}
	if q != "" {
		where = append(where, "(recipient_email LIKE ? OR recipient_phone LIKE ?)")
		args = append(args, "%"+q+"%", "%"+q+"%")
	}
	whereSQL := "WHERE " + strings.Join(where, " AND ")

	var total int
	_ = h.DB.Get(&total, "SELECT COUNT(*) FROM outreach_recipients "+whereSQL, args...)

	logs := []models.OutreachRecipient{}
	pagedArgs := append(append([]any{}, args...), pg.PageSize, pg.Offset)
	if err := h.DB.Select(&logs, "SELECT * FROM outreach_recipients "+whereSQL+" ORDER BY id LIMIT ? OFFSET ?", pagedArgs...); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list logs")
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.PagedResult{Items: logs, Page: pg.Page, PageSize: pg.PageSize, Total: total})
}

// SearchRecipients backs the "Add specific people" picker — free-text search across all
// approved users by name/email/phone, independent of the group/filter targeting above.
func (h *OutreachHandler) SearchRecipients(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		httpx.JSON(w, http.StatusOK, []outreach.UserSearchResult{})
		return
	}
	results, err := outreach.SearchUsers(h.DB, q, 20)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "search failed")
		return
	}
	httpx.JSON(w, http.StatusOK, results)
}
