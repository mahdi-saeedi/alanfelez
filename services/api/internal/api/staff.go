package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/identity"
)

// Staff accounts (admin «پرسنل», client 2026-11-03, owner OK by phone): the admin creates staff with a username and
// password, picks their roles, disables them or sets a new password. The accounts live in Keycloak (internal/identity);
// the two-step sign-in stays mandatory for every staff role. Only admins change accounts; every staff member may read
// the list (to assign a customer to a salesperson). Changes are audited (never the password).

var (
	staffUsernameRe = regexp.MustCompile(`^[a-z0-9._-]{3,40}$`)
	digitsOnlyRe    = regexp.MustCompile(`^[0-9+]+$`) // customers' usernames are mobile numbers
)

func noIdentity(ctx context.Context) Problem {
	return problem(ctx, http.StatusServiceUnavailable, codeUpstream, "Staff accounts are not set up",
		"the API has no Keycloak service account (secret alanfelez-keycloak-api-admin)")
}

// staffRoles checks a role list: at least one, only staff roles, no repeats.
func staffRoles(in []StaffRole) ([]string, bool) {
	out := make([]string, 0, len(in))
	for _, r := range in {
		if !slices.Contains(identity.StaffRoles, string(r)) || slices.Contains(out, string(r)) {
			return nil, false
		}
		out = append(out, string(r))
	}
	return out, len(out) > 0
}

func staffOf(m identity.StaffMember) StaffMember {
	out := StaffMember{Id: uuid.MustParse(m.ID), Username: m.Username, Enabled: m.Enabled, Totp: m.TOTP, Roles: make([]StaffRole, 0, len(m.Roles))}
	if m.FirstName != "" {
		out.FirstName = &m.FirstName
	}
	if m.LastName != "" {
		out.LastName = &m.LastName
	}
	if !m.CreatedAt.IsZero() && m.CreatedAt.Unix() > 0 {
		t := m.CreatedAt
		out.CreatedAt = &t
	}
	for _, r := range m.Roles {
		out.Roles = append(out.Roles, StaffRole(r))
	}
	return out
}

// isStaff reports whether the Keycloak user holds a staff role (customers' accounts are never changed here).
func (s *Server) isStaff(ctx context.Context, id uuid.UUID) (bool, error) {
	roles, err := s.identity.RealmRoles(ctx, id.String())
	if errors.Is(err, identity.ErrUserNotFound) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("staff roles: %w", err)
	}
	return slices.Contains(roles, auth.RoleStaff), nil
}

func (s *Server) auditStaff(ctx context.Context, p *auth.Principal, action, id string, data any) error {
	if err := s.tx(ctx, func(q *dbq.Queries) error {
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: action, Entity: "staff", EntityID: id, Data: data})
	}); err != nil {
		return fmt.Errorf("staff audit: %w", err)
	}
	return nil
}

// AdminListStaff lists the staff accounts.
func (s *Server) AdminListStaff(ctx context.Context, _ AdminListStaffRequestObject) (AdminListStaffResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListStaffdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	if s.identity == nil {
		return fail[AdminListStaffdefaultApplicationProblemPlusJSONResponse](noIdentity(ctx)), nil
	}
	list, err := s.identity.ListStaff(ctx)
	if err != nil {
		return nil, fmt.Errorf("list staff: %w", err)
	}
	out := AdminListStaff200JSONResponse{Items: make([]StaffMember, 0, len(list))}
	for _, m := range list {
		out.Items = append(out.Items, staffOf(m))
	}
	return out, nil
}

// AdminCreateStaff creates a staff account (admin only).
func (s *Server) AdminCreateStaff(ctx context.Context, req AdminCreateStaffRequestObject) (AdminCreateStaffResponseObject, error) {
	p, pr := requireRoles(ctx, rolesGrantAccess...)
	if pr != nil {
		return fail[AdminCreateStaffdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	if s.identity == nil {
		return fail[AdminCreateStaffdefaultApplicationProblemPlusJSONResponse](noIdentity(ctx)), nil
	}
	in := req.Body
	username := strings.ToLower(strings.TrimSpace(in.Username))
	first, last := strings.TrimSpace(in.FirstName), strings.TrimSpace(orElse(in.LastName, ""))
	roles, ok := staffRoles(in.Roles)
	switch {
	case !staffUsernameRe.MatchString(username) || digitsOnlyRe.MatchString(username):
		return fail[AdminCreateStaffdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "username: 3–40 Latin letters, digits, dot, dash or underscore, not only digits")), nil
	case first == "" || len([]rune(first)) > 60 || len([]rune(last)) > 60:
		return fail[AdminCreateStaffdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "first name: 1–60 characters; last name up to 60")), nil
	case len(in.Password) < 10 || len(in.Password) > 128:
		return fail[AdminCreateStaffdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "password: 10–128 characters")), nil
	case !ok:
		return fail[AdminCreateStaffdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "roles: one or more of admin, editor, support, sales")), nil
	}
	temporary := in.Temporary != nil && *in.Temporary
	id, err := s.identity.CreateStaff(ctx, username, first, last, in.Password, temporary, roles)
	switch {
	case errors.Is(err, identity.ErrConflict):
		return fail[AdminCreateStaffdefaultApplicationProblemPlusJSONResponse](conflict(ctx, "the username is taken")), nil
	case errors.Is(err, identity.ErrBadPassword):
		return fail[AdminCreateStaffdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "the password was refused by the password policy")), nil
	case err != nil:
		return nil, fmt.Errorf("create staff: %w", err)
	}
	if err := s.auditStaff(ctx, p, "staff.create", id, map[string]any{"username": username, "roles": roles, "temporary": temporary}); err != nil {
		return nil, err
	}
	member := identity.StaffMember{ID: id, Username: username, FirstName: first, LastName: last, Enabled: true, Roles: roles}
	return AdminCreateStaff201JSONResponse(staffOf(member)), nil
}

// AdminUpdateStaff changes a staff account's name, roles and access (admin only; not your own roles or access).
func (s *Server) AdminUpdateStaff(ctx context.Context, req AdminUpdateStaffRequestObject) (AdminUpdateStaffResponseObject, error) {
	p, pr := requireRoles(ctx, rolesGrantAccess...)
	if pr != nil {
		return fail[AdminUpdateStaffdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	if s.identity == nil {
		return fail[AdminUpdateStaffdefaultApplicationProblemPlusJSONResponse](noIdentity(ctx)), nil
	}
	in := req.Body
	first, last := strings.TrimSpace(in.FirstName), strings.TrimSpace(orElse(in.LastName, ""))
	roles, ok := staffRoles(in.Roles)
	if first == "" || len([]rune(first)) > 60 || len([]rune(last)) > 60 || !ok {
		return fail[AdminUpdateStaffdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "first name 1–60 characters, last name up to 60, one or more staff roles")), nil
	}
	if (pgtype.UUID{Bytes: req.Id, Valid: true}) == p.ID {
		mine := slices.DeleteFunc(slices.Clone(p.Roles), func(r string) bool { return !slices.Contains(identity.StaffRoles, r) })
		slices.Sort(mine)
		want := slices.Clone(roles)
		slices.Sort(want)
		if !in.Enabled || !slices.Equal(mine, want) {
			return fail[AdminUpdateStaffdefaultApplicationProblemPlusJSONResponse](conflict(ctx, "you can't change your own roles or access")), nil
		}
	}
	staff, err := s.isStaff(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	if !staff {
		return fail[AdminUpdateStaffdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "staff account")), nil
	}
	id := req.Id.String()
	if err := s.identity.UpdateStaff(ctx, id, first, last, in.Enabled); err != nil {
		return nil, fmt.Errorf("update staff: %w", err)
	}
	if err := s.identity.SetStaffRoles(ctx, id, roles); err != nil {
		return nil, fmt.Errorf("update staff: %w", err)
	}
	if err := s.auditStaff(ctx, p, "staff.update", id, map[string]any{"roles": roles, "enabled": in.Enabled}); err != nil {
		return nil, err
	}
	list, err := s.identity.ListStaff(ctx)
	if err != nil {
		return nil, fmt.Errorf("update staff: %w", err)
	}
	for _, m := range list {
		if m.ID == id {
			return AdminUpdateStaff200JSONResponse(staffOf(m)), nil
		}
	}
	// No staff role is left only if roles was empty, which the check above refuses; answer what was saved.
	return AdminUpdateStaff200JSONResponse(staffOf(identity.StaffMember{ID: id, FirstName: first, LastName: last, Enabled: in.Enabled, Roles: roles})), nil
}

// AdminSetStaffPassword sets a new password for a staff account (admin only; customers' passwords are never set here).
func (s *Server) AdminSetStaffPassword(ctx context.Context, req AdminSetStaffPasswordRequestObject) (AdminSetStaffPasswordResponseObject, error) {
	p, pr := requireRoles(ctx, rolesGrantAccess...)
	if pr != nil {
		return fail[AdminSetStaffPassworddefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	if s.identity == nil {
		return fail[AdminSetStaffPassworddefaultApplicationProblemPlusJSONResponse](noIdentity(ctx)), nil
	}
	if len(req.Body.Password) < 10 || len(req.Body.Password) > 128 {
		return fail[AdminSetStaffPassworddefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "password: 10–128 characters")), nil
	}
	staff, err := s.isStaff(ctx, req.Id)
	if err != nil {
		return nil, err
	}
	if !staff {
		return fail[AdminSetStaffPassworddefaultApplicationProblemPlusJSONResponse](notFound(ctx, "staff account")), nil
	}
	temporary := req.Body.Temporary != nil && *req.Body.Temporary
	err = s.identity.SetPassword(ctx, req.Id.String(), req.Body.Password, temporary)
	switch {
	case errors.Is(err, identity.ErrBadPassword):
		return fail[AdminSetStaffPassworddefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "the password was refused by the password policy")), nil
	case errors.Is(err, identity.ErrUserNotFound):
		return fail[AdminSetStaffPassworddefaultApplicationProblemPlusJSONResponse](notFound(ctx, "staff account")), nil
	case err != nil:
		return nil, fmt.Errorf("set staff password: %w", err)
	}
	if err := s.auditStaff(ctx, p, "staff.password", req.Id.String(), map[string]bool{"temporary": temporary}); err != nil {
		return nil, err
	}
	return AdminSetStaffPassword204Response{}, nil
}
