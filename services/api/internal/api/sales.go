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
	"github.com/alanfelez/alanfelez/services/api/internal/content"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/visits"
)

// Tools for the sales team and the admin (client, 2026-11-05): notes and follow-ups on a customer, what each staff
// member did, and one search box for customers, orders and articles.

func customerNoteOf(id, user pgtype.UUID, author, body string, followUp pgtype.Date, done bool, created pgtype.Timestamptz) CustomerNote {
	n := CustomerNote{Id: uuid.UUID(id.Bytes), UserId: uuid.UUID(user.Bytes), Author: author, Body: body, Done: done, CreatedAt: created.Time.UTC()}
	if followUp.Valid {
		n.FollowUp = &openapi_types.Date{Time: followUp.Time}
	}
	return n
}

// AdminListCustomerNotes lists the notes on a customer (staff).
func (s *Server) AdminListCustomerNotes(ctx context.Context, req AdminListCustomerNotesRequestObject) (AdminListCustomerNotesResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListCustomerNotesdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	rows, err := s.q.ListCustomerNotes(ctx, pgtype.UUID{Bytes: req.Id, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("customer notes: %w", err)
	}
	out := make([]CustomerNote, 0, len(rows))
	for _, r := range rows {
		out = append(out, customerNoteOf(r.ID, r.UserID, r.AuthorName, r.Body, r.FollowUp, r.Done, r.CreatedAt))
	}
	return AdminListCustomerNotes200JSONResponse{Items: out}, nil
}

// AdminAddCustomerNote adds a note (and a follow-up day) on a customer (staff, audited).
func (s *Server) AdminAddCustomerNote(ctx context.Context, req AdminAddCustomerNoteRequestObject) (AdminAddCustomerNoteResponseObject, error) {
	type bad = AdminAddCustomerNotedefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesRead...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	body, ok := content.Clean(req.Body.Body, 1, 2000)
	if !ok {
		return fail[bad](badRequest(ctx, "a note is 1–2000 characters")), nil
	}
	var row dbq.InsertCustomerNoteRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		row, err = q.InsertCustomerNote(ctx, dbq.InsertCustomerNoteParams{
			UserID: pgtype.UUID{Bytes: req.Id, Valid: true}, AuthorID: p.ID, AuthorName: p.Username, Body: body, FollowUp: optDate(req.Body.FollowUp),
		})
		if err != nil {
			return err //nolint:wrapcheck // pgx.ErrNoRows is checked below
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "customer.note", Entity: "user", EntityID: req.Id.String()})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[bad](notFound(ctx, "user")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("add note: %w", err)
	}
	return AdminAddCustomerNote201JSONResponse(customerNoteOf(row.ID, row.UserID, row.AuthorName, row.Body, row.FollowUp, row.Done, row.CreatedAt)), nil
}

// AdminSetCustomerNoteDone marks a follow-up done or not (staff, audited).
func (s *Server) AdminSetCustomerNoteDone(ctx context.Context, req AdminSetCustomerNoteDoneRequestObject) (AdminSetCustomerNoteDoneResponseObject, error) {
	type bad = AdminSetCustomerNoteDonedefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesRead...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	var n int64
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if n, err = q.SetCustomerNoteDone(ctx, dbq.SetCustomerNoteDoneParams{ID: pgtype.UUID{Bytes: req.Id, Valid: true}, Done: req.Body.Done}); err != nil || n == 0 {
			return err //nolint:wrapcheck // wrapped below
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "customer.follow_up", Entity: "customer_note", EntityID: req.Id.String(), Data: map[string]bool{"done": req.Body.Done}})
	})
	if err != nil {
		return nil, fmt.Errorf("note done: %w", err)
	}
	if n == 0 {
		return fail[bad](notFound(ctx, "note")), nil
	}
	return AdminSetCustomerNoteDone204Response{}, nil
}

// AdminFollowUps lists the follow-ups due today or earlier (staff).
func (s *Server) AdminFollowUps(ctx context.Context, _ AdminFollowUpsRequestObject) (AdminFollowUpsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminFollowUpsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	rows, err := s.q.DueFollowUps(ctx, pgDate(visits.Day(time.Now())))
	if err != nil {
		return nil, fmt.Errorf("follow-ups: %w", err)
	}
	out := make([]CustomerNote, 0, len(rows))
	for _, r := range rows {
		n := customerNoteOf(r.ID, r.UserID, r.AuthorName, r.Body, r.FollowUp, r.Done, r.CreatedAt)
		who := strings.TrimSpace(fullName(r.FirstName, r.LastName) + " " + r.Username)
		n.Customer = &who
		out = append(out, n)
	}
	return AdminFollowUps200JSONResponse{Items: out}, nil
}

// AdminStaffWork summarises the audit log per staff member and action for a period (admin).
func (s *Server) AdminStaffWork(ctx context.Context, req AdminStaffWorkRequestObject) (AdminStaffWorkResponseObject, error) {
	type bad = AdminStaffWorkdefaultApplicationProblemPlusJSONResponse
	if _, pr := requireRoles(ctx, rolesGrantAccess...); pr != nil {
		return fail[bad](*pr), nil
	}
	from, to, ok := dayRange(req.Params.From, req.Params.To)
	if !ok {
		return fail[bad](badRequest(ctx, "from must not be after to")), nil
	}
	rows, err := s.q.StaffWork(ctx, dbq.StaffWorkParams{FromDay: pgDate(from), ToDay: pgDate(to)})
	if err != nil {
		return nil, fmt.Errorf("staff work: %w", err)
	}
	out := AdminStaffWork200JSONResponse{From: openapi_types.Date{Time: from}, To: openapi_types.Date{Time: to}}
	out.Items = make([]StaffWorkRow, 0, len(rows))
	for _, r := range rows {
		out.Items = append(out.Items, StaffWorkRow{Action: r.Action, ActorId: uuid.UUID(r.ActorID.Bytes), Count: r.N, LastAt: r.LastAt.Time.UTC(), Name: r.ActorName})
	}
	return out, nil
}

// AdminSearch is the admin's search box: customers, orders and articles (staff).
func (s *Server) AdminSearch(ctx context.Context, req AdminSearchRequestObject) (AdminSearchResponseObject, error) {
	type bad = AdminSearchdefaultApplicationProblemPlusJSONResponse
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[bad](*pr), nil
	}
	q := searchTerm(&req.Params.Q)
	if len([]rune(q)) < 2 {
		return fail[bad](badRequest(ctx, "type at least 2 characters")), nil
	}
	users, err := s.q.AdminSearchUsers(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("search users: %w", err)
	}
	orders, err := s.q.AdminSearchOrders(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("search orders: %w", err)
	}
	arts, err := s.q.AdminSearchArticles(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("search articles: %w", err)
	}
	out := AdminSearch200JSONResponse{Users: make([]SearchUser, 0, len(users)), Orders: make([]SearchOrder, 0, len(orders)), Articles: make([]SearchArticle, 0, len(arts))}
	for _, u := range users {
		out.Users = append(out.Users, SearchUser{Company: textp(u.Company), Id: uuid.UUID(u.ID.Bytes), Mobile: u.Username, Name: fullName(u.FirstName, u.LastName)})
	}
	for _, o := range orders {
		out.Orders = append(out.Orders, SearchOrder{Id: uuid.UUID(o.ID.Bytes), Mobile: o.Username, Plan: PaidPlan(o.PlanCode), Status: OrderStatus(o.Status), Amount: rial(o.AmountRial), CreatedAt: o.CreatedAt.Time.UTC()})
	}
	for _, a := range arts {
		out.Articles = append(out.Articles, SearchArticle{Id: uuid.UUID(a.ID.Bytes), Title: pick(false, a.TitleFa, a.TitleEn), Type: ArticleType(a.Type)})
	}
	return out, nil
}
