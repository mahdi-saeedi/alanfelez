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

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/content"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/identity"
)

// Staff accounts from the admin (client 2026-11-03/04, owner OK'd by phone): the admin creates, re-roles, resets and
// turns off staff accounts in Keycloak through the API's service account. Admin role only; every change is audited.

// StaffDirectory is the part of Keycloak's Admin API for staff accounts (internal/identity; a fake in tests).
type StaffDirectory interface {
	ListStaff(ctx context.Context) ([]identity.StaffUser, error)
	CreateStaff(ctx context.Context, n identity.NewStaff) (string, error)
	SetStaffRole(ctx context.Context, userID, role string) error
	SetEnabled(ctx context.Context, userID string, enabled bool) error
	ResetPassword(ctx context.Context, userID, password string) error
}

// WithStaffDirectory connects the staff page to Keycloak (default: none, answering UPSTREAM_UNAVAILABLE).
func WithStaffDirectory(d StaffDirectory) Option { return func(s *Server) { s.staff = d } }

var staffUsername = regexp.MustCompile(`^[a-z][a-z0-9._-]{2,29}$`)

const minStaffPassword = 10

func (s *Server) staffOff(ctx context.Context) Problem {
	return problem(ctx, http.StatusServiceUnavailable, codeUpstream, "Staff accounts are not set up",
		"the API has no Keycloak service account (secret alanfelez-keycloak-api-admin)")
}

// AdminListStaff lists the staff accounts.
func (s *Server) AdminListStaff(ctx context.Context, _ AdminListStaffRequestObject) (AdminListStaffResponseObject, error) {
	type bad = AdminListStaffdefaultApplicationProblemPlusJSONResponse
	if _, pr := requireRoles(ctx, rolesGrantAccess...); pr != nil {
		return fail[bad](*pr), nil
	}
	if s.staff == nil {
		return fail[bad](s.staffOff(ctx)), nil
	}
	users, err := s.staff.ListStaff(ctx)
	if err != nil {
		return nil, fmt.Errorf("list staff: %w", err)
	}
	out := make([]StaffMember, 0, len(users))
	for _, u := range users {
		m, ok := staffMemberOf(u)
		if ok {
			out = append(out, m)
		}
	}
	return AdminListStaff200JSONResponse{Items: out}, nil
}

// AdminCreateStaff creates a staff account with a temporary password.
func (s *Server) AdminCreateStaff(ctx context.Context, req AdminCreateStaffRequestObject) (AdminCreateStaffResponseObject, error) {
	type bad = AdminCreateStaffdefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesGrantAccess...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	if s.staff == nil {
		return fail[bad](s.staffOff(ctx)), nil
	}
	in := req.Body
	username := strings.TrimSpace(in.Username)
	first, okF := content.Clean(in.FirstName, 1, 60)
	last, okL := content.Clean(in.LastName, 1, 60)
	switch {
	case !staffUsername.MatchString(username):
		return fail[bad](badRequest(ctx, "username: latin lowercase letters, digits, . _ -, starting with a letter, 3–30")), nil
	case !okF || !okL:
		return fail[bad](badRequest(ctx, "first and last name are required (at most 60 characters)")), nil
	case !slices.Contains(identity.StaffRoles, in.Role):
		return fail[bad](badRequest(ctx, "unknown role")), nil
	case len([]rune(in.Password)) < minStaffPassword || len(in.Password) > 100:
		return fail[bad](badRequest(ctx, "the temporary password must be at least 10 characters")), nil
	}
	id, err := s.staff.CreateStaff(ctx, identity.NewStaff{Username: username, FirstName: first, LastName: last, Role: in.Role, Password: in.Password})
	if errors.Is(err, identity.ErrUsernameTaken) {
		return fail[bad](conflict(ctx, "this username is taken")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("create staff: %w", err)
	}
	if err := s.auditStaff(ctx, p, "staff.create", id, map[string]any{"username": username, "role": in.Role}); err != nil {
		return nil, err
	}
	uid, _ := uuid.Parse(id)
	return AdminCreateStaff201JSONResponse{Id: uid, Username: username, FirstName: first, LastName: last, Role: in.Role, Enabled: true}, nil
}

// AdminUpdateStaff changes a staff member's role or turns the account on or off.
func (s *Server) AdminUpdateStaff(ctx context.Context, req AdminUpdateStaffRequestObject) (AdminUpdateStaffResponseObject, error) {
	type bad = AdminUpdateStaffdefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesGrantAccess...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	if s.staff == nil {
		return fail[bad](s.staffOff(ctx)), nil
	}
	if req.Id == uuid.UUID(p.ID.Bytes) {
		return fail[bad](conflict(ctx, "you can't change your own account here")), nil
	}
	if found, err := s.isStaff(ctx, req.Id); err != nil {
		return nil, err
	} else if !found {
		return fail[bad](notFound(ctx, "staff member")), nil
	}
	id := req.Id.String()
	data := map[string]any{}
	if r := req.Body.Role; r != nil {
		if !slices.Contains(identity.StaffRoles, *r) {
			return fail[bad](badRequest(ctx, "unknown role")), nil
		}
		if err := s.staff.SetStaffRole(ctx, id, *r); err != nil {
			return nil, fmt.Errorf("staff role: %w", err)
		}
		data["role"] = *r
	}
	if e := req.Body.Enabled; e != nil {
		if err := s.staff.SetEnabled(ctx, id, *e); err != nil {
			return nil, fmt.Errorf("staff enabled: %w", err)
		}
		data["enabled"] = *e
	}
	if len(data) > 0 {
		if err := s.auditStaff(ctx, p, "staff.update", id, data); err != nil {
			return nil, err
		}
	}
	return AdminUpdateStaff204Response{}, nil
}

// AdminResetStaffPassword gives a staff member a new temporary password.
func (s *Server) AdminResetStaffPassword(ctx context.Context, req AdminResetStaffPasswordRequestObject) (AdminResetStaffPasswordResponseObject, error) {
	type bad = AdminResetStaffPassworddefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesGrantAccess...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	if s.staff == nil {
		return fail[bad](s.staffOff(ctx)), nil
	}
	if len([]rune(req.Body.Password)) < minStaffPassword || len(req.Body.Password) > 100 {
		return fail[bad](badRequest(ctx, "the temporary password must be at least 10 characters")), nil
	}
	if found, err := s.isStaff(ctx, req.Id); err != nil {
		return nil, err
	} else if !found {
		return fail[bad](notFound(ctx, "staff member")), nil
	}
	if err := s.staff.ResetPassword(ctx, req.Id.String(), req.Body.Password); err != nil {
		return nil, fmt.Errorf("staff password: %w", err)
	}
	if err := s.auditStaff(ctx, p, "staff.password_reset", req.Id.String(), nil); err != nil { // never the password
		return nil, err
	}
	return AdminResetStaffPassword204Response{}, nil
}

// isStaff reports whether id is a staff account (only staff accounts are managed here, never customers).
func (s *Server) isStaff(ctx context.Context, id uuid.UUID) (bool, error) {
	users, err := s.staff.ListStaff(ctx)
	if err != nil {
		return false, fmt.Errorf("list staff: %w", err)
	}
	return slices.ContainsFunc(users, func(u identity.StaffUser) bool { return u.ID == id.String() }), nil
}

func (s *Server) auditStaff(ctx context.Context, p *auth.Principal, action, id string, data map[string]any) error {
	return s.tx(ctx, func(q *dbq.Queries) error {
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: action, Entity: "staff", EntityID: id, Data: data})
	})
}

func staffMemberOf(u identity.StaffUser) (StaffMember, bool) {
	id, err := uuid.Parse(u.ID)
	if err != nil {
		return StaffMember{}, false
	}
	return StaffMember{
		Id: id, Username: u.Username, FirstName: u.FirstName, LastName: u.LastName, Role: u.Role,
		Enabled: u.Enabled, Totp: u.TOTP, CreatedAt: u.CreatedAt,
	}, true
}
