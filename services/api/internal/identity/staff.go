package identity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"slices"
	"sort"
	"time"
)

// StaffRoles are the realm roles that make a Keycloak user a staff member (admin «پرسنل», client 2026-11-03, owner OK
// by phone). Each is a composite of `staff`, which makes the two-step sign-in mandatory.
var StaffRoles = []string{"admin", "editor", "support", "sales"}

// ErrConflict means the username is taken. ErrBadPassword means Keycloak's password policy refused the password.
var (
	ErrConflict    = errors.New("identity: username taken")
	ErrBadPassword = errors.New("identity: password refused by the policy")
)

// StaffMember is one staff account.
type StaffMember struct {
	ID, Username, FirstName, LastName string
	Enabled, TOTP                     bool
	Roles                             []string // staff roles held directly
	CreatedAt                         time.Time
}

type kcUser struct {
	ID        string         `json:"id,omitempty"`
	Username  string         `json:"username,omitempty"`
	FirstName string         `json:"firstName"`
	LastName  string         `json:"lastName"`
	Enabled   bool           `json:"enabled"`
	Created   int64          `json:"createdTimestamp,omitempty"`
	Creds     []kcCredential `json:"credentials,omitempty"`
}

type kcCredential struct {
	Type      string `json:"type"`
	Value     string `json:"value,omitempty"`
	Temporary bool   `json:"temporary"`
}

type kcRole struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ListStaff returns every user holding a staff role, by username.
func (k *Keycloak) ListStaff(ctx context.Context) ([]StaffMember, error) {
	byID := map[string]*StaffMember{}
	for _, role := range StaffRoles {
		var users []kcUser
		err := k.getJSON(ctx, "/roles/"+url.PathEscape(role)+"/users?first=0&max=1000&briefRepresentation=false", &users)
		if errors.Is(err, ErrUserNotFound) {
			continue // the role doesn't exist yet in this realm (sales, before the keycloak-profile job ran)
		}
		if err != nil {
			return nil, fmt.Errorf("identity: staff with role %s: %w", role, err)
		}
		for _, u := range users {
			m := byID[u.ID]
			if m == nil {
				m = &StaffMember{ID: u.ID, Username: u.Username, FirstName: u.FirstName, LastName: u.LastName, Enabled: u.Enabled,
					CreatedAt: time.UnixMilli(u.Created).UTC()}
				byID[u.ID] = m
			}
			m.Roles = append(m.Roles, role)
		}
	}
	out := make([]StaffMember, 0, len(byID))
	for _, m := range byID {
		var creds []kcCredential
		if err := k.getJSON(ctx, "/users/"+url.PathEscape(m.ID)+"/credentials", &creds); err == nil {
			m.TOTP = slices.ContainsFunc(creds, func(c kcCredential) bool { return c.Type == "otp" })
		}
		out = append(out, *m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Username < out[j].Username })
	return out, nil
}

// CreateStaff makes an enabled account with a password and the given staff roles, and returns its id.
func (k *Keycloak) CreateStaff(ctx context.Context, username, first, last, password string, temporary bool, roles []string) (string, error) {
	res, err := k.do(ctx, http.MethodPost, "/users", kcUser{
		Username: username, FirstName: first, LastName: last, Enabled: true,
		Creds: []kcCredential{{Type: "password", Value: password, Temporary: temporary}},
	})
	if err != nil {
		return "", err
	}
	defer func() { _ = res.Body.Close() }()
	switch {
	case res.StatusCode == http.StatusConflict:
		return "", ErrConflict
	case res.StatusCode == http.StatusBadRequest:
		return "", fmt.Errorf("%w: %w", ErrBadPassword, statusError("create staff", res))
	case res.StatusCode != http.StatusCreated:
		return "", statusError("create staff", res)
	}
	id := path.Base(res.Header.Get("Location"))
	if id == "" || id == "." || id == "/" {
		return "", errors.New("identity: create staff: no Location in the answer")
	}
	return id, k.SetStaffRoles(ctx, id, roles)
}

// SetStaffRoles makes the user's direct staff roles exactly roles (other realm roles are left alone).
func (k *Keycloak) SetStaffRoles(ctx context.Context, userID string, roles []string) error {
	base := "/users/" + url.PathEscape(userID) + "/role-mappings/realm"
	var have, available []kcRole
	if err := k.getJSON(ctx, base, &have); err != nil {
		return fmt.Errorf("identity: staff roles: %w", err)
	}
	if err := k.getJSON(ctx, base+"/available", &available); err != nil {
		return fmt.Errorf("identity: staff roles: %w", err)
	}
	var add, remove []kcRole
	for _, r := range available {
		if slices.Contains(roles, r.Name) && slices.Contains(StaffRoles, r.Name) {
			add = append(add, r)
		}
	}
	for _, r := range have {
		if !slices.Contains(roles, r.Name) && slices.Contains(StaffRoles, r.Name) {
			remove = append(remove, r)
		}
	}
	for _, step := range []struct {
		method string
		roles  []kcRole
	}{{http.MethodPost, add}, {http.MethodDelete, remove}} {
		if len(step.roles) == 0 {
			continue
		}
		if err := k.expect(ctx, step.method, base, step.roles, http.StatusNoContent); err != nil {
			return fmt.Errorf("identity: staff roles: %w", err)
		}
	}
	return nil
}

// UpdateStaff changes the name and whether the account may sign in (disabling ends its sessions at the next refresh).
func (k *Keycloak) UpdateStaff(ctx context.Context, userID, first, last string, enabled bool) error {
	var u map[string]any // the full representation, so nothing else (attributes, email) is lost by the PUT
	if err := k.getJSON(ctx, "/users/"+url.PathEscape(userID), &u); err != nil {
		return fmt.Errorf("identity: update staff: %w", err)
	}
	u["firstName"], u["lastName"], u["enabled"] = first, last, enabled
	if err := k.expect(ctx, http.MethodPut, "/users/"+url.PathEscape(userID), u, http.StatusNoContent); err != nil {
		return fmt.Errorf("identity: update staff: %w", err)
	}
	if !enabled {
		_ = k.expect(ctx, http.MethodPost, "/users/"+url.PathEscape(userID)+"/logout", nil, http.StatusNoContent)
	}
	return nil
}

// SetPassword sets a new password (temporary = must be changed at the next sign-in).
func (k *Keycloak) SetPassword(ctx context.Context, userID, password string, temporary bool) error {
	res, err := k.do(ctx, http.MethodPut, "/users/"+url.PathEscape(userID)+"/reset-password", kcCredential{Type: "password", Value: password, Temporary: temporary})
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	switch res.StatusCode {
	case http.StatusNoContent:
		return nil
	case http.StatusNotFound:
		return ErrUserNotFound
	case http.StatusBadRequest:
		return fmt.Errorf("%w: %w", ErrBadPassword, statusError("set password", res))
	}
	return statusError("set password", res)
}

// DisplayName is the user's name for the sales notes ("first last", else the username).
func (k *Keycloak) DisplayName(ctx context.Context, userID string) (string, error) {
	var u kcUser
	if err := k.getJSON(ctx, "/users/"+url.PathEscape(userID), &u); err != nil {
		return "", err
	}
	switch {
	case u.FirstName != "" && u.LastName != "":
		return u.FirstName + " " + u.LastName, nil
	case u.FirstName != "":
		return u.FirstName, nil
	}
	return u.Username, nil
}

// getJSON GETs path and decodes the answer; a 404 is ErrUserNotFound.
func (k *Keycloak) getJSON(ctx context.Context, p string, out any) error {
	res, err := k.do(ctx, http.MethodGet, p)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode == http.StatusNotFound {
		return ErrUserNotFound
	}
	if res.StatusCode != http.StatusOK {
		return statusError("GET "+p, res)
	}
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return fmt.Errorf("identity: GET %s: %w", p, err)
	}
	return nil
}

// expect sends a request with a JSON body (nil = none) and wants the given status; a 404 is ErrUserNotFound.
func (k *Keycloak) expect(ctx context.Context, method, p string, body any, want int) error {
	var res *http.Response
	var err error
	if body == nil {
		res, err = k.do(ctx, method, p)
	} else {
		res, err = k.do(ctx, method, p, body)
	}
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode == http.StatusNotFound {
		return ErrUserNotFound
	}
	if res.StatusCode != want {
		return statusError(method+" "+p, res)
	}
	return nil
}
