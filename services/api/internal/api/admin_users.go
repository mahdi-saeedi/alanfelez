package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/identity"
)

// Identity is the part of Keycloak's Admin API the API uses (internal/identity; a fake in tests).
type Identity interface {
	RealmRoles(ctx context.Context, userID string) ([]string, error)
	DeleteUser(ctx context.Context, userID string) error
}

// WithIdentity connects user deletion to Keycloak (default: none, deleting answers UPSTREAM_UNAVAILABLE).
func WithIdentity(i Identity) Option { return func(s *Server) { s.identity = i } }

// AdminDeleteUser deletes a customer (admin only, owner 2026-10-27). Keycloak first: the account and every session
// go, so nobody can sign in with it again. Then, in one transaction with the audit entry, the local row loses its
// personal details and the user's own data is removed; orders, payments, subscriptions and tickets stay, nameless.
// Safe to repeat: a half-finished delete (Keycloak done, database not) completes on the next try.
func (s *Server) AdminDeleteUser(ctx context.Context, req AdminDeleteUserRequestObject) (AdminDeleteUserResponseObject, error) {
	p, pr := requireRoles(ctx, rolesGrantAccess...)
	if pr != nil {
		return fail[AdminDeleteUserdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	if s.identity == nil {
		return fail[AdminDeleteUserdefaultApplicationProblemPlusJSONResponse](problem(ctx, http.StatusServiceUnavailable, codeUpstream,
			"User deletion is not set up", "the API has no Keycloak service account (secret alanfelez-keycloak-api-admin)")), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	if id == p.ID {
		return fail[AdminDeleteUserdefaultApplicationProblemPlusJSONResponse](conflict(ctx, "you can't delete your own account")), nil
	}
	sub := *uuidString(id)

	roles, err := s.identity.RealmRoles(ctx, sub)
	inKeycloak := !errors.Is(err, identity.ErrUserNotFound)
	if err != nil && inKeycloak {
		return nil, fmt.Errorf("delete user: %w", err)
	}
	if slices.Contains(roles, auth.RoleStaff) {
		return fail[AdminDeleteUserdefaultApplicationProblemPlusJSONResponse](conflict(ctx,
			"this is a staff account: take its staff roles away in Keycloak first")), nil
	}
	deletedAt, err := s.q.UserDeletedAt(ctx, id)
	local := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("delete user: %w", err)
	}
	if !inKeycloak && (!local || deletedAt.Valid) {
		return fail[AdminDeleteUserdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "user")), nil
	}

	if inKeycloak {
		if err := s.identity.DeleteUser(ctx, sub); err != nil {
			return nil, fmt.Errorf("delete user: %w", err)
		}
	}
	err = s.tx(ctx, func(q *dbq.Queries) error {
		if _, err := q.AnonymizeUser(ctx, id); err != nil {
			return err
		}
		if err := q.DeleteUserPrivateData(ctx, id); err != nil {
			return err
		}
		// No personal details in the audit entry either: the id is enough to match orders and tickets.
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "user.delete", Entity: "user", EntityID: sub,
			Data: map[string]bool{"keycloak": inKeycloak}})
	})
	if err != nil {
		return nil, fmt.Errorf("delete user: %w", err)
	}
	return AdminDeleteUser204Response{}, nil
}
