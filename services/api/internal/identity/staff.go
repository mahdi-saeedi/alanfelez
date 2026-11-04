package identity

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

// Staff accounts from the admin (client, 2026-11-03/04; owner OK'd): the admin creates a staff member with a
// username and a temporary password; on first sign-in Keycloak makes them choose their own password and set up TOTP
// (the realm's staff 2FA). Needs realm-management's manage-users, view-users and view-realm (keycloak-profile job).

// StaffRoles are the roles a staff account can have, lowest first. "staff" alone = read-only (e.g. sales).
var StaffRoles = []string{"staff", "support", "editor", "admin"}

// ErrUsernameTaken means Keycloak already has that username.
var ErrUsernameTaken = errors.New("identity: username taken")

// StaffUser is a staff account as the admin lists it.
type StaffUser struct {
	ID, Username, FirstName, LastName, Role string
	Enabled                                 bool
	CreatedAt                               time.Time
	TOTP                                    bool // has set up two-step sign-in
}

// NewStaff is a staff account to create.
type NewStaff struct {
	Username, FirstName, LastName, Role, Password string
}

// ListStaff returns every account with the staff role (directly or through admin, editor or support).
func (k *Keycloak) ListStaff(ctx context.Context) ([]StaffUser, error) {
	seen := map[string]*StaffUser{}
	order := []string{}
	for _, role := range StaffRoles {
		var users []struct {
			ID               string `json:"id"`
			Username         string `json:"username"`
			FirstName        string `json:"firstName"`
			LastName         string `json:"lastName"`
			Enabled          bool   `json:"enabled"`
			CreatedTimestamp int64  `json:"createdTimestamp"`
		}
		if err := k.getJSON(ctx, "/roles/"+url.PathEscape(role)+"/users?first=0&max=500", &users); err != nil {
			return nil, err
		}
		for _, u := range users {
			if s, ok := seen[u.ID]; ok {
				s.Role = role // roles are walked lowest first: the last one seen is the highest
				continue
			}
			seen[u.ID] = &StaffUser{ID: u.ID, Username: u.Username, FirstName: u.FirstName, LastName: u.LastName,
				Enabled: u.Enabled, Role: role, CreatedAt: time.UnixMilli(u.CreatedTimestamp).UTC()}
			order = append(order, u.ID)
		}
	}
	out := make([]StaffUser, 0, len(order))
	for _, id := range order {
		s := seen[id]
		var creds []struct {
			Type string `json:"type"`
		}
		if err := k.getJSON(ctx, "/users/"+url.PathEscape(id)+"/credentials", &creds); err != nil {
			return nil, err
		}
		s.TOTP = slices.ContainsFunc(creds, func(c struct {
			Type string `json:"type"`
		}) bool {
			return c.Type == "otp"
		})
		out = append(out, *s)
	}
	return out, nil
}

// CreateStaff creates an enabled staff account with a temporary password (changed at first sign-in, with TOTP set
// up then) and the given role. It returns the new user's id.
func (k *Keycloak) CreateStaff(ctx context.Context, n NewStaff) (string, error) {
	body := map[string]any{
		"username": n.Username, "firstName": n.FirstName, "lastName": n.LastName, "enabled": true,
		"requiredActions": []string{"UPDATE_PASSWORD", "CONFIGURE_TOTP"},
		"credentials":     []map[string]any{{"type": "password", "value": n.Password, "temporary": true}},
	}
	res, err := k.send(ctx, http.MethodPost, "/users", body)
	if err != nil {
		return "", err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode == http.StatusConflict {
		return "", ErrUsernameTaken
	}
	if res.StatusCode != http.StatusCreated {
		return "", statusError("create staff", res)
	}
	loc := res.Header.Get("Location")
	id := loc[strings.LastIndex(loc, "/")+1:]
	if id == "" {
		return "", errors.New("identity: create staff: no id in the answer")
	}
	if err := k.SetStaffRole(ctx, id, n.Role); err != nil {
		_ = k.DeleteUser(ctx, id) // don't leave an account without its role behind
		return "", err
	}
	return id, nil
}

// SetStaffRole gives the user exactly one of StaffRoles (removing the others it has directly).
func (k *Keycloak) SetStaffRole(ctx context.Context, userID, role string) error {
	if !slices.Contains(StaffRoles, role) {
		return fmt.Errorf("identity: unknown staff role %q", role)
	}
	path := "/users/" + url.PathEscape(userID) + "/role-mappings/realm"
	var has []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := k.getJSON(ctx, path, &has); err != nil {
		return err
	}
	var others []any // the staff roles the user has directly, other than the new one
	for _, h := range has {
		if h.Name != role && slices.Contains(StaffRoles, h.Name) {
			others = append(others, map[string]string{"id": h.ID, "name": h.Name})
		}
	}
	if len(others) > 0 {
		if err := k.expect(ctx, http.MethodDelete, path, others, "remove staff roles"); err != nil {
			return err
		}
	}
	var rep json.RawMessage
	if err := k.getJSON(ctx, "/roles/"+url.PathEscape(role), &rep); err != nil {
		return err
	}
	return k.expect(ctx, http.MethodPost, path, []json.RawMessage{rep}, "add staff role")
}

// SetEnabled turns an account on or off; turning it off also ends its sessions.
func (k *Keycloak) SetEnabled(ctx context.Context, userID string, enabled bool) error {
	if err := k.expect(ctx, http.MethodPut, "/users/"+url.PathEscape(userID), map[string]any{"enabled": enabled}, "enable user"); err != nil {
		return err
	}
	if !enabled {
		return k.expect(ctx, http.MethodPost, "/users/"+url.PathEscape(userID)+"/logout", nil, "sign out user")
	}
	return nil
}

// ResetPassword sets a temporary password: the user must choose their own at the next sign-in.
func (k *Keycloak) ResetPassword(ctx context.Context, userID, password string) error {
	return k.expect(ctx, http.MethodPut, "/users/"+url.PathEscape(userID)+"/reset-password",
		map[string]any{"type": "password", "value": password, "temporary": true}, "reset password")
}

// getJSON GETs path and decodes the answer (404 → ErrUserNotFound).
func (k *Keycloak) getJSON(ctx context.Context, path string, out any) error {
	res, err := k.do(ctx, http.MethodGet, path)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode == http.StatusNotFound {
		return ErrUserNotFound
	}
	if res.StatusCode != http.StatusOK {
		return statusError("GET "+path, res)
	}
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return fmt.Errorf("identity: %s: %w", path, err)
	}
	return nil
}

// expect sends body as JSON and wants 204 No Content (404 → ErrUserNotFound).
func (k *Keycloak) expect(ctx context.Context, method, path string, body any, what string) error {
	res, err := k.send(ctx, method, path, body)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode == http.StatusNotFound {
		return ErrUserNotFound
	}
	if res.StatusCode != http.StatusNoContent {
		return statusError(what, res)
	}
	return nil
}

// send is do with a JSON body (nil = none).
func (k *Keycloak) send(ctx context.Context, method, path string, body any) (*http.Response, error) {
	tok, err := k.token(ctx)
	if err != nil {
		return nil, err
	}
	var rd *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("identity: %w", err)
		}
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, k.base+"/admin/realms/"+url.PathEscape(k.realm)+path, rd)
	if err != nil {
		return nil, fmt.Errorf("identity: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := k.hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("identity: %s %s: %w", method, path, err)
	}
	return res, nil
}
