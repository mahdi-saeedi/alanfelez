package api

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/content"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/support"
)

var rolesSupportWrite = []string{auth.RoleSupport, auth.RoleAdmin}

// AdminSupportSummary returns the menu badge counts.
func (s *Server) AdminSupportSummary(ctx context.Context, _ AdminSupportSummaryRequestObject) (AdminSupportSummaryResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminSupportSummarydefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	c, err := s.q.SupportCounts(ctx)
	if err != nil {
		return nil, fmt.Errorf("support counts: %w", err)
	}
	return AdminSupportSummary200JSONResponse{OpenTickets: int(c.OpenTickets), NewMessages: int(c.NewMessages)}, nil
}

// AdminListContactMessages lists contact form messages.
func (s *Server) AdminListContactMessages(ctx context.Context, req AdminListContactMessagesRequestObject) (AdminListContactMessagesResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListContactMessagesdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	var status pgtype.Text
	if req.Params.Status != nil {
		status = textOf(string(*req.Params.Status))
	}
	rows, err := s.q.AdminListContactMessages(ctx, status)
	if err != nil {
		return nil, fmt.Errorf("list contact messages: %w", err)
	}
	items := make([]AdminContactMessage, 0, len(rows))
	for _, r := range rows {
		items = append(items, contactMessageOf(dbq.UpdateContactMessageRow(r)))
	}
	return AdminListContactMessages200JSONResponse{Items: items}, nil
}

// AdminUpdateContactMessage marks a message handled / spam.
func (s *Server) AdminUpdateContactMessage(ctx context.Context, req AdminUpdateContactMessageRequestObject) (AdminUpdateContactMessageResponseObject, error) {
	p, pr := requireRoles(ctx, rolesSupportWrite...)
	if pr != nil {
		return fail[AdminUpdateContactMessagedefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	switch req.Body.Status {
	case ContactStatusNew, ContactStatusHandled, ContactStatusSpam:
	default:
		return fail[AdminUpdateContactMessagedefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "unknown status")), nil
	}
	var note pgtype.Text
	if req.Body.Note != nil {
		note = textOf(*req.Body.Note)
	}
	var row dbq.UpdateContactMessageRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		row, err = q.UpdateContactMessage(ctx, dbq.UpdateContactMessageParams{ID: pgtype.UUID{Bytes: req.Id, Valid: true}, Status: string(req.Body.Status), Note: note, Actor: p.ID})
		if err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "contact_message.update", Entity: "contact_message", EntityID: *uuidString(row.ID), Data: map[string]string{"status": row.Status}})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminUpdateContactMessagedefaultApplicationProblemPlusJSONResponse](notFound(ctx, "message")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("update contact message: %w", err)
	}
	return AdminUpdateContactMessage200JSONResponse(contactMessageOf(row)), nil
}

func contactMessageOf(r dbq.UpdateContactMessageRow) AdminContactMessage {
	m := AdminContactMessage{
		Id: r.ID.Bytes, Name: r.Name, Phone: r.Phone, Email: textp(r.Email), Subject: ContactSubject(r.Subject), Body: r.Body,
		Status: ContactStatus(r.Status), Note: textp(r.Note), HandledAt: timep(r.HandledAt), CreatedAt: r.CreatedAt.Time.UTC(),
	}
	if r.UserID.Valid {
		id := openapi_types.UUID(r.UserID.Bytes)
		m.UserId = &id
	}
	return m
}

// AdminListTickets returns the support queue.
func (s *Server) AdminListTickets(ctx context.Context, req AdminListTicketsRequestObject) (AdminListTicketsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListTicketsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	arg := dbq.AdminListTicketsParams{}
	if req.Params.Status != nil {
		arg.Status = textOf(string(*req.Params.Status))
	}
	if req.Params.UserId != nil {
		arg.UserID = pgtype.UUID{Bytes: *req.Params.UserId, Valid: true}
	}
	rows, err := s.q.AdminListTickets(ctx, arg)
	if err != nil {
		return nil, fmt.Errorf("list tickets: %w", err)
	}
	items := make([]AdminTicket, 0, len(rows))
	for _, r := range rows {
		items = append(items, adminTicketOf(dbq.GetTicketRow(r)))
	}
	return AdminListTickets200JSONResponse{Items: items}, nil
}

// AdminGetTicket returns a ticket with its messages (agents' names included).
func (s *Server) AdminGetTicket(ctx context.Context, req AdminGetTicketRequestObject) (AdminGetTicketResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminGetTicketdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	t, msgs, err := s.ticketThread(ctx, pgtype.UUID{Bytes: req.Id, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminGetTicketdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "ticket")), nil
	}
	if err != nil {
		return nil, err
	}
	return AdminGetTicket200JSONResponse{Ticket: adminTicketOf(t), Messages: messagesOf(msgs, true)}, nil
}

// AdminReplyTicket replies as support.
func (s *Server) AdminReplyTicket(ctx context.Context, req AdminReplyTicketRequestObject) (AdminReplyTicketResponseObject, error) {
	p, pr := requireRoles(ctx, rolesSupportWrite...)
	if pr != nil {
		return fail[AdminReplyTicketdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	body, ok := content.Clean(req.Body.Body, 1, 5000)
	if !ok {
		return fail[AdminReplyTicketdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "message must be 1–5000 characters")), nil
	}
	m, err := s.support.Reply(ctx, pgtype.UUID{Bytes: req.Id, Valid: true}, pgtype.UUID{},
		support.Author{ID: p.ID, Name: p.Username, Staff: true}, body, middleware.GetReqID(ctx))
	if errors.Is(err, support.ErrNotFound) {
		return fail[AdminReplyTicketdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "ticket")), nil
	}
	if err != nil {
		return nil, err
	}
	return AdminReplyTicket201JSONResponse(messageOf(m.ID, m.AuthorName, m.IsStaff, m.Body, m.CreatedAt, true)), nil
}

// AdminSetTicketStatus changes a ticket's status.
func (s *Server) AdminSetTicketStatus(ctx context.Context, req AdminSetTicketStatusRequestObject) (AdminSetTicketStatusResponseObject, error) {
	p, pr := requireRoles(ctx, rolesSupportWrite...)
	if pr != nil {
		return fail[AdminSetTicketStatusdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	actor := actorOf(ctx, p)
	_, err := s.support.SetStatus(ctx, id, pgtype.UUID{}, string(req.Body.Status), &actor)
	switch {
	case errors.Is(err, support.ErrStatus):
		return fail[AdminSetTicketStatusdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "unknown status")), nil
	case errors.Is(err, support.ErrNotFound):
		return fail[AdminSetTicketStatusdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "ticket")), nil
	case err != nil:
		return nil, err
	}
	t, err := s.q.GetTicket(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get ticket: %w", err)
	}
	return AdminSetTicketStatus200JSONResponse(adminTicketOf(t)), nil
}

func adminTicketOf(t dbq.GetTicketRow) AdminTicket {
	base := ticketOf(ticketRow(t))
	out := AdminTicket{
		Id: base.Id, Number: base.Number, Subject: base.Subject, Status: base.Status, Priority: AdminTicketPriority(base.Priority),
		LastMessageAt: base.LastMessageAt, CreatedAt: base.CreatedAt, ClosedAt: base.ClosedAt,
		UserId: t.UserID.Bytes, Username: t.Username,
	}
	if n := strings.TrimSpace(t.FirstName.String + " " + t.LastName.String); n != "" {
		out.UserName = &n
	}
	return out
}
