//go:build integration

package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/alanfelez/alanfelez/services/api/internal/api"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/prices"
	"github.com/alanfelez/alanfelez/services/api/internal/prices/live"
	"github.com/alanfelez/alanfelez/services/api/internal/testdb"
)

// Tokens understood by the fake verifier.
var principals = map[string]*auth.Principal{
	"admin":   {ID: uid("00000000-0000-0000-0000-00000000000a"), Username: "admin", Roles: []string{auth.RoleStaff, auth.RoleAdmin}},
	"editor":  {ID: uid("00000000-0000-0000-0000-00000000000e"), Username: "editor", Roles: []string{auth.RoleStaff, auth.RoleEditor}},
	"support": {ID: uid("00000000-0000-0000-0000-00000000000c"), Username: "support", Roles: []string{auth.RoleStaff, auth.RoleSupport}},
	"user":    {ID: uid("00000000-0000-0000-0000-000000000001"), Username: "09120000001"},
	"silver":  {ID: uid("00000000-0000-0000-0000-000000000002"), Username: "09120000002"},
}

type fakeVerifier struct{}

func (fakeVerifier) Verify(_ context.Context, raw string) (*auth.Principal, error) {
	if p, ok := principals[raw]; ok {
		return p, nil
	}
	return nil, errors.New("bad token")
}

func uid(s string) pgtype.UUID {
	var u pgtype.UUID
	if err := u.Scan(s); err != nil {
		panic(err)
	}
	return u
}

type env struct {
	t      *testing.T
	pool   *pgxpool.Pool
	prices *prices.Service
	srv    *httptest.Server
}

func setup(t *testing.T) *env {
	t.Helper()
	pool := testdb.New(t)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	ps := prices.NewService(pool, nil, log)
	r := chi.NewRouter()
	api.Mount(r, api.NewServer(pool, ps), fakeVerifier{}, live.NewHub(nil, log), log)
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return &env{t: t, pool: pool, prices: ps, srv: srv}
}

// call does an HTTP request and returns the status and the decoded JSON body.
func (e *env) call(method, path, token string, body any) (int, map[string]any, string) {
	e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequestWithContext(e.t.Context(), method, e.srv.URL+path, rd)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	raw, _ := io.ReadAll(res.Body)
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	return res.StatusCode, m, string(raw)
}

// seedPrices publishes two days of prices for a base and a non-base series through the automated path.
func (e *env) seedPrices() {
	e.t.Helper()
	q := dbq.New(e.pool)
	if _, err := e.pool.Exec(e.t.Context(), `INSERT INTO market.sources (slug, name_fa, provider) VALUES ('test', 'آزمایشی', 'test')`); err != nil {
		e.t.Fatal(err)
	}
	src, err := q.GetSourceBySlug(e.t.Context(), "test")
	if err != nil {
		e.t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	quotes := []prices.Quote{
		{Series: "copper-red-free", ObservedAt: now.Add(-100 * 24 * time.Hour), Price: 6_000_000},
		{Series: "copper-red-free", ObservedAt: now.Add(-24 * time.Hour), Price: 6_400_000},
		{Series: "copper-red-free", ObservedAt: now.Add(-time.Minute), Price: 6_464_000},
		{Series: "copper-lme", ObservedAt: now.Add(-time.Minute), Price: 980_000},
	}
	res, err := e.prices.Ingest(e.t.Context(), prices.Origin{SourceID: src.ID}, quotes, prices.IngestOptions{})
	if err != nil {
		e.t.Fatal(err)
	}
	for _, r := range res {
		if r.Outcome != prices.Stored {
			e.t.Fatalf("seed quote %d: %s %s", r.Index, r.Outcome, r.Message)
		}
	}
}

func TestLockedSeriesNeverReachTheFreeTier(t *testing.T) {
	e := setup(t)
	e.seedPrices()

	for _, tok := range []string{"", "user"} {
		st, body, raw := e.call(http.MethodGet, "/v1/prices", tok, nil)
		if st != http.StatusOK {
			t.Fatalf("%q: status %d", tok, st)
		}
		if strings.Contains(raw, "copper-lme") || strings.Contains(raw, "980000") {
			t.Fatalf("%q: locked series leaked: %s", tok, raw)
		}
		if body["lockedCount"].(float64) < 1 {
			t.Fatalf("%q: lockedCount = %v", tok, body["lockedCount"])
		}
		// The base series has the price, the daily change and the source.
		items := body["items"].([]any)
		var copper map[string]any
		for _, it := range items {
			if m := it.(map[string]any); m["series"].(map[string]any)["slug"] == "copper-red-free" {
				copper = m
			}
		}
		if copper == nil || copper["price"].(map[string]any)["amount"] != "6464000" {
			t.Fatalf("%q: copper row = %v", tok, copper)
		}
		if ch := copper["change"].(map[string]any); ch["amount"] != "64000" || ch["bp"].(float64) != 100 {
			t.Fatalf("%q: change = %v, want +64000 / 100 bp", tok, ch)
		}
		if copper["source"] != "آزمایشی" {
			t.Fatalf("%q: source = %v", tok, copper["source"])
		}
	}

	// Non-base history is locked for free, as is a range beyond 30 days.
	if st, body, _ := e.call(http.MethodGet, "/v1/series/copper-lme/points", "user", nil); st != 403 || body["code"] != "FEATURE_LOCKED" || body["feature"] != "prices.full" || body["requiredPlan"] != "silver" {
		t.Fatalf("free non-base history: %d %v", st, body)
	}
	if st, body, _ := e.call(http.MethodGet, "/v1/series/copper-red-free/points?range=3M", "", nil); st != 403 || body["feature"] != "chart.full" {
		t.Fatalf("free 3M: %d %v", st, body)
	}
	st, body, _ := e.call(http.MethodGet, "/v1/series/copper-red-free/points?range=1M", "", nil)
	if st != 200 || len(body["points"].([]any)) != 2 {
		t.Fatalf("free 1M: %d %v", st, body)
	}
}

func TestPaidTierAfterManualGrant(t *testing.T) {
	e := setup(t)
	e.seedPrices()

	grant := map[string]any{"userId": "00000000-0000-0000-0000-000000000002", "plan": "silver", "days": 30, "note": "test"}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/subscriptions", "editor", grant); st != 403 {
		t.Fatalf("editor must not grant subscriptions: %d", st)
	}
	if st, body, _ := e.call(http.MethodPost, "/v1/admin/subscriptions", "admin", grant); st != 201 || body["plan"] != "silver" {
		t.Fatalf("grant: %d %v", st, body)
	}

	st, body, _ := e.call(http.MethodGet, "/v1/me/entitlements", "silver", nil)
	if st != 200 || body["tier"] != "silver" || body["features"].(map[string]any)["prices.full"] != true || body["authenticated"] != true {
		t.Fatalf("entitlements: %d %v", st, body)
	}
	st, body, raw := e.call(http.MethodGet, "/v1/prices", "silver", nil)
	if st != 200 || body["lockedCount"].(float64) != 0 || !strings.Contains(raw, "copper-lme") {
		t.Fatalf("silver prices: %d %v", st, body)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/series/copper-red-free/points?range=MAX", "silver", nil); st != 200 {
		t.Fatalf("silver MAX: %d", st)
	}
	var n int
	if err := e.pool.QueryRow(t.Context(), `SELECT count(*) FROM app.audit_log WHERE action = 'subscription.grant'`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("audit rows = %d, %v", n, err)
	}
}

func TestAdminRoles(t *testing.T) {
	e := setup(t)
	price := map[string]any{"series": "rebar-16-iron", "amount": "345000"}
	cases := []struct {
		method, path, token string
		body                any
		want                int
	}{
		{http.MethodGet, "/v1/admin/series", "", nil, 401},
		{http.MethodGet, "/v1/admin/series", "user", nil, 403},
		{http.MethodGet, "/v1/admin/series", "support", nil, 200},
		{http.MethodGet, "/v1/admin/sources", "support", nil, 200},
		{http.MethodGet, "/v1/admin/prices/quarantine", "support", nil, 200},
		{http.MethodPost, "/v1/admin/prices", "", price, 401},
		{http.MethodPost, "/v1/admin/prices", "support", price, 403},
		{http.MethodPost, "/v1/admin/prices", "user", price, 403},
		{http.MethodPost, "/v1/admin/prices", "editor", price, 201},
		{http.MethodGet, "/v1/prices", "forged", nil, 401},
	}
	for _, c := range cases {
		if st, body, _ := e.call(c.method, c.path, c.token, c.body); st != c.want {
			t.Errorf("%s %s as %q: %d, want %d (%v)", c.method, c.path, c.token, st, c.want, body)
		}
	}
}

func TestManualEntryGateAndAudit(t *testing.T) {
	e := setup(t)
	at := time.Now().UTC().Add(-time.Hour).Truncate(time.Second)
	post := func(amount string, at time.Time, force bool) (int, map[string]any) {
		st, body, _ := e.call(http.MethodPost, "/v1/admin/prices", "editor",
			map[string]any{"series": "copper-red-free", "amount": amount, "observedAt": at, "force": force})
		return st, body
	}
	if st, body := post("6400000", at, false); st != 201 || body["status"] != "published" {
		t.Fatalf("first: %d %v", st, body)
	}
	if st, _ := post("6400000", at, false); st != 409 {
		t.Fatalf("duplicate: %d", st)
	}
	// +25 % is above the 15 % threshold: refused unless forced.
	if st, body := post("8000000", at.Add(time.Minute), false); st != 422 || body["code"] != "PRICE_JUMP" {
		t.Fatalf("jump: %d %v", st, body)
	}
	if st, body := post("8000000", at.Add(time.Minute), true); st != 201 || body["jumpBp"].(float64) != 2500 {
		t.Fatalf("forced jump: %d %v", st, body)
	}
	if st, _ := post("0", at, false); st != 400 {
		t.Fatalf("zero price: %d", st)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/prices", "editor", map[string]any{"series": "nope", "amount": "1"}); st != 404 {
		t.Fatalf("unknown series: %d", st)
	}
	if st, _ := post("6400000", time.Now().Add(time.Hour), false); st != 400 {
		t.Fatalf("future: %d", st)
	}

	st, body, _ := e.call(http.MethodGet, "/v1/prices", "", nil)
	if st != 200 {
		t.Fatal(st)
	}
	for _, it := range body["items"].([]any) {
		m := it.(map[string]any)
		if m["series"].(map[string]any)["slug"] == "copper-red-free" {
			// Manual points show the market as the source, never "manual entry".
			if m["price"].(map[string]any)["amount"] != "8000000" || m["source"] != "بازار آزاد" {
				t.Fatalf("latest after manual entry: %v", m)
			}
		}
	}
	var n int
	if err := e.pool.QueryRow(t.Context(), `SELECT count(*) FROM app.audit_log WHERE action = 'price.manual_entry' AND actor_name = 'editor'`).Scan(&n); err != nil || n != 2 {
		t.Fatalf("audit rows = %d (%v), want 2", n, err)
	}
}

func TestBulkDryRunStoresNothing(t *testing.T) {
	e := setup(t)
	items := []map[string]any{
		{"series": "zinc-ingot-ime", "amount": "2600000"},
		{"series": "lead-ingot-ime", "amount": "1900000"},
		{"series": "missing", "amount": "1"},
		{"series": "zinc-ingot-ime", "amount": "x"},
	}
	st, body, _ := e.call(http.MethodPost, "/v1/admin/prices/bulk", "editor", map[string]any{"items": items, "dryRun": true})
	if st != 200 || body["stored"].(float64) != 0 {
		t.Fatalf("dry run: %d %v", st, body)
	}
	want := []string{"ok", "ok", "invalid", "invalid"}
	for i, it := range body["items"].([]any) {
		if got := it.(map[string]any)["status"]; got != want[i] {
			t.Errorf("row %d: %v, want %s", i, got, want[i])
		}
	}
	var n int
	_ = e.pool.QueryRow(t.Context(), `SELECT count(*) FROM market.price_points`).Scan(&n)
	if n != 0 {
		t.Fatalf("dry run stored %d points", n)
	}
	st, body, _ = e.call(http.MethodPost, "/v1/admin/prices/bulk", "editor", map[string]any{"items": items[:2]})
	if st != 200 || body["stored"].(float64) != 2 {
		t.Fatalf("bulk: %d %v", st, body)
	}
}

func TestQuarantineReview(t *testing.T) {
	e := setup(t)
	e.seedPrices()
	src, _ := dbq.New(e.pool).GetSourceBySlug(t.Context(), "test")
	// An automated +50 % move is stored but held back.
	res, err := e.prices.Ingest(t.Context(), prices.Origin{SourceID: src.ID},
		[]prices.Quote{{Series: "copper-red-free", ObservedAt: time.Now().UTC().Truncate(time.Second), Price: 9_700_000}}, prices.IngestOptions{})
	if err != nil || res[0].Outcome != prices.Quarantined {
		t.Fatalf("ingest: %v %+v", err, res)
	}
	if _, _, raw := e.call(http.MethodGet, "/v1/prices", "", nil); strings.Contains(raw, "9700000") {
		t.Fatal("a quarantined price was published")
	}
	st, body, _ := e.call(http.MethodGet, "/v1/admin/prices/quarantine", "support", nil)
	items := body["items"].([]any)
	if st != 200 || len(items) != 1 {
		t.Fatalf("quarantine list: %d %v", st, body)
	}
	id := items[0].(map[string]any)["id"].(string)
	if items[0].(map[string]any)["jumpBp"].(float64) < 1500 {
		t.Fatalf("jumpBp: %v", items[0])
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/prices/"+id+"/review", "support", map[string]any{"decision": "approve"}); st != 403 {
		t.Fatalf("support must not review: %d", st)
	}
	if st, body, _ := e.call(http.MethodPost, "/v1/admin/prices/"+id+"/review", "editor", map[string]any{"decision": "approve"}); st != 200 || body["status"] != "published" {
		t.Fatalf("approve: %d %v", st, body)
	}
	if _, _, raw := e.call(http.MethodGet, "/v1/prices", "", nil); !strings.Contains(raw, "9700000") {
		t.Fatal("approved price is not the latest")
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/prices/"+id+"/review", "editor", map[string]any{"decision": "reject"}); st != 409 {
		t.Fatalf("second review: %d", st)
	}
}
