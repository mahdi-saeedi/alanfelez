// Package auth validates Keycloak access tokens (ADR-0005) and carries the caller in the request context.
//
// The API only accepts bearer tokens (SECURITY T9). A request without a token is anonymous; a request with an
// invalid or expired token is rejected with 401, never silently downgraded to anonymous.
package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/jackc/pgx/v5/pgtype"
)

// Realm roles (services/keycloak/realm). admin, editor and support are composites of staff.
const (
	RoleStaff   = "staff"
	RoleAdmin   = "admin"
	RoleEditor  = "editor"
	RoleSupport = "support"
)

// Principal is the authenticated caller.
type Principal struct {
	ID         pgtype.UUID // token `sub` (Keycloak user id)
	Username   string      // customers: their mobile number (09121234567)
	GivenName  string
	FamilyName string
	Email      string
	Roles      []string // effective realm roles (Keycloak expands composites)
	// The sign-up form's answers (web tokens only; empty for staff and accounts made before the form).
	Activity string
	Metals   []string
	Province string
}

// HasRole reports whether the caller has role r.
func (p *Principal) HasRole(r string) bool { return p != nil && slices.Contains(p.Roles, r) }

// HasAnyRole reports whether the caller has at least one of roles.
func (p *Principal) HasAnyRole(roles ...string) bool {
	for _, r := range roles {
		if p.HasRole(r) {
			return true
		}
	}
	return false
}

type ctxKey struct{}

// FromContext returns the caller, or nil for anonymous requests.
func FromContext(ctx context.Context) *Principal {
	p, _ := ctx.Value(ctxKey{}).(*Principal)
	return p
}

// WithPrincipal returns ctx carrying p (tests, background jobs).
func WithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, ctxKey{}, p)
}

// Verifier checks access tokens.
type Verifier interface {
	Verify(ctx context.Context, raw string) (*Principal, error)
}

// OIDCVerifier verifies Keycloak access tokens: signature (JWKS), issuer, audience and expiry.
type OIDCVerifier struct{ v *oidc.IDTokenVerifier }

// NewOIDCVerifier builds a verifier. issuer is the public issuer (the `iss` claim); jwksURL may point at an
// internal address of the same Keycloak. Keys are fetched lazily and cached, so the API starts even while
// Keycloak is still booting.
func NewOIDCVerifier(ctx context.Context, issuer, jwksURL, audience string) *OIDCVerifier {
	if jwksURL == "" {
		jwksURL = strings.TrimSuffix(issuer, "/") + "/protocol/openid-connect/certs"
	}
	keys := oidc.NewRemoteKeySet(ctx, jwksURL)
	return &OIDCVerifier{v: oidc.NewVerifier(issuer, keys, &oidc.Config{
		ClientID:             audience, // checks that `aud` contains the API
		SupportedSigningAlgs: []string{oidc.RS256},
	})}
}

type claims struct {
	Sub         string   `json:"sub"`
	Username    string   `json:"preferred_username"`
	GivenName   string   `json:"given_name"`
	FamilyName  string   `json:"family_name"`
	Email       string   `json:"email"`
	Activity    string   `json:"activity"`
	Metals      []string `json:"metals"`
	Province    string   `json:"province"`
	RealmAccess struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
	// Roles is the flat claim the admin client's realm-roles mapper adds; merged with realm_access.roles.
	Roles []string `json:"roles"`
}

// Verify implements Verifier.
func (o *OIDCVerifier) Verify(ctx context.Context, raw string) (*Principal, error) {
	tok, err := o.v.Verify(ctx, raw)
	if err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}
	var c claims
	if err := tok.Claims(&c); err != nil {
		return nil, fmt.Errorf("auth: claims: %w", err)
	}
	var id pgtype.UUID
	if err := id.Scan(c.Sub); err != nil {
		return nil, fmt.Errorf("auth: sub is not a uuid: %w", err)
	}
	return &Principal{
		ID: id, Username: c.Username, GivenName: c.GivenName, FamilyName: c.FamilyName, Email: c.Email,
		Roles:    mergeRoles(c.RealmAccess.Roles, c.Roles),
		Activity: c.Activity, Metals: c.Metals, Province: c.Province,
	}, nil
}

// mergeRoles unions realm_access.roles (web tokens) with the flat roles claim (admin tokens), without duplicates.
func mergeRoles(realm, flat []string) []string {
	out := slices.Clone(realm)
	for _, r := range flat {
		if !slices.Contains(out, r) {
			out = append(out, r)
		}
	}
	return out
}

// ErrUnauthenticated is returned for a missing token on a protected route.
var ErrUnauthenticated = errors.New("unauthenticated")

// Middleware attaches the caller to the request context. onFail writes the 401 response.
func Middleware(v Verifier, onFail func(http.ResponseWriter, *http.Request, error)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := r.Header.Get("Authorization")
			if h == "" {
				next.ServeHTTP(w, r)
				return
			}
			raw, ok := strings.CutPrefix(h, "Bearer ")
			if !ok || raw == "" {
				onFail(w, r, errors.New("auth: Authorization must be a Bearer token"))
				return
			}
			p, err := v.Verify(r.Context(), raw)
			if err != nil {
				onFail(w, r, err)
				return
			}
			next.ServeHTTP(w, r.WithContext(WithPrincipal(r.Context(), p)))
		})
	}
}
