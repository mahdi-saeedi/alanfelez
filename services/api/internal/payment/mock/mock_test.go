package mock

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/alanfelez/alanfelez/services/api/internal/payment"
)

func TestPayFlow(t *testing.T) {
	g := NewMemory("http://api.test")
	ctx := t.Context()
	st, err := g.Request(ctx, payment.Request{OrderID: "o1", AmountRial: 10_000_000, CallbackURL: "http://web.test/checkout/callback?order=o1"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(st.RedirectURL, "http://api.test/mock-gateway/MOCK") {
		t.Fatalf("redirect = %s", st.RedirectURL)
	}
	if _, err := g.Verify(ctx, st.Authority, 10_000_000); !errors.Is(err, payment.ErrDeclined) {
		t.Fatalf("unpaid must be declined: %v", err)
	}

	r := chi.NewRouter()
	g.Routes(r)
	// The fake page renders, then "Pay" redirects the browser back to the callback with Status=OK.
	res := httptest.NewRecorder()
	r.ServeHTTP(res, httptest.NewRequestWithContext(ctx, http.MethodGet, "/mock-gateway/"+st.Authority, nil))
	if res.Code != 200 || !strings.Contains(res.Body.String(), "10000000") {
		t.Fatalf("page: %d", res.Code)
	}
	req := httptest.NewRequestWithContext(ctx, http.MethodPost, "/mock-gateway/"+st.Authority, strings.NewReader("action=pay"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res = httptest.NewRecorder()
	r.ServeHTTP(res, req)
	loc, _ := url.Parse(res.Header().Get("Location"))
	if res.Code != http.StatusSeeOther || loc.Query().Get("order") != "o1" || loc.Query().Get("Status") != "OK" {
		t.Fatalf("callback redirect: %d %s", res.Code, loc)
	}
	q := map[string]string{"Authority": loc.Query().Get("Authority"), "Status": loc.Query().Get("Status")}
	if a, ok := g.Callback(q); a != st.Authority || !ok {
		t.Fatalf("callback parse: %s %v", a, ok)
	}

	v, err := g.Verify(ctx, st.Authority, 10_000_000)
	if err != nil || v.RefID == "" {
		t.Fatalf("verify: %+v %v", v, err)
	}
	if _, err := g.Verify(ctx, st.Authority, 10_000_000); err != nil {
		t.Fatalf("verifying twice must succeed again: %v", err)
	}
	if _, err := g.Verify(ctx, st.Authority, 9_999_999); !errors.Is(err, payment.ErrDeclined) {
		t.Fatalf("amount mismatch must be declined: %v", err)
	}
	// The page is gone once decided.
	res = httptest.NewRecorder()
	r.ServeHTTP(res, httptest.NewRequestWithContext(ctx, http.MethodGet, "/mock-gateway/"+st.Authority, nil))
	if res.Code != http.StatusNotFound {
		t.Fatalf("decided page: %d", res.Code)
	}
}

func TestCancel(t *testing.T) {
	g := NewMemory("http://api.test")
	ctx := t.Context()
	st, _ := g.Request(ctx, payment.Request{OrderID: "o2", AmountRial: 5, CallbackURL: "http://web.test/cb"})
	r := chi.NewRouter()
	g.Routes(r)
	req := httptest.NewRequestWithContext(ctx, http.MethodPost, "/mock-gateway/"+st.Authority, strings.NewReader("action=cancel"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)
	loc, _ := url.Parse(res.Header().Get("Location"))
	if loc.Query().Get("Status") != "NOK" {
		t.Fatalf("cancel redirect: %s", loc)
	}
	if _, err := g.Verify(ctx, st.Authority, 5); !errors.Is(err, payment.ErrDeclined) {
		t.Fatalf("cancelled must be declined: %v", err)
	}
}
