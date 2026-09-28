package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/content"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/httpx"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/jalali"
	"github.com/alanfelez/alanfelez/services/api/internal/support"
)

const codeRateLimited = "RATE_LIMITED"

// Contact form limits per client IP (🛠, SECURITY §4 abuse).
const (
	contactPerHour = 5
	contactPerDay  = 20
)

var (
	phoneRe = regexp.MustCompile(`^\+?[0-9][0-9 -]{5,18}[0-9]$`)
	emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
)

// SendContactMessage stores a contact form message. Bots filling the honeypot get the same 202 and nothing is stored.
func (s *Server) SendContactMessage(ctx context.Context, req SendContactMessageRequestObject) (SendContactMessageResponseObject, error) {
	in := req.Body
	bad := func(msg string) (SendContactMessageResponseObject, error) {
		return fail[SendContactMessagedefaultApplicationProblemPlusJSONResponse](badRequest(ctx, msg)), nil
	}
	name, ok := content.Clean(in.Name, 2, 100)
	if !ok {
		return bad("name must be 2–100 characters")
	}
	phone := jalali.Latin(strings.TrimSpace(in.Phone))
	if !phoneRe.MatchString(phone) {
		return bad("invalid phone number")
	}
	var email pgtype.Text
	if in.Email != nil && strings.TrimSpace(*in.Email) != "" {
		e := strings.TrimSpace(*in.Email)
		if !emailRe.MatchString(e) || len(e) > 200 {
			return bad("invalid email")
		}
		email = pgtype.Text{String: e, Valid: true}
	}
	body, ok := content.Clean(in.Body, 10, 5000)
	if !ok {
		return bad("message must be 10–5000 characters")
	}
	if in.Website != nil && len(*in.Website) > 200 {
		return bad("invalid request")
	}
	if !validContactSubject(in.Subject) {
		return bad("unknown subject")
	}

	client := httpx.ClientFrom(ctx)
	if in.Website != nil && *in.Website != "" { // honeypot
		return SendContactMessage202JSONResponse{Id: [16]byte{}}, nil
	}
	if client.IP != nil {
		ip := client.IP.String()
		for _, lim := range []struct {
			n int
			w time.Duration
		}{{contactPerHour, time.Hour}, {contactPerDay, 24 * time.Hour}} {
			allowed, err := s.limiter.Allow(ctx, "contact", ip, lim.n, lim.w)
			if err != nil {
				s.logger().WarnContext(ctx, "rate limit unavailable", "err", err)
			}
			if !allowed {
				return fail[SendContactMessagedefaultApplicationProblemPlusJSONResponse](
					problem(ctx, http.StatusTooManyRequests, codeRateLimited, "Too many messages", "try again later")), nil
			}
		}
	}
	var userID pgtype.UUID
	if p := auth.FromContext(ctx); p != nil {
		userID = p.ID
	}
	row, err := s.q.InsertContactMessage(ctx, dbq.InsertContactMessageParams{
		Name: name, Phone: phone, Email: email, Subject: string(in.Subject), Body: body,
		UserID: userID, Ip: client.IP, UserAgent: textOf(truncate(client.UserAgent, 300)),
	})
	if err != nil {
		return nil, fmt.Errorf("insert contact message: %w", err)
	}
	// Staff see it in the admin (menu badge). E-mail notification waits for an e-mail provider (F14).
	s.logger().InfoContext(ctx, "contact message received", "id", uuidString(row.ID), "subject", in.Subject)
	return SendContactMessage202JSONResponse{Id: row.ID.Bytes}, nil
}

func validContactSubject(s ContactSubject) bool {
	switch s {
	case General, Support, Billing, Partnership, Feedback, Other:
		return true
	}
	return false
}

// ListMyTickets lists the caller's tickets.
func (s *Server) ListMyTickets(ctx context.Context, _ ListMyTicketsRequestObject) (ListMyTicketsResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[ListMyTicketsdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	rows, err := s.q.ListUserTickets(ctx, p.ID)
	if err != nil {
		return nil, fmt.Errorf("list tickets: %w", err)
	}
	items := make([]Ticket, 0, len(rows))
	for _, r := range rows {
		items = append(items, ticketOf(dbq.SetTicketStatusRow(r)))
	}
	return ListMyTickets200JSONResponse{Items: items}, nil
}

// CreateTicket opens a ticket. Gold users (support.priority) get high priority.
func (s *Server) CreateTicket(ctx context.Context, req CreateTicketRequestObject) (CreateTicketResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[CreateTicketdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	key := strings.TrimSpace(req.Params.IdempotencyKey)
	subject, ok1 := content.Clean(req.Body.Subject, 3, 150)
	body, ok2 := content.Clean(req.Body.Body, 10, 5000)
	if len(key) < 8 || !ok1 || !ok2 {
		return fail[CreateTicketdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "subject 3–150 and message 10–5000 characters, Idempotency-Key ≥ 8")), nil
	}
	if _, err := s.touchUser(ctx, p); err != nil { // the ticket references the local profile
		return nil, err
	}
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return nil, err
	}
	priority := "normal"
	if access.Allowed(cur.Tier, access.SupportPriority) {
		priority = "high"
	}
	t, err := s.support.Create(ctx, p.ID, displayName(p), subject, body, priority, key)
	if err != nil {
		return nil, err
	}
	out := ticketOf(dbq.SetTicketStatusRow{
		ID: t.ID, Number: t.Number, UserID: t.UserID, Subject: t.Subject, Status: t.Status, Priority: t.Priority,
		LastMessageAt: t.LastMessageAt, ClosedAt: t.ClosedAt, CreatedAt: t.CreatedAt,
	})
	if !t.Inserted {
		return CreateTicket200JSONResponse(out), nil
	}
	return CreateTicket201JSONResponse(out), nil
}

// GetMyTicket returns one of the caller's tickets with its messages.
func (s *Server) GetMyTicket(ctx context.Context, req GetMyTicketRequestObject) (GetMyTicketResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[GetMyTicketdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	t, msgs, err := s.ticketThread(ctx, pgtype.UUID{Bytes: req.Id, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && t.UserID != p.ID) {
		return fail[GetMyTicketdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "ticket")), nil
	}
	if err != nil {
		return nil, err
	}
	return GetMyTicket200JSONResponse{Ticket: ticketOf(ticketRow(t)), Messages: messagesOf(msgs, false)}, nil
}

// ReplyMyTicket adds the caller's reply.
func (s *Server) ReplyMyTicket(ctx context.Context, req ReplyMyTicketRequestObject) (ReplyMyTicketResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[ReplyMyTicketdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	body, ok := content.Clean(req.Body.Body, 1, 5000)
	if !ok {
		return fail[ReplyMyTicketdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "message must be 1–5000 characters")), nil
	}
	m, err := s.support.Reply(ctx, pgtype.UUID{Bytes: req.Id, Valid: true}, p.ID, support.Author{ID: p.ID, Name: displayName(p)}, body, "")
	if errors.Is(err, support.ErrNotFound) {
		return fail[ReplyMyTicketdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "ticket")), nil
	}
	if err != nil {
		return nil, err
	}
	return ReplyMyTicket201JSONResponse(messageOf(m.ID, m.AuthorName, m.IsStaff, m.Body, m.CreatedAt, false)), nil
}

// CloseMyTicket closes one of the caller's tickets.
func (s *Server) CloseMyTicket(ctx context.Context, req CloseMyTicketRequestObject) (CloseMyTicketResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[CloseMyTicketdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	t, err := s.support.SetStatus(ctx, pgtype.UUID{Bytes: req.Id, Valid: true}, p.ID, support.Closed, nil)
	if errors.Is(err, support.ErrNotFound) {
		return fail[CloseMyTicketdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "ticket")), nil
	}
	if err != nil {
		return nil, err
	}
	return CloseMyTicket200JSONResponse(ticketOf(t)), nil
}

func (s *Server) ticketThread(ctx context.Context, id pgtype.UUID) (dbq.GetTicketRow, []dbq.ListTicketMessagesRow, error) {
	t, err := s.q.GetTicket(ctx, id)
	if err != nil {
		return t, nil, err
	}
	msgs, err := s.q.ListTicketMessages(ctx, id)
	if err != nil {
		return t, nil, fmt.Errorf("ticket messages: %w", err)
	}
	return t, msgs, nil
}

func ticketRow(t dbq.GetTicketRow) dbq.SetTicketStatusRow {
	return dbq.SetTicketStatusRow{
		ID: t.ID, Number: t.Number, UserID: t.UserID, Subject: t.Subject, Status: t.Status, Priority: t.Priority,
		LastMessageAt: t.LastMessageAt, ClosedAt: t.ClosedAt, CreatedAt: t.CreatedAt,
	}
}

func ticketOf(t dbq.SetTicketStatusRow) Ticket {
	return Ticket{
		Id: t.ID.Bytes, Number: t.Number.Int64, Subject: t.Subject, Status: TicketStatus(t.Status), Priority: TicketPriority(t.Priority),
		LastMessageAt: t.LastMessageAt.Time.UTC(), CreatedAt: t.CreatedAt.Time.UTC(), ClosedAt: timep(t.ClosedAt),
	}
}

// messagesOf maps a thread. Users see "support" instead of the agent's username (forStaff = false).
func messagesOf(rows []dbq.ListTicketMessagesRow, forStaff bool) []TicketMessage {
	out := make([]TicketMessage, 0, len(rows))
	for _, m := range rows {
		out = append(out, messageOf(m.ID, m.AuthorName, m.IsStaff, m.Body, m.CreatedAt, forStaff))
	}
	return out
}

func messageOf(id pgtype.UUID, author pgtype.Text, staff bool, body string, at pgtype.Timestamptz, forStaff bool) TicketMessage {
	m := TicketMessage{Id: id.Bytes, Staff: staff, Body: body, CreatedAt: at.Time.UTC()}
	if !staff || forStaff {
		m.Author = textp(author)
	}
	return m
}

func displayName(p *auth.Principal) string {
	if n := strings.TrimSpace(p.GivenName + " " + p.FamilyName); n != "" {
		return n
	}
	return p.Username
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
