package audit

import (
	"encoding/json"

	"github.com/jmoiron/sqlx"
)

// Log records a sensitive administrative action. before/after may be nil for actions with
// no meaningful prior/new state (e.g. a notice publish). Uses Execer so it can run inside
// or outside a transaction interchangeably.
func Log(db sqlx.Execer, institutionID int64, actorUserID *int64, action, entityType string, entityID *int64, before, after any) {
	beforeJSON, _ := json.Marshal(orEmpty(before))
	afterJSON, _ := json.Marshal(orEmpty(after))
	_, _ = db.Exec(
		`INSERT INTO audit_logs (institution_id, actor_user_id, action, entity_type, entity_id, before_json, after_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		institutionID, actorUserID, action, entityType, entityID, string(beforeJSON), string(afterJSON),
	)
}

func orEmpty(v any) any {
	if v == nil {
		return map[string]any{}
	}
	return v
}
