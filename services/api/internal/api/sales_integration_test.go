//go:build integration

package api_test

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

// Notes and follow-ups for sales, the admin search box, the staff work report and the users export segments
// (client, 2026-11-05).
func TestSalesTools(t *testing.T) {
	e := setup(t)
	e.call(http.MethodGet, "/v1/me", "gold", nil)
	gold := "00000000-0000-0000-0000-000000000003"
	today := time.Now().In(time.FixedZone("IRST", 3*3600+1800)).Format(time.DateOnly)

	if st, _, _ := e.call(http.MethodPost, "/v1/admin/users/"+gold+"/notes", "user", map[string]any{"body": "x"}); st != 403 {
		t.Fatalf("a customer adds a note: %d", st)
	}
	st, note, raw := e.call(http.MethodPost, "/v1/admin/users/"+gold+"/notes", "support", map[string]any{"body": "تماس گرفتم، هفته\u200cی بعد تمدید می\u200cکند", "followUp": today})
	if st != 201 || note["author"] != "support" {
		t.Fatalf("add note: %d %s", st, raw)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/users/00000000-0000-0000-0000-0000000000ff/notes", "support", map[string]any{"body": "x"}); st != 404 {
		t.Fatalf("unknown user: %d", st)
	}
	if _, f, raw := e.call(http.MethodGet, "/v1/admin/follow-ups", "support", nil); len(f["items"].([]any)) != 1 || !strings.Contains(raw2(f), "Gol Test") {
		t.Fatalf("follow-ups: %s", raw)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/customer-notes/"+note["id"].(string), "support", map[string]any{"done": true}); st != 204 {
		t.Fatalf("done: %d", st)
	}
	if _, f, _ := e.call(http.MethodGet, "/v1/admin/follow-ups", "support", nil); len(f["items"].([]any)) != 0 {
		t.Fatal("a done follow-up is still due")
	}
	if _, l, _ := e.call(http.MethodGet, "/v1/admin/users/"+gold+"/notes", "editor", nil); len(l["items"].([]any)) != 1 {
		t.Fatalf("notes: %v", l)
	}

	// Search box.
	if _, r, raw := e.call(http.MethodGet, "/v1/admin/search?q=0912000000", "support", nil); len(r["users"].([]any)) == 0 {
		t.Fatalf("search: %s", raw)
	}
	// Staff work: admin only.
	if st, _, _ := e.call(http.MethodGet, "/v1/admin/staff-work", "support", nil); st != 403 {
		t.Fatalf("staff work as support: %d", st)
	}
	if _, w, raw := e.call(http.MethodGet, "/v1/admin/staff-work", "admin", nil); !strings.Contains(raw2(w), "customer.note") {
		t.Fatalf("staff work: %s", raw)
	}
	// Segments: Gold users whose plan ends within 40 days.
	e.grantGold()
	if _, u, raw := e.call(http.MethodGet, "/v1/admin/users?expiresWithin=40", "support", nil); u["total"] != float64(1) {
		t.Fatalf("expiring segment: %s", raw)
	}
	if _, u, _ := e.call(http.MethodGet, "/v1/admin/users?smsMetal=copper", "support", nil); u["total"] != float64(0) {
		t.Fatal("sms metal segment")
	}
}
