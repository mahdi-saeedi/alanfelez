//go:build integration

package api_test

import (
	"net/http"
	"testing"
)

// Ratings and comments (client, 2026-11-02): readers of an item rate and comment on it; comments wait for review
// except staff's; the experts' analyses are Gold, members' analyses Silver.
func TestDiscussions(t *testing.T) {
	e := setup(t)
	e.grant("00000000-0000-0000-0000-000000000002", "silver")
	e.grantGold()
	st, b, raw := e.call(http.MethodPost, "/v1/community/posts", "gold", map[string]any{"title": "تحلیل مس", "body": "روند مس رو به بالاست."})
	if st != 201 {
		t.Fatalf("post: %d %s", st, raw)
	}
	post := "/v1/discussions/post/" + b["id"].(string)
	// Not published yet: there is nothing to discuss.
	if st, _, _ := e.call(http.MethodGet, post, "silver", nil); st != 404 {
		t.Fatalf("pending post discussion: %d", st)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/community/posts/"+b["id"].(string)+"/status", "editor", map[string]any{"status": "published"}); st != 204 {
		t.Fatalf("publish: %d", st)
	}

	// Free and anonymous: the rating only, locked, no comments; they can't rate or comment.
	for _, tok := range []string{"", "user"} {
		if _, b, raw := e.call(http.MethodGet, post, tok, nil); b["locked"] != true || b["requiredPlan"] != "silver" || b["canRate"] != false || len(b["comments"].([]any)) != 0 {
			t.Fatalf("locked for %q: %s", tok, raw)
		}
	}
	if st, b, _ := e.call(http.MethodPut, post+"/rating", "user", map[string]any{"stars": 5}); st != 403 || b["code"] != "FEATURE_LOCKED" {
		t.Fatalf("free rate: %d %v", st, b)
	}
	if st, _, _ := e.call(http.MethodPost, post+"/comments", "", map[string]any{"body": "سلام"}); st != 401 {
		t.Fatalf("anonymous comment: %d", st)
	}

	// The author can't rate their own; Silver rates, a second rating replaces the first.
	if _, b, _ := e.call(http.MethodGet, post, "gold", nil); b["canRate"] != false || b["canComment"] != true {
		t.Fatalf("author: %v", b)
	}
	if st, _, _ := e.call(http.MethodPut, post+"/rating", "gold", map[string]any{"stars": 5}); st != 400 {
		t.Fatalf("own rating: %d", st)
	}
	if st, b, raw := e.call(http.MethodPut, post+"/rating", "silver", map[string]any{"stars": 4}); st != 200 || b["avg"].(float64) != 4 || b["mine"].(float64) != 4 {
		t.Fatalf("rate: %d %s", st, raw)
	}
	if _, b, raw := e.call(http.MethodPut, post+"/rating", "silver", map[string]any{"stars": 2}); b["count"].(float64) != 1 || b["avg"].(float64) != 2 {
		t.Fatalf("re-rate: %s", raw)
	}
	if st, _, _ := e.call(http.MethodPut, post+"/rating", "silver", map[string]any{"stars": 6}); st != 400 {
		t.Fatalf("six stars: %d", st)
	}

	// A member's comment waits for review: its writer sees it marked pending, others don't see it.
	st, b, raw = e.call(http.MethodPost, post+"/comments", "silver", map[string]any{"body": "تحلیل خوبی بود، ممنون."})
	if st != 201 || b["pending"] != true || b["staff"] != false {
		t.Fatalf("comment: %d %s", st, raw)
	}
	comment := b["id"].(string)
	if _, b, _ := e.call(http.MethodGet, post, "gold", nil); len(b["comments"].([]any)) != 0 {
		t.Fatalf("pending comment shown to others: %v", b["comments"])
	}
	if _, b, _ := e.call(http.MethodGet, post, "silver", nil); len(b["comments"].([]any)) != 1 || b["comments"].([]any)[0].(map[string]any)["pending"] != true {
		t.Fatalf("own pending comment: %v", b["comments"])
	}
	if _, b, raw := e.call(http.MethodGet, "/v1/admin/comments", "support", nil); b["pending"].(float64) != 1 || b["items"].([]any)[0].(map[string]any)["targetTitle"] != "تحلیل مس" {
		t.Fatalf("admin comments: %s", raw)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/comments/"+comment+"/status", "support", map[string]any{"status": "published"}); st != 403 {
		t.Fatalf("support review: %d", st)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/comments/"+comment+"/status", "editor", map[string]any{"status": "published"}); st != 204 {
		t.Fatalf("review: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action = 'comment.published'`); n != 1 {
		t.Fatalf("audit rows = %d", n)
	}
	// Staff comment at once, under the team's name.
	if st, b, raw := e.call(http.MethodPost, post+"/comments", "editor", map[string]any{"body": "ممنون از تحلیل شما."}); st != 201 || b["pending"] != false || b["staff"] != true || b["authorName"] != "الان\u200cفلز" {
		t.Fatalf("staff comment: %d %s", st, raw)
	}
	if _, b, _ := e.call(http.MethodGet, post, "gold", nil); len(b["comments"].([]any)) != 2 {
		t.Fatalf("published comments: %v", b["comments"])
	}
	if _, b, _ := e.call(http.MethodGet, "/v1/community/posts", "silver", nil); b["items"].([]any)[0].(map[string]any)["commentCount"].(float64) != 2 || b["items"].([]any)[0].(map[string]any)["ratingCount"].(float64) != 1 {
		t.Fatalf("feed counts: %v", b["items"])
	}

	// The experts' analyses: Gold and staff only.
	st, b, raw = e.call(http.MethodPost, "/v1/admin/articles", "editor", article("analysis", "copper-analysis", "published"))
	if st != 201 {
		t.Fatalf("article: %d %s", st, raw)
	}
	art := "/v1/discussions/article/" + b["id"].(string)
	if _, b, _ := e.call(http.MethodGet, art, "silver", nil); b["locked"] != true || b["requiredPlan"] != "gold" {
		t.Fatalf("silver on an analysis: %v", b)
	}
	if st, _, _ := e.call(http.MethodPost, art+"/comments", "silver", map[string]any{"body": "نظر من"}); st != 403 {
		t.Fatalf("silver comment on an analysis: %d", st)
	}
	if st, _, raw := e.call(http.MethodPut, art+"/rating", "gold", map[string]any{"stars": 5}); st != 200 {
		t.Fatalf("gold rates an analysis: %d %s", st, raw)
	}
	if _, b, _ := e.call(http.MethodGet, art, "support", nil); b["locked"] != false {
		t.Fatalf("staff locked out: %v", b)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/discussions/article/00000000-0000-0000-0000-000000000099", "gold", nil); st != 404 {
		t.Fatalf("unknown article: %d", st)
	}

	// Deleting the post takes its ratings and comments with it.
	if st, _, _ := e.call(http.MethodDelete, "/v1/community/posts/"+post[len("/v1/discussions/post/"):], "gold", nil); st != 204 {
		t.Fatalf("delete: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM app.comments WHERE target_kind = 'post'`); n != 0 {
		t.Fatalf("comments left after delete: %d", n)
	}
}
