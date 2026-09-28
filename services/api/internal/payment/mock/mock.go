// Package mock is a fake payment gateway for local development, tests and staging demos. It serves a small
// "gateway page" (Pay / Cancel) from the API itself and keeps state in Redis, so the full checkout loop,
// including callbacks and verification, runs without a real merchant account. Refused in production.
package mock

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"

	"github.com/alanfelez/alanfelez/services/api/internal/payment"
)

// Name is the gateway id stored with payments.
const Name = "mock"

// PathPrefix is where the fake gateway page is served.
const PathPrefix = "/mock-gateway"

const ttl = time.Hour

// State of one mock payment.
type State struct {
	OrderID     string `json:"orderId"`
	AmountRial  int64  `json:"amountRial"`
	CallbackURL string `json:"callbackUrl"`
	Status      string `json:"status"` // pending | paid | cancelled
	RefID       string `json:"refId,omitempty"`
}

// Store keeps pending mock payments. Redis in the running stack (shared by API replicas), memory in tests.
type Store interface {
	Save(ctx context.Context, authority string, s State) error
	Load(ctx context.Context, authority string) (State, error)
}

// Gateway implements payment.Gateway.
type Gateway struct {
	store     Store
	publicURL string // the API's public base URL (the browser opens the fake page there)
}

// New returns the mock gateway backed by Redis. publicURL is the API's address as browsers see it.
func New(rdb *redis.Client, publicURL string) *Gateway {
	return &Gateway{store: redisStore{rdb}, publicURL: publicURL}
}

// NewMemory returns a mock gateway with in-process state (tests).
func NewMemory(publicURL string) *Gateway {
	return &Gateway{store: &MemoryStore{m: map[string]State{}}, publicURL: publicURL}
}

// Pay marks a pending payment as paid, as if the user had clicked "Pay" (tests).
func (g *Gateway) Pay(ctx context.Context, authority string) error {
	s, err := g.store.Load(ctx, authority)
	if err != nil {
		return err
	}
	s.Status, s.RefID = "paid", "TEST"+authority[len(authority)-6:]
	return g.store.Save(ctx, authority, s)
}

var _ payment.Gateway = (*Gateway)(nil)

// Name implements payment.Gateway.
func (g *Gateway) Name() string { return Name }

// Request implements payment.Gateway.
func (g *Gateway) Request(ctx context.Context, r payment.Request) (payment.Started, error) {
	authority := "MOCK" + randomHex(12)
	if err := g.store.Save(ctx, authority, State{OrderID: r.OrderID, AmountRial: r.AmountRial, CallbackURL: r.CallbackURL, Status: "pending"}); err != nil {
		return payment.Started{}, err
	}
	return payment.Started{
		Authority:   authority,
		RedirectURL: g.publicURL + PathPrefix + "/" + authority,
		Raw:         map[string]any{"gateway": Name},
	}, nil
}

// Callback implements payment.Gateway (Zarinpal-style parameters: Authority, Status=OK|NOK).
func (g *Gateway) Callback(q map[string]string) (string, bool) {
	return q["Authority"], q["Status"] == "OK"
}

// Verify implements payment.Gateway.
func (g *Gateway) Verify(ctx context.Context, authority string, amountRial int64) (payment.Verified, error) {
	s, err := g.store.Load(ctx, authority)
	if err != nil {
		return payment.Verified{}, err
	}
	if s.Status != "paid" || s.AmountRial != amountRial {
		return payment.Verified{}, payment.ErrDeclined
	}
	return payment.Verified{RefID: s.RefID, CardMask: "6037-99**-****-1234", Raw: map[string]any{"gateway": Name, "refId": s.RefID}}, nil
}

// Routes serves the fake gateway page. Mount it only when this gateway is active.
func (g *Gateway) Routes(r chi.Router) {
	r.Get(PathPrefix+"/{authority}", g.page)
	r.Post(PathPrefix+"/{authority}", g.decide)
}

var pageTmpl = template.Must(template.New("mock").Parse(`<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock payment gateway</title>
<style>body{font-family:system-ui,sans-serif;background:#f2f2f0;display:grid;place-items:center;min-height:100vh;margin:0}
.c{background:#fff;border:1px solid #e2e2df;border-radius:14px;padding:28px;max-width:380px;width:90%;text-align:center}
b{font-size:28px;display:block;margin:12px 0}button{font:inherit;border:0;border-radius:10px;padding:10px 18px;margin:6px;cursor:pointer}
.pay{background:#c9a227;color:#1c2331;font-weight:700}.cancel{background:#fee2e2;color:#dc2626}small{color:#6b7280}</style></head>
<body><form class="c" method="post">
<small>درگاه آزمایشی — فقط محیط توسعه / Mock gateway — development only</small>
<b>{{.Amount}} ریال</b><small>Order {{.OrderID}}</small><br><br>
<button class="pay" name="action" value="pay">پرداخت / Pay</button>
<button class="cancel" name="action" value="cancel">انصراف / Cancel</button>
</form></body></html>`))

func (g *Gateway) page(w http.ResponseWriter, r *http.Request) {
	s, err := g.store.Load(r.Context(), chi.URLParam(r, "authority"))
	if err != nil || s.Status != "pending" {
		http.Error(w, "unknown or finished payment", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = pageTmpl.Execute(w, map[string]string{"Amount": strconv.FormatInt(s.AmountRial, 10), "OrderID": s.OrderID})
}

func (g *Gateway) decide(w http.ResponseWriter, r *http.Request) {
	authority := chi.URLParam(r, "authority")
	s, err := g.store.Load(r.Context(), authority)
	if err != nil || s.Status != "pending" {
		http.Error(w, "unknown or finished payment", http.StatusNotFound)
		return
	}
	status := "NOK"
	s.Status = "cancelled"
	if r.FormValue("action") == "pay" {
		status, s.Status, s.RefID = "OK", "paid", strconv.FormatInt(time.Now().UnixMilli()%1_000_000_000, 10)
	}
	if err := g.store.Save(r.Context(), authority, s); err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	u, err := url.Parse(s.CallbackURL)
	if err != nil {
		http.Error(w, "bad callback", http.StatusInternalServerError)
		return
	}
	q := u.Query()
	q.Set("Authority", authority)
	q.Set("Status", status)
	u.RawQuery = q.Encode()
	http.Redirect(w, r, u.String(), http.StatusSeeOther)
}

type redisStore struct{ rdb *redis.Client }

func (r redisStore) Save(ctx context.Context, authority string, s State) error {
	b, err := json.Marshal(s)
	if err != nil {
		return fmt.Errorf("mock gateway: marshal: %w", err)
	}
	if err := r.rdb.Set(ctx, key(authority), b, ttl).Err(); err != nil {
		return fmt.Errorf("%w: %w", payment.ErrUnavailable, err)
	}
	return nil
}

func (r redisStore) Load(ctx context.Context, authority string) (State, error) {
	var s State
	b, err := r.rdb.Get(ctx, key(authority)).Bytes()
	if errors.Is(err, redis.Nil) {
		return s, payment.ErrDeclined
	}
	if err != nil {
		return s, fmt.Errorf("%w: %w", payment.ErrUnavailable, err)
	}
	if err := json.Unmarshal(b, &s); err != nil {
		return s, fmt.Errorf("mock gateway: unmarshal: %w", err)
	}
	return s, nil
}

// MemoryStore is an in-process Store.
type MemoryStore struct {
	mu sync.Mutex
	m  map[string]State
}

// Save implements Store.
func (m *MemoryStore) Save(_ context.Context, authority string, s State) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.m[authority] = s
	return nil
}

// Load implements Store.
func (m *MemoryStore) Load(_ context.Context, authority string) (State, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.m[authority]
	if !ok {
		return s, payment.ErrDeclined
	}
	return s, nil
}

func key(authority string) string { return "mockpay:" + authority }

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
