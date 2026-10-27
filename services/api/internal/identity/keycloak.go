// Package identity talks to Keycloak's Admin API for the few account actions the API does itself (deleting a user).
// It signs in as the alanfelez-api-admin client: a service account whose only roles are realm-management's
// manage-users and view-users (created by the keycloak-profile job, secret alanfelez-keycloak-api-admin).
package identity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// ErrUserNotFound means Keycloak has no user with that id (never existed, or already deleted).
var ErrUserNotFound = errors.New("identity: user not found")

// Keycloak is an Admin API client for one realm. Safe for concurrent use.
type Keycloak struct {
	base, realm, clientID, secret string
	hc                            *http.Client

	mu  sync.Mutex
	tok string
	exp time.Time
}

// NewKeycloak returns a client for realm at base (e.g. http://alanfelez-keycloak:8080), or nil when secret is empty
// (the feature is off: no service-account secret in this environment).
func NewKeycloak(base, realm, clientID, secret string) *Keycloak {
	if secret == "" {
		return nil
	}
	return &Keycloak{
		base: strings.TrimSuffix(base, "/"), realm: realm, clientID: clientID, secret: secret,
		hc: &http.Client{Timeout: 10 * time.Second},
	}
}

// RealmRoles returns the user's effective realm roles (composites expanded), or ErrUserNotFound.
func (k *Keycloak) RealmRoles(ctx context.Context, userID string) ([]string, error) {
	res, err := k.do(ctx, http.MethodGet, "/users/"+url.PathEscape(userID)+"/role-mappings/realm/composite")
	if err != nil {
		return nil, err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode == http.StatusNotFound {
		return nil, ErrUserNotFound
	}
	if res.StatusCode != http.StatusOK {
		return nil, statusError("realm roles", res)
	}
	var roles []struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(res.Body).Decode(&roles); err != nil {
		return nil, fmt.Errorf("identity: realm roles: %w", err)
	}
	out := make([]string, 0, len(roles))
	for _, r := range roles {
		out = append(out, r.Name)
	}
	return out, nil
}

// DeleteUser deletes the user and so ends all their sessions. A user that is already gone is not an error.
func (k *Keycloak) DeleteUser(ctx context.Context, userID string) error {
	res, err := k.do(ctx, http.MethodDelete, "/users/"+url.PathEscape(userID))
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode == http.StatusNoContent || res.StatusCode == http.StatusNotFound {
		return nil
	}
	return statusError("delete user", res)
}

// do sends an authorised Admin API request; path is relative to /admin/realms/{realm}.
func (k *Keycloak) do(ctx context.Context, method, path string) (*http.Response, error) {
	tok, err := k.token(ctx)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, k.base+"/admin/realms/"+url.PathEscape(k.realm)+path, nil)
	if err != nil {
		return nil, fmt.Errorf("identity: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	res, err := k.hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("identity: %s %s: %w", method, path, err)
	}
	return res, nil
}

// token returns a cached service-account access token, fetching a new one shortly before it expires.
func (k *Keycloak) token(ctx context.Context) (string, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.tok != "" && time.Now().Before(k.exp) {
		return k.tok, nil
	}
	form := url.Values{"grant_type": {"client_credentials"}, "client_id": {k.clientID}, "client_secret": {k.secret}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		k.base+"/realms/"+url.PathEscape(k.realm)+"/protocol/openid-connect/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("identity: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := k.hc.Do(req)
	if err != nil {
		return "", fmt.Errorf("identity: token: %w", err)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return "", statusError("token", res)
	}
	var t struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(res.Body).Decode(&t); err != nil {
		return "", fmt.Errorf("identity: token: %w", err)
	}
	k.tok, k.exp = t.AccessToken, time.Now().Add(time.Duration(t.ExpiresIn)*time.Second-30*time.Second)
	return k.tok, nil
}

func statusError(what string, res *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(res.Body, 300))
	return fmt.Errorf("identity: %s: keycloak answered %d: %s", what, res.StatusCode, strings.TrimSpace(string(body)))
}
