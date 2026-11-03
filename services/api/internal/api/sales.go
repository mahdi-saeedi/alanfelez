package api

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/visits"
)

// Sales follow-up (client 2026-11-03): each customer's stage with the sales staff, who looks after them, the next
// call, and a log of notes and calls; plus the call lists (plans ending soon, plans bought two weeks ago). Every staff
// member reads it; sales staff and admins write it (audited).

var rolesSales = []string{auth.RoleSales, auth.RoleAdmin}

type lastCall = struct {
	At      time.Time    `json:"at"`
	Author  string       `json:"author"`
	Body    *string      `json:"body,omitempty"`
	Outcome *CallOutcome `json:"outcome,omitempty"`
}

func leadOf(l dbq.AppSalesLead) SalesLead {
	out := SalesLead{Stage: LeadStage(l.Stage), OwnerName: textp(l.OwnerName), UpdatedAt: l.UpdatedAt.Time.UTC(), UpdatedBy: l.UpdatedBy}
	if l.OwnerID.Valid {
		id := uuid.UUID(l.OwnerID.Bytes)
		out.OwnerId = &id
	}
	if l.NextAt.Valid {
		out.NextAt = &openapi_types.Date{Time: l.NextAt.Time}
	}
	return out
}

func noteOf(id pgtype.UUID, kind string, outcome pgtype.Text, body, author string, at pgtype.Timestamptz) SalesNote {
	n := SalesNote{Id: id.Bytes, Kind: SalesNoteKind(kind), Body: body, Author: author, CreatedAt: at.Time.UTC()}
	if outcome.Valid {
		o := CallOutcome(outcome.String)
		n.Outcome = &o
	}
	return n
}

// staffName is how a staff member signs notes: their name from the token, else the username.
func staffName(p *auth.Principal) string {
	if n := strings.TrimSpace(p.GivenName + " " + p.FamilyName); n != "" {
		return n
	}
	return p.Username
}

// AdminSalesCard returns a customer's sales card and notes.
func (s *Server) AdminSalesCard(ctx context.Context, req AdminSalesCardRequestObject) (AdminSalesCardResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminSalesCarddefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	out := AdminSalesCard200JSONResponse{Notes: []SalesNote{}}
	lead, err := s.q.GetSalesLead(ctx, id)
	switch {
	case err == nil:
		l := leadOf(lead)
		out.Lead = &l
	case !errors.Is(err, pgx.ErrNoRows):
		return nil, fmt.Errorf("sales lead: %w", err)
	}
	notes, err := s.q.ListSalesNotes(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("sales notes: %w", err)
	}
	for _, n := range notes {
		out.Notes = append(out.Notes, noteOf(n.ID, n.Kind, n.Outcome, n.Body, n.AuthorName, n.CreatedAt))
	}
	return out, nil
}

// AdminSetSalesLead sets a customer's stage, owner and next follow-up (sales staff, admin).
func (s *Server) AdminSetSalesLead(ctx context.Context, req AdminSetSalesLeadRequestObject) (AdminSetSalesLeadResponseObject, error) {
	p, pr := requireRoles(ctx, rolesSales...)
	if pr != nil {
		return fail[AdminSetSalesLeaddefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in := req.Body
	switch in.Stage {
	case LeadStageNew, LeadStageContacted, LeadStageInterested, LeadStageNotInterested, LeadStageCustomer:
	default:
		return fail[AdminSetSalesLeaddefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "unknown stage")), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	if ok, err := s.q.UserExists(ctx, id); err != nil {
		return nil, fmt.Errorf("sales lead: %w", err)
	} else if !ok {
		return fail[AdminSetSalesLeaddefaultApplicationProblemPlusJSONResponse](notFound(ctx, "user")), nil
	}
	arg := dbq.UpsertSalesLeadParams{UserID: id, Stage: string(in.Stage), UpdatedBy: p.Username}
	if in.OwnerId != nil {
		arg.OwnerID = pgtype.UUID{Bytes: *in.OwnerId, Valid: true}
		name := ""
		if arg.OwnerID == p.ID {
			name = staffName(p)
		} else if s.identity != nil {
			n, err := s.identity.DisplayName(ctx, in.OwnerId.String())
			if err != nil {
				return fail[AdminSetSalesLeaddefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "unknown staff member")), nil //nolint:nilerr // a bad id is the caller's mistake
			}
			name = n
		}
		arg.OwnerName = textOf(name)
	}
	if in.NextAt != nil {
		arg.NextAt = pgDate(in.NextAt.Time)
	}
	var row dbq.AppSalesLead
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if row, err = q.UpsertSalesLead(ctx, arg); err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "sales.lead", Entity: "user", EntityID: req.Id.String(),
			Data: map[string]any{"stage": in.Stage, "owner": arg.OwnerName.String, "next": in.NextAt}})
	})
	if err != nil {
		return nil, fmt.Errorf("sales lead: %w", err)
	}
	return AdminSetSalesLead200JSONResponse(leadOf(row)), nil
}

// AdminAddSalesNote adds a note or a call to a customer (sales staff, admin).
func (s *Server) AdminAddSalesNote(ctx context.Context, req AdminAddSalesNoteRequestObject) (AdminAddSalesNoteResponseObject, error) {
	p, pr := requireRoles(ctx, rolesSales...)
	if pr != nil {
		return fail[AdminAddSalesNotedefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in := req.Body
	body := strings.TrimSpace(orElse(in.Body, ""))
	call := in.Kind == Call || in.Kind == RenewalCall || in.Kind == FeedbackCall
	switch {
	case in.Kind != Note && !call:
		return fail[AdminAddSalesNotedefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "unknown kind")), nil
	case len([]rune(body)) > 2000:
		return fail[AdminAddSalesNotedefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "the note is longer than 2000 characters")), nil
	case !call && body == "":
		return fail[AdminAddSalesNotedefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "a note needs text")), nil
	case !call && in.Outcome != nil:
		return fail[AdminAddSalesNotedefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "only calls have an outcome")), nil
	}
	arg := dbq.InsertSalesNoteParams{UserID: pgtype.UUID{Bytes: req.Id, Valid: true}, AuthorID: p.ID, AuthorName: staffName(p), Kind: string(in.Kind), Body: body}
	if in.Outcome != nil {
		switch *in.Outcome {
		case CallOutcomeAnswered, CallOutcomeNoAnswer, CallOutcomeCallBack:
			arg.Outcome = textOf(string(*in.Outcome))
		default:
			return fail[AdminAddSalesNotedefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "unknown outcome")), nil
		}
	}
	if ok, err := s.q.UserExists(ctx, arg.UserID); err != nil {
		return nil, fmt.Errorf("sales note: %w", err)
	} else if !ok {
		return fail[AdminAddSalesNotedefaultApplicationProblemPlusJSONResponse](notFound(ctx, "user")), nil
	}
	var row dbq.InsertSalesNoteRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if row, err = q.InsertSalesNote(ctx, arg); err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "sales.note", Entity: "user", EntityID: req.Id.String(),
			Data: map[string]any{"kind": in.Kind, "outcome": arg.Outcome.String}})
	})
	if err != nil {
		return nil, fmt.Errorf("sales note: %w", err)
	}
	return AdminAddSalesNote201JSONResponse(noteOf(row.ID, row.Kind, row.Outcome, row.Body, row.AuthorName, row.CreatedAt)), nil
}

// AdminSalesFollowups lists the follow-ups due by a day (overdue included).
func (s *Server) AdminSalesFollowups(ctx context.Context, req AdminSalesFollowupsRequestObject) (AdminSalesFollowupsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminSalesFollowupsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	day := visits.Day(time.Now())
	if req.Params.Day != nil {
		day = req.Params.Day.Time
	}
	arg := dbq.SalesFollowupsParams{Day: pgDate(day)}
	if req.Params.Owner != nil {
		arg.OwnerID = pgtype.UUID{Bytes: *req.Params.Owner, Valid: true}
	}
	rows, err := s.q.SalesFollowups(ctx, arg)
	if err != nil {
		return nil, fmt.Errorf("sales followups: %w", err)
	}
	out := AdminSalesFollowups200JSONResponse{Items: make([]SalesFollowup, 0, len(rows))}
	for _, r := range rows {
		f := SalesFollowup{UserId: r.UserID.Bytes, Username: r.Username, Company: textp(r.Company), Plan: Tier(r.CurrentPlan),
			Stage: LeadStage(r.Stage), OwnerName: textp(r.OwnerName), NextAt: openapi_types.Date{Time: r.NextAt.Time}}
		if name := fullName(r.FirstName, r.LastName); name != "" {
			f.Name = &name
		}
		if r.LastAt.Valid {
			n := noteOf(pgtype.UUID{}, r.LastKind, r.LastOutcome, r.LastBody, "", r.LastAt)
			f.Last = &n
		}
		out.Items = append(out.Items, f)
	}
	return out, nil
}

// AdminSalesCalls returns a call list: renewal (paid plans ending in minDays–maxDays days, default 2–4) or feedback
// (plans bought minDays–maxDays days ago, default 14–16). Days are Tehran calendar days.
func (s *Server) AdminSalesCalls(ctx context.Context, req AdminSalesCallsRequestObject) (AdminSalesCallsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminSalesCallsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	lo, hi := 2, 4
	if req.Params.Kind == AdminSalesCallsParamsKindFeedback {
		lo, hi = 14, 16
	} else if req.Params.Kind != AdminSalesCallsParamsKindRenewal {
		return fail[AdminSalesCallsdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "kind: renewal or feedback")), nil
	}
	if req.Params.MinDays != nil {
		lo = *req.Params.MinDays
	}
	if req.Params.MaxDays != nil {
		hi = *req.Params.MaxDays
	}
	if lo < 0 || hi > 365 || lo > hi {
		return fail[AdminSalesCallsdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "0 ≤ minDays ≤ maxDays ≤ 365")), nil
	}
	today := visits.Day(time.Now())
	type row struct {
		sub, user            pgtype.UUID
		plan, username       string
		first, last, company pgtype.Text
		stage                string
		owner, outcome       pgtype.Text
		body, author         string
		starts, ends, callAt pgtype.Timestamptz
		paid                 bool
	}
	var rows []row
	if req.Params.Kind == AdminSalesCallsParamsKindRenewal {
		from, _ := visits.Bounds(today.AddDate(0, 0, lo))
		_, to := visits.Bounds(today.AddDate(0, 0, hi))
		rs, err := s.q.RenewalCalls(ctx, dbq.RenewalCallsParams{FromAt: pgTime(from), ToAt: pgTime(to)})
		if err != nil {
			return nil, fmt.Errorf("renewal calls: %w", err)
		}
		for _, r := range rs {
			rows = append(rows, row{r.SubscriptionID, r.UserID, r.PlanCode, r.Username, r.FirstName, r.LastName, r.Company, r.Stage,
				r.OwnerName, r.CallOutcome, r.CallBody, r.CallBy, r.StartsAt, r.EndsAt, r.CallAt, r.Paid})
		}
	} else {
		from, _ := visits.Bounds(today.AddDate(0, 0, -hi))
		_, to := visits.Bounds(today.AddDate(0, 0, -lo))
		rs, err := s.q.FeedbackCalls(ctx, dbq.FeedbackCallsParams{FromAt: pgTime(from), ToAt: pgTime(to)})
		if err != nil {
			return nil, fmt.Errorf("feedback calls: %w", err)
		}
		for _, r := range rs {
			rows = append(rows, row{r.SubscriptionID, r.UserID, r.PlanCode, r.Username, r.FirstName, r.LastName, r.Company, r.Stage,
				r.OwnerName, r.CallOutcome, r.CallBody, r.CallBy, r.StartsAt, r.EndsAt, r.CallAt, r.Paid})
		}
	}
	out := AdminSalesCalls200JSONResponse{MinDays: lo, MaxDays: hi, Items: make([]SalesCall, 0, len(rows))}
	for _, r := range rows {
		c := SalesCall{SubscriptionId: r.sub.Bytes, UserId: r.user.Bytes, Username: r.username, Company: textp(r.company),
			Plan: PaidPlan(r.plan), StartsAt: r.starts.Time.UTC(), EndsAt: r.ends.Time.UTC(), Paid: r.paid, OwnerName: textp(r.owner)}
		if name := fullName(r.first, r.last); name != "" {
			c.Name = &name
		}
		if r.stage != "" {
			st := LeadStage(r.stage)
			c.Stage = &st
		}
		if r.callAt.Valid {
			lc := lastCall{At: r.callAt.Time.UTC(), Author: r.author}
			if r.body != "" {
				lc.Body = &r.body
			}
			if r.outcome.Valid {
				o := CallOutcome(r.outcome.String)
				lc.Outcome = &o
			}
			c.LastCall = &lc
		}
		out.Items = append(out.Items, c)
	}
	return out, nil
}
