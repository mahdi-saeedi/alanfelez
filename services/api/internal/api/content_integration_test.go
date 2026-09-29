//go:build integration

package api_test

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/api"
)

func (e *env) count(sql string) int {
	e.t.Helper()
	var n int
	if err := e.pool.QueryRow(e.t.Context(), sql).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func (e *env) grantGold() {
	e.t.Helper()
	grant := map[string]any{"userId": "00000000-0000-0000-0000-000000000003", "plan": "gold", "days": 30}
	if st, _, raw := e.call(http.MethodPost, "/v1/admin/subscriptions", "admin", grant); st != 201 {
		e.t.Fatalf("grant gold: %d %s", st, raw)
	}
}

func article(typ, slug, status string) map[string]any {
	return map[string]any{
		"type": typ, "slug": slug, "status": status, "featured": false, "metal": "copper", "outlook": "up",
		"titleFa": "عنوان " + slug, "summaryFa": "", "bodyFa": `<h2>بخش</h2><p onclick="x()">متن <strong>مس</strong></p><script>alert(1)</script>`,
		"titleEn": "Title " + slug, "bodyEn": "<p>English body</p>",
	}
}

func TestArticlesLockedBodiesNeverSent(t *testing.T) {
	e := setup(t)
	for _, a := range []map[string]any{article("news", "copper-news", "published"), article("analysis", "copper-analysis", "published"), article("forecast", "copper-draft", "draft")} {
		if st, body, raw := e.call(http.MethodPost, "/v1/admin/articles", "editor", a); st != 201 || body["readMinutes"].(float64) != 1 {
			t.Fatalf("create %s: %d %s", a["slug"], st, raw)
		}
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/articles", "editor", article("news", "copper-news", "draft")); st != 409 {
		t.Fatalf("duplicate slug: %d", st)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/articles", "support", article("news", "by-support", "draft")); st != 403 {
		t.Fatalf("support must not write content: %d", st)
	}
	bad := article("news", "Bad Slug", "draft")
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/articles", "editor", bad); st != 400 {
		t.Fatalf("bad slug: %d", st)
	}

	// Anonymous: both published articles listed, the analysis as a locked teaser; the draft is invisible.
	st, body, raw := e.call(http.MethodGet, "/v1/articles", "", nil)
	if st != 200 || body["total"].(float64) != 2 || strings.Contains(raw, "copper-draft") || strings.Contains(raw, `"body"`) {
		t.Fatalf("list: %d %s", st, raw)
	}
	for _, it := range body["items"].([]any) {
		a := it.(map[string]any)
		wantLocked := a["type"] == "analysis"
		if a["locked"] != wantLocked || (wantLocked && a["requiredPlan"] != "gold") {
			t.Fatalf("lock of %v: %v %v", a["slug"], a["locked"], a["requiredPlan"])
		}
		if a["summary"] == "" { // derived from the body when left empty
			t.Fatalf("empty summary for %v", a["slug"])
		}
	}
	if st, body, _ := e.call(http.MethodGet, "/v1/articles?type=analysis&type=forecast&metal=copper", "", nil); st != 200 || body["total"].(float64) != 1 {
		t.Fatalf("filtered list: %d %v", st, body)
	}

	// News bodies are public and sanitized.
	st, body, _ = e.call(http.MethodGet, "/v1/articles/copper-news", "", nil)
	if b, _ := body["body"].(string); st != 200 || strings.Contains(b, "script") || strings.Contains(b, "onclick") || !strings.Contains(b, "<strong>مس</strong>") {
		t.Fatalf("news body: %d %q", st, b)
	}
	// Locked for anonymous and Silver; delivered (and counted as used) for Gold.
	for _, tok := range []string{"", "silver"} {
		if st, body, _ := e.call(http.MethodGet, "/v1/articles/copper-analysis", tok, nil); st != 200 || body["locked"] != true || body["body"] != nil {
			t.Fatalf("analysis for %q: %d %v", tok, st, body)
		}
	}
	e.grantGold()
	st, body, _ = e.call(http.MethodGet, "/v1/articles/copper-analysis", "gold", nil)
	if st != 200 || body["locked"] != false || body["body"] == nil {
		t.Fatalf("gold analysis: %d %v", st, body)
	}
	if n := e.count(`SELECT count(*) FROM app.entitlement_usage WHERE feature = 'analysis.read'`); n != 1 {
		t.Fatalf("usage rows = %d", n)
	}
	if st, _, _ := e.callH(http.MethodGet, "/v1/articles/copper-analysis", "gold", nil, map[string]string{"Accept-Language": "en"}); st != 200 {
		t.Fatalf("en: %d", st)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/articles/copper-draft", "gold", nil); st != 404 {
		t.Fatalf("draft must 404: %d", st)
	}

	// Publishing the draft stamps published_at; archiving hides it again.
	_, list, _ := e.call(http.MethodGet, "/v1/admin/articles?q=draft", "editor", nil)
	id := list["items"].([]any)[0].(map[string]any)["id"].(string)
	upd := article("forecast", "copper-draft", "published")
	if st, body, raw := e.call(http.MethodPut, "/v1/admin/articles/"+id, "editor", upd); st != 200 || body["publishedAt"] == nil {
		t.Fatalf("publish: %d %s", st, raw)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/articles/copper-draft", "gold", nil); st != 200 {
		t.Fatalf("published forecast: %d", st)
	}
	upd["status"] = "archived"
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/articles/"+id, "editor", upd); st != 200 {
		t.Fatalf("archive: %d", st)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/articles/copper-draft", "gold", nil); st != 404 {
		t.Fatalf("archived must 404: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action LIKE 'article.%'`); n != 5 {
		t.Fatalf("audit rows = %d, want 5", n)
	}
}

func TestFaqPagesAndSettings(t *testing.T) {
	e := setup(t)

	// The reference seed: 9 categories, 39 published questions (Q47 waits for the licenses page), 6 popular.
	st, body, raw := e.call(http.MethodGet, "/v1/faq", "", nil)
	if st != 200 || len(body["categories"].([]any)) != 9 || strings.Contains(raw, "licenses-and-trust") || strings.Contains(raw, "اعلام بار") {
		t.Fatalf("faq: %d %s", st, raw[:min(len(raw), 300)])
	}
	items, popular := 0, 0
	for _, c := range body["categories"].([]any) {
		for _, it := range c.(map[string]any)["items"].([]any) {
			items++
			if it.(map[string]any)["popular"] == true {
				popular++
			}
		}
	}
	if items != 39 || popular != 6 {
		t.Fatalf("items=%d popular=%d", items, popular)
	}
	if _, body, _ := e.callH(http.MethodGet, "/v1/faq", "", nil, map[string]string{"Accept-Language": "en"}); body["categories"].([]any)[0].(map[string]any)["name"] != "About Alan Felez" {
		t.Fatalf("en faq: %v", body["categories"].([]any)[0])
	}

	// Pages; licenses stays hidden until its flag is on.
	st, page, _ := e.call(http.MethodGet, "/v1/pages/terms", "", nil)
	if st != 200 || page["version"].(float64) != 1 || strings.Contains(page["body"].(string), "اعلام بار") {
		t.Fatalf("terms: %d %v", st, page["version"])
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/pages/licenses", "", nil); st != 404 {
		t.Fatalf("licenses must be hidden: %d", st)
	}
	if _, err := e.pool.Exec(t.Context(), `UPDATE app.feature_flags SET enabled = true WHERE key = 'page.licenses'`); err != nil {
		t.Fatal(err)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/pages/licenses", "", nil); st != 200 {
		t.Fatalf("licenses after flag: %d", st)
	}

	// Saving a page: optimistic lock on the version, previous text kept as a revision.
	save := map[string]any{"titleFa": "قوانین", "bodyFa": "<p>متن تازه</p><img src=x onerror=alert(1)>", "published": true, "version": 1}
	st, saved, raw := e.call(http.MethodPut, "/v1/admin/pages/terms", "editor", save)
	if st != 200 || saved["version"].(float64) != 2 || strings.Contains(saved["bodyFa"].(string), "onerror") {
		t.Fatalf("save page: %d %s", st, raw)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/pages/terms", "editor", save); st != 409 {
		t.Fatalf("stale version must conflict: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM app.page_revisions WHERE slug = 'terms' AND version = 1`); n != 1 {
		t.Fatalf("revisions = %d", n)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/pages/nope", "editor", save); st != 404 {
		t.Fatalf("unknown page: %d", st)
	}

	// Site settings: empty contact details are left out; only admins edit them.
	if _, site, _ := e.call(http.MethodGet, "/v1/site", "", nil); len(site["contact"].(map[string]any)) != 0 || site["licensesPage"] != true || site["englishSite"] != false {
		t.Fatalf("site: %v", site)
	}
	settings := map[string]any{
		"contact": map[string]any{"phone": "021-12345678", "email": "info@alanfelez.ir", "addressFa": "تهران", "addressEn": "", "hoursFa": "", "hoursEn": ""},
		"social":  map[string]any{"telegram": "https://t.me/alanfelez", "instagram": "", "linkedin": "", "bale": "", "eitaa": ""},
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/settings", "editor", settings); st != 403 {
		t.Fatalf("editor must not edit settings: %d", st)
	}
	if st, _, raw := e.call(http.MethodPut, "/v1/admin/settings", "admin", settings); st != 200 {
		t.Fatalf("settings: %d %s", st, raw)
	}
	_, site, _ := e.callH(http.MethodGet, "/v1/site", "", nil, map[string]string{"Accept-Language": "en"})
	c := site["contact"].(map[string]any)
	if c["phone"] != "021-12345678" || c["address"] != "تهران" || site["social"].(map[string]any)["telegram"] != "https://t.me/alanfelez" {
		t.Fatalf("site after save: %v", site)
	}
	settings["social"].(map[string]any)["instagram"] = "javascript:alert(1)"
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/settings", "admin", settings); st != 400 {
		t.Fatalf("unsafe link: %d", st)
	}
}

// capLimiter allows `max` hits per scope/id (in-memory stand-in for Redis).
type capLimiter struct {
	mu   sync.Mutex
	max  int
	hits map[string]int
}

func (l *capLimiter) Allow(_ context.Context, scope, id string, _ int, _ time.Duration) (bool, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.hits[scope+id]++
	return l.hits[scope+id] <= l.max, nil
}

func TestContactForm(t *testing.T) {
	lim := &capLimiter{max: 4, hits: map[string]int{}} // each message checks two windows: 2 messages per IP
	e := setup(t, api.WithLimiter(lim))
	msg := map[string]any{"name": "مهمان", "phone": "۰۹۱۲ ۱۲۳ ۴۵۶۷", "subject": "support", "body": "سلام، سوالی درباره اشتراک دارم."}
	ip := map[string]string{"X-Forwarded-For": "198.51.100.7"}

	if st, _, raw := e.callH(http.MethodPost, "/v1/contact", "", msg, ip); st != 202 {
		t.Fatalf("contact: %d %s", st, raw)
	}
	if n := e.count(`SELECT count(*) FROM app.contact_messages WHERE phone = '0912 123 4567' AND ip = '198.51.100.7'`); n != 1 {
		t.Fatalf("stored = %d (digits normalized, client IP from the trusted proxy header)", n)
	}
	bot := map[string]any{"name": "bot", "phone": "09120000000", "subject": "other", "body": "buy cheap stuff now!!", "website": "http://spam"}
	if st, _, _ := e.callH(http.MethodPost, "/v1/contact", "", bot, map[string]string{"X-Forwarded-For": "203.0.113.9"}); st != 202 {
		t.Fatalf("honeypot answers 202: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM app.contact_messages`); n != 1 {
		t.Fatalf("honeypot stored something: %d", n)
	}
	for name, bad := range map[string]map[string]any{
		"short body": {"name": "علی", "phone": "09121234567", "subject": "general", "body": "کوتاه"},
		"bad phone":  {"name": "علی", "phone": "abc", "subject": "general", "body": "یک پیام به اندازه کافی بلند"},
		"bad email":  {"name": "علی", "phone": "09121234567", "email": "nope", "subject": "general", "body": "یک پیام به اندازه کافی بلند"},
	} {
		if st, _, _ := e.callH(http.MethodPost, "/v1/contact", "", bad, map[string]string{"X-Forwarded-For": "192.0.2.1"}); st != 400 {
			t.Fatalf("%s: %d", name, st)
		}
	}
	if st, _, _ := e.callH(http.MethodPost, "/v1/contact", "", msg, ip); st != 202 {
		t.Fatalf("second message: %d", st)
	}
	if st, body, _ := e.callH(http.MethodPost, "/v1/contact", "", msg, ip); st != 429 || body["code"] != "RATE_LIMITED" {
		t.Fatalf("third message must be rate limited: %d %v", st, body)
	}

	// Staff inbox.
	_, sum, _ := e.call(http.MethodGet, "/v1/admin/support/summary", "support", nil)
	if sum["newMessages"].(float64) != 2 {
		t.Fatalf("summary: %v", sum)
	}
	_, list, _ := e.call(http.MethodGet, "/v1/admin/contact-messages?status=new", "support", nil)
	id := list["items"].([]any)[0].(map[string]any)["id"].(string)
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/contact-messages/"+id, "editor", map[string]any{"status": "handled"}); st != 403 {
		t.Fatalf("editor must not handle messages: %d", st)
	}
	if st, body, _ := e.call(http.MethodPut, "/v1/admin/contact-messages/"+id, "support", map[string]any{"status": "handled", "note": "called back"}); st != 200 || body["status"] != "handled" || body["handledAt"] == nil {
		t.Fatalf("handle: %d %v", st, body)
	}
}

func TestTickets(t *testing.T) {
	e := setup(t)
	e.grantGold()
	key := map[string]string{"Idempotency-Key": "ticket-key-1"}
	open := map[string]any{"subject": "مشکل پرداخت", "body": "پرداخت انجام شد اما اشتراک فعال نشد."}

	st, first, raw := e.callH(http.MethodPost, "/v1/me/tickets", "user", open, key)
	if st != 201 || first["status"] != "open" || first["priority"] != "normal" {
		t.Fatalf("create: %d %s", st, raw)
	}
	st, again, _ := e.callH(http.MethodPost, "/v1/me/tickets", "user", open, key)
	if st != 200 || again["id"] != first["id"] {
		t.Fatalf("same key must return the first ticket: %d %v", st, again)
	}
	if n := e.count(`SELECT count(*) FROM app.ticket_messages`); n != 1 {
		t.Fatalf("messages = %d", n)
	}
	id := first["id"].(string)
	if st, _, _ := e.call(http.MethodGet, "/v1/me/tickets/"+id, "silver", nil); st != 404 {
		t.Fatalf("someone else's ticket must 404: %d", st)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/me/tickets/"+id+"/messages", "silver", map[string]any{"body": "hi"}); st != 404 {
		t.Fatalf("replying to someone else's ticket must 404: %d", st)
	}
	st, gold, _ := e.callH(http.MethodPost, "/v1/me/tickets", "gold", map[string]any{"subject": "سوال", "body": "سوالی درباره تحلیل\u200cها دارم."}, map[string]string{"Idempotency-Key": "gold-ticket-1"})
	if st != 201 || gold["priority"] != "high" {
		t.Fatalf("gold ticket: %d %v", st, gold)
	}

	// The queue: open first, high priority first.
	_, q, _ := e.call(http.MethodGet, "/v1/admin/tickets?status=open", "support", nil)
	if items := q["items"].([]any); len(items) != 2 || items[0].(map[string]any)["id"] != gold["id"] || items[0].(map[string]any)["userName"] != "Gol Test" {
		t.Fatalf("queue: %v", q)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/tickets/"+id+"/messages", "editor", map[string]any{"body": "x"}); st != 403 {
		t.Fatalf("editor must not answer tickets: %d", st)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/tickets/"+id+"/messages", "support", map[string]any{"body": "بررسی شد، اشتراک فعال است."}); st != 201 {
		t.Fatalf("support reply: %d", st)
	}
	_, thread, _ := e.call(http.MethodGet, "/v1/me/tickets/"+id, "user", nil)
	msgs := thread["messages"].([]any)
	staff := msgs[1].(map[string]any)
	if thread["ticket"].(map[string]any)["status"] != "answered" || len(msgs) != 2 || staff["staff"] != true || staff["author"] != nil {
		t.Fatalf("user thread (agent names stay internal): %v", thread)
	}
	_, athread, _ := e.call(http.MethodGet, "/v1/admin/tickets/"+id, "support", nil)
	if athread["messages"].([]any)[1].(map[string]any)["author"] != "support" {
		t.Fatalf("staff see the agent: %v", athread)
	}

	if st, body, _ := e.call(http.MethodPost, "/v1/me/tickets/"+id+"/close", "user", nil); st != 200 || body["status"] != "closed" || body["closedAt"] == nil {
		t.Fatalf("close: %d %v", st, body)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/me/tickets/"+id+"/messages", "user", map[string]any{"body": "دوباره مشکل دارم"}); st != 201 {
		t.Fatalf("reply to closed: %d", st)
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/me/tickets", "user", nil); body["items"].([]any)[0].(map[string]any)["status"] != "open" {
		t.Fatalf("a user reply reopens: %v", body)
	}
	if st, body, _ := e.call(http.MethodPut, "/v1/admin/tickets/"+id+"/status", "support", map[string]any{"status": "closed"}); st != 200 || body["status"] != "closed" {
		t.Fatalf("staff close: %d %v", st, body)
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action IN ('ticket.reply', 'ticket.status')`); n != 2 {
		t.Fatalf("audit rows = %d", n)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/me/tickets", "", nil); st != 401 {
		t.Fatalf("anonymous: %d", st)
	}
}
