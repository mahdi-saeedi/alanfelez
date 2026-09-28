package api

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/httpx"
)

// Problem codes used by these handlers (catalog: docs/architecture/API_GUIDELINES.md §4).
const (
	codeUnauthenticated = "UNAUTHENTICATED"
	codeForbidden       = "FORBIDDEN"
	codeFeatureLocked   = "FEATURE_LOCKED"
	codeConflict        = "CONFLICT"
	codePriceJump       = "PRICE_JUMP"
)

func problem(ctx context.Context, status int, code, title, detail string) Problem {
	p := Problem{Type: "https://alanfelez.ir/problems/" + code, Title: title, Status: status, Code: code}
	if detail != "" {
		p.Detail = &detail
	}
	if id := middleware.GetReqID(ctx); id != "" {
		p.RequestId = &id
	}
	return p
}

// lockedProblem is the 403 for a feature the caller's tier doesn't include. It names the plan that unlocks it
// so the UI can show «ارتقا به …».
func lockedProblem(ctx context.Context, f access.Feature) Problem {
	p := problem(ctx, http.StatusForbidden, codeFeatureLocked, "Feature locked", "")
	feature := string(f)
	p.Feature = &feature
	if t, ok := access.RequiredTier(f); ok {
		plan := Tier(t)
		p.RequiredPlan = &plan
	}
	return p
}

func notFound(ctx context.Context, what string) Problem {
	return problem(ctx, http.StatusNotFound, httpx.CodeNotFound, "Not found", what)
}

func badRequest(ctx context.Context, detail string) Problem {
	return problem(ctx, http.StatusBadRequest, httpx.CodeValidationFailed, "Invalid request", detail)
}

// requireRoles returns the caller when they have at least one of roles, or the 401/403 problem to answer.
func requireRoles(ctx context.Context, roles ...string) (*auth.Principal, *Problem) {
	p := auth.FromContext(ctx)
	if p == nil {
		pr := problem(ctx, http.StatusUnauthorized, codeUnauthenticated, "Authentication required", "")
		return nil, &pr
	}
	if !p.HasAnyRole(roles...) {
		pr := problem(ctx, http.StatusForbidden, codeForbidden, "Not allowed", "missing role")
		return nil, &pr
	}
	return p, nil
}

func actorOf(ctx context.Context, p *auth.Principal) audit.Actor {
	return audit.Actor{ID: p.ID, Name: p.Username, RequestID: middleware.GetReqID(ctx)}
}

func strp(s string) *string { return &s }

func i64s(v int64) string { return strconv.FormatInt(v, 10) }

func textp(t pgtype.Text) *string {
	if !t.Valid || t.String == "" {
		return nil
	}
	return &t.String
}

func timep(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time.UTC()
	return &v
}

func uuidString(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	s := uuid.UUID(u.Bytes).String()
	return &s
}

// parseAmount parses a non-negative integer minor-unit amount.
func parseAmount(s string) (int64, bool) {
	v, err := strconv.ParseInt(s, 10, 64)
	return v, err == nil && v > 0
}

// cacheControl for responses that depend on the caller: public for anonymous callers (CDN-cacheable for a few
// seconds), private otherwise.
func cacheControl(ctx context.Context, maxAge int) *string {
	if auth.FromContext(ctx) != nil {
		return strp("private, no-store")
	}
	return strp("public, max-age=" + strconv.Itoa(maxAge) + ", stale-while-revalidate=" + strconv.Itoa(maxAge*6))
}
