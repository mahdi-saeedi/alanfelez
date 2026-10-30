//go:build integration

package api_test

import (
	"bytes"
	"image"
	"image/png"
	"net/http"
	"strings"
	"testing"
)

func (e *env) grant(user, plan string) {
	e.t.Helper()
	g := map[string]any{"userId": user, "plan": plan, "days": 30}
	if st, _, raw := e.call(http.MethodPost, "/v1/admin/subscriptions", "admin", g); st != 201 {
		e.t.Fatalf("grant %s: %d %s", plan, st, raw)
	}
}

func TestCommunityPosts(t *testing.T) {
	e := setup(t)
	post := map[string]any{"title": "تحلیل مس من", "body": "حمایت ۹۶۰۰ دلار؛ اگر بشکند\nسناریوی نزولی.", "metal": "copper", "outlook": "down"}

	// Free: can't post; the list is the count only.
	if st, b, _ := e.call(http.MethodPost, "/v1/community/posts", "user", post); st != 403 || b["code"] != "FEATURE_LOCKED" {
		t.Fatalf("free post: %d %v", st, b)
	}
	e.grant("00000000-0000-0000-0000-000000000002", "silver")
	e.grantGold()

	st, b, raw := e.call(http.MethodPost, "/v1/community/posts", "gold", post)
	if st != 201 || b["authorName"] != "Gol Test" || b["mine"] != true || b["body"] != "حمایت ۹۶۰۰ دلار؛ اگر بشکند\nسناریوی نزولی." {
		t.Fatalf("gold post: %d %s", st, raw)
	}
	id := b["id"].(string)
	if st, b, _ := e.call(http.MethodPost, "/v1/community/posts", "silver", map[string]any{"title": "سیگنال", "body": "این سهم سود تضمینی دارد، بخرید."}); st != 400 || !strings.Contains(b["detail"].(string), "promise") {
		t.Fatalf("forbidden claim: %d %v", st, b)
	}

	// The image: only the author may add it; it's stored as a JPEG.
	var img bytes.Buffer
	_ = png.Encode(&img, image.NewRGBA(image.Rect(0, 0, 2000, 800)))
	if st, _, _ := e.rawCall(http.MethodPut, "/v1/community/posts/"+id+"/image", "silver", "application/octet-stream", img.Bytes()); st != 404 {
		t.Fatalf("someone else's image: %d", st)
	}
	if st, raw, _ := e.rawCall(http.MethodPut, "/v1/community/posts/"+id+"/image", "gold", "application/octet-stream", img.Bytes()); st != 204 {
		t.Fatalf("image: %d %s", st, raw)
	}
	if st, _, _ := e.rawCall(http.MethodPut, "/v1/community/posts/"+id+"/image", "gold", "application/octet-stream", []byte("<svg/>")); st != 400 {
		t.Fatalf("not an image: %d", st)
	}
	if st, got, h := e.rawCall(http.MethodGet, "/v1/community/posts/"+id+"/image", "silver", "", nil); st != 200 || h.Get("Content-Type") != "image/jpeg" || !bytes.HasPrefix(got, []byte{0xFF, 0xD8}) {
		t.Fatalf("read image: %d %s", st, h.Get("Content-Type"))
	}
	if st, _, _ := e.rawCall(http.MethodGet, "/v1/community/posts/"+id+"/image", "user", "", nil); st != 403 {
		t.Fatalf("free image: %d", st)
	}
	if st, _, _ := e.rawCall(http.MethodGet, "/v1/community/posts/"+id+"/image", "support", "", nil); st != 200 {
		t.Fatalf("staff image: %d", st)
	}

	// Lists: Silver sees the post (not theirs), free and anonymous the count only.
	st, b, raw = e.call(http.MethodGet, "/v1/community/posts", "silver", nil)
	items, _ := b["items"].([]any)
	if st != 200 || b["locked"] != false || len(items) != 1 || items[0].(map[string]any)["mine"] != false || items[0].(map[string]any)["hasImage"] != true || b["postsLeftToday"].(float64) != 3 {
		t.Fatalf("silver list: %d %s", st, raw)
	}
	for _, tok := range []string{"", "user"} {
		st, b, raw := e.call(http.MethodGet, "/v1/community/posts", tok, nil)
		if st != 200 || b["locked"] != true || b["total"].(float64) != 1 || len(b["items"].([]any)) != 0 || b["requiredPlan"] != "silver" || strings.Contains(raw, "حمایت") {
			t.Fatalf("locked list for %q: %d %s", tok, st, raw)
		}
	}

	// Three a day.
	for i := range 2 {
		if st, _, raw := e.call(http.MethodPost, "/v1/community/posts", "gold", map[string]any{"title": "تحلیل دیگر", "body": "متن تحلیل شماره\u200cی دو و سه"}); st != 201 {
			t.Fatalf("post %d: %d %s", i+2, st, raw)
		}
	}
	if st, b, _ := e.call(http.MethodPost, "/v1/community/posts", "gold", post); st != 429 || b["code"] != "RATE_LIMITED" {
		t.Fatalf("fourth post: %d %v", st, b)
	}

	// Staff hide it (audited); it leaves the feed and its image; support may not.
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/community/posts/"+id+"/status", "support", map[string]any{"status": "hidden"}); st != 403 {
		t.Fatalf("support hide: %d", st)
	}
	if st, _, raw := e.call(http.MethodPut, "/v1/admin/community/posts/"+id+"/status", "editor", map[string]any{"status": "hidden"}); st != 204 {
		t.Fatalf("hide: %d %s", st, raw)
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action = 'community.post.hidden'`); n != 1 {
		t.Fatalf("audit rows = %d", n)
	}
	if _, b, _ := e.call(http.MethodGet, "/v1/community/posts", "silver", nil); b["total"].(float64) != 2 {
		t.Fatalf("hidden still listed: %v", b["total"])
	}
	if st, _, _ := e.rawCall(http.MethodGet, "/v1/community/posts/"+id+"/image", "silver", "", nil); st != 404 {
		t.Fatalf("hidden image: %d", st)
	}
	if _, b, _ := e.call(http.MethodGet, "/v1/admin/community/posts?status=hidden", "support", nil); len(b["items"].([]any)) != 1 {
		t.Fatalf("admin list: %v", b)
	}

	// Only the author deletes.
	if st, _, _ := e.call(http.MethodDelete, "/v1/community/posts/"+id, "silver", nil); st != 404 {
		t.Fatalf("someone else's delete: %d", st)
	}
	if st, _, _ := e.call(http.MethodDelete, "/v1/community/posts/"+id, "gold", nil); st != 204 {
		t.Fatalf("delete: %d", st)
	}
}
