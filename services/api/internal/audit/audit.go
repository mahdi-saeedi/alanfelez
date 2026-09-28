// Package audit records staff writes in app.audit_log (SECURITY T5, §6). Write it in the same
// transaction as the change it describes, so a change never exists without its audit row.
package audit

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Actor is who made the change.
type Actor struct {
	ID        pgtype.UUID // Keycloak user id
	Name      string      // preferred_username, for readability only
	RequestID string
}

// Entry is one audit record.
type Entry struct {
	Action   string // dotted verb, e.g. price.manual_entry
	Entity   string // table-ish name, e.g. price_point
	EntityID string
	Data     any // marshalled to JSON; never put secrets or tokens here
}

// Write stores e for actor a using q (pass the transaction's queries).
func Write(ctx context.Context, q dbq.Querier, a Actor, e Entry) error {
	data := []byte("{}")
	if e.Data != nil {
		b, err := json.Marshal(e.Data)
		if err != nil {
			return fmt.Errorf("audit: marshal %s: %w", e.Action, err)
		}
		data = b
	}
	err := q.InsertAudit(ctx, dbq.InsertAuditParams{
		ActorID:   a.ID,
		ActorName: text(a.Name),
		Action:    e.Action,
		Entity:    e.Entity,
		EntityID:  text(e.EntityID),
		Data:      data,
		RequestID: text(a.RequestID),
	})
	if err != nil {
		return fmt.Errorf("audit: write %s: %w", e.Action, err)
	}
	return nil
}

func text(s string) pgtype.Text { return pgtype.Text{String: s, Valid: s != ""} }
