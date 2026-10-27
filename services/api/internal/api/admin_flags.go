package api

import (
	"context"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/payment/mock"
)

const flagPayments = "payments.enabled"

// The flags the admin's «قابلیت‌ها» screen may switch (ADR-0016). Only flags the code reads are listed; the others in
// app.feature_flags do nothing yet, so showing them would only confuse.
var editableFlags = []string{flagPayments, flagEnglishSite, flagLicensesPage}

// paymentsLocked: buying with the test gateway (or none) would hand out plans for free, so payments can't be switched
// on from the admin until a real gateway is configured. Switching them off always works.
func (s *Server) paymentsLocked() bool {
	return s.gateway == "" || s.gateway == mock.Name || s.gateway == "none"
}

func (s *Server) flagOf(key string, enabled bool, updated pgtype.Timestamptz) AdminFlag {
	f := AdminFlag{Key: key, Enabled: enabled, Locked: key == flagPayments && !enabled && s.paymentsLocked()}
	if updated.Valid {
		t := updated.Time.UTC()
		f.UpdatedAt = &t
	}
	return f
}

// AdminListFlags lists the switchable flags; one missing from the database reads as off.
func (s *Server) AdminListFlags(ctx context.Context, _ AdminListFlagsRequestObject) (AdminListFlagsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListFlagsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	rows, err := s.q.ListFlags(ctx, editableFlags)
	if err != nil {
		return nil, fmt.Errorf("list flags: %w", err)
	}
	items := make([]AdminFlag, 0, len(editableFlags))
	for _, k := range editableFlags {
		i := slices.IndexFunc(rows, func(r dbq.ListFlagsRow) bool { return r.Key == k })
		if i < 0 {
			items = append(items, s.flagOf(k, false, pgtype.Timestamptz{}))
			continue
		}
		items = append(items, s.flagOf(k, rows[i].Enabled, rows[i].UpdatedAt))
	}
	return AdminListFlags200JSONResponse{Items: items}, nil
}

// AdminSetFlag switches one flag (admin role, audited). The API reads flags from the database on each request, so
// the change is live at once (the website caches the English-site flag for a minute).
func (s *Server) AdminSetFlag(ctx context.Context, req AdminSetFlagRequestObject) (AdminSetFlagResponseObject, error) {
	p, pr := requireRoles(ctx, rolesSettingsWrite...)
	if pr != nil {
		return fail[AdminSetFlagdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	if !slices.Contains(editableFlags, req.Key) {
		return fail[AdminSetFlagdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "flag")), nil
	}
	on := req.Body.Enabled
	if req.Key == flagPayments && on && s.paymentsLocked() {
		return fail[AdminSetFlagdefaultApplicationProblemPlusJSONResponse](conflict(ctx, "payments need a real payment gateway first")), nil
	}
	var row dbq.SetFlagRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if row, err = q.SetFlag(ctx, dbq.SetFlagParams{Key: req.Key, Enabled: on}); err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "flag.set", Entity: "feature_flags", EntityID: req.Key, Data: map[string]any{"enabled": on}})
	})
	if err != nil {
		return nil, fmt.Errorf("set flag: %w", err)
	}
	return AdminSetFlag200JSONResponse(s.flagOf(row.Key, row.Enabled, row.UpdatedAt)), nil
}
