// Package support owns user tickets (SCOPE §12). The contact form is a single insert and lives in the API handler.
//
// A ticket's status says whose turn it is: open = waiting for support, answered = waiting for the user.
// Any message moves it to the other side's turn (a user reply also reopens a closed ticket), so the support
// queue is simply "open tickets, high priority first, oldest first".
package support

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Ticket statuses.
const (
	Open     = "open"
	Answered = "answered"
	Closed   = "closed"
)

// Errors.
var (
	ErrNotFound = errors.New("ticket not found")
	ErrStatus   = errors.New("unknown ticket status")
)

// StatusAfterMessage is the status once a message is added: it becomes the other side's turn.
func StatusAfterMessage(byStaff bool) string {
	if byStaff {
		return Answered
	}
	return Open
}

// ValidStatus reports whether s is a ticket status.
func ValidStatus(s string) bool { return s == Open || s == Answered || s == Closed }

// Author writes a message.
type Author struct {
	ID    pgtype.UUID
	Name  string
	Staff bool
}

// Service runs ticket writes in transactions.
type Service struct{ pool *pgxpool.Pool }

// NewService returns a ticket service on pool.
func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

// Create opens a ticket with its first message. The same idempotency key returns the first ticket unchanged.
func (s *Service) Create(ctx context.Context, userID pgtype.UUID, name, subject, body, priority, key string) (dbq.CreateTicketRow, error) {
	var t dbq.CreateTicketRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		t, err = q.CreateTicket(ctx, dbq.CreateTicketParams{UserID: userID, Subject: subject, Priority: priority, IdempotencyKey: key})
		if err != nil {
			return fmt.Errorf("create ticket: %w", err)
		}
		if !t.Inserted {
			return nil
		}
		_, err = q.InsertTicketMessage(ctx, dbq.InsertTicketMessageParams{
			TicketID: t.ID, AuthorID: userID, AuthorName: text(name), IsStaff: false, Body: body,
		})
		return err
	})
	return t, err
}

// Reply adds a message. owner, when valid, restricts the reply to that user's own ticket (a user can't reply to
// someone else's; that looks like "not found"). Staff replies are audit-logged.
func (s *Service) Reply(ctx context.Context, ticketID, owner pgtype.UUID, a Author, body, requestID string) (dbq.InsertTicketMessageRow, error) {
	var m dbq.InsertTicketMessageRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		t, err := q.GetTicketForUpdate(ctx, ticketID)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && owner.Valid && t.UserID != owner) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock ticket: %w", err)
		}
		m, err = q.InsertTicketMessage(ctx, dbq.InsertTicketMessageParams{
			TicketID: ticketID, AuthorID: a.ID, AuthorName: text(a.Name), IsStaff: a.Staff, Body: body,
		})
		if err != nil {
			return fmt.Errorf("insert message: %w", err)
		}
		if _, err := q.SetTicketStatus(ctx, dbq.SetTicketStatusParams{ID: ticketID, Status: StatusAfterMessage(a.Staff), Touched: true}); err != nil {
			return fmt.Errorf("ticket status: %w", err)
		}
		if a.Staff {
			return audit.Write(ctx, q, audit.Actor{ID: a.ID, Name: a.Name, RequestID: requestID}, audit.Entry{
				Action: "ticket.reply", Entity: "ticket", EntityID: uuidString(ticketID), Data: map[string]any{"message_id": uuidString(m.ID)},
			})
		}
		return nil
	})
	return m, err
}

// SetStatus changes a ticket's status (users may only close their own; staff may set any status).
func (s *Service) SetStatus(ctx context.Context, ticketID, owner pgtype.UUID, status string, staff *audit.Actor) (dbq.SetTicketStatusRow, error) {
	if !ValidStatus(status) {
		return dbq.SetTicketStatusRow{}, ErrStatus
	}
	var out dbq.SetTicketStatusRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		t, err := q.GetTicketForUpdate(ctx, ticketID)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && owner.Valid && t.UserID != owner) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock ticket: %w", err)
		}
		if out, err = q.SetTicketStatus(ctx, dbq.SetTicketStatusParams{ID: ticketID, Status: status}); err != nil {
			return fmt.Errorf("ticket status: %w", err)
		}
		if staff != nil {
			return audit.Write(ctx, q, *staff, audit.Entry{
				Action: "ticket.status", Entity: "ticket", EntityID: uuidString(ticketID), Data: map[string]string{"from": t.Status, "to": status},
			})
		}
		return nil
	})
	return out, err
}

func (s *Service) tx(ctx context.Context, fn func(*dbq.Queries) error) error {
	if err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error { return fn(dbq.New(tx)) }); err != nil {
		return fmt.Errorf("support: %w", err)
	}
	return nil
}

func text(s string) pgtype.Text { return pgtype.Text{String: s, Valid: s != ""} }

func uuidString(u pgtype.UUID) string { return uuid.UUID(u.Bytes).String() }
