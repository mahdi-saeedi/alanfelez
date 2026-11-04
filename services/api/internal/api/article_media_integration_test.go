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

// Article picture and Aparat video (client, 2026-11-04).
func TestArticleMedia(t *testing.T) {
	e := setup(t)
	in := article("analysis", "copper-video", "published")
	in["videoUrl"] = "https://www.youtube.com/watch?v=x"
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/articles", "editor", in); st != 400 {
		t.Fatalf("non-Aparat video: %d", st)
	}
	in["videoUrl"] = "aparat.com/v/abc123?x=1"
	st, body, raw := e.call(http.MethodPost, "/v1/admin/articles", "editor", in)
	if st != 201 || body["videoUrl"] != "https://www.aparat.com/v/abc123" {
		t.Fatalf("create: %d %s", st, raw)
	}
	id := body["id"].(string)

	var img bytes.Buffer
	_ = png.Encode(&img, image.NewRGBA(image.Rect(0, 0, 1200, 675)))
	for _, c := range []struct {
		tok  string
		want int
	}{{"", 401}, {"support", 403}, {"editor", 204}} {
		if st, raw, _ := e.rawCall(http.MethodPut, "/v1/admin/articles/"+id+"/image", c.tok, "application/octet-stream", img.Bytes()); st != c.want {
			t.Fatalf("upload as %q: %d %s", c.tok, st, raw)
		}
	}
	if st, _, _ := e.rawCall(http.MethodPut, "/v1/admin/articles/00000000-0000-0000-0000-00000000abcd/image", "editor", "application/octet-stream", img.Bytes()); st != 404 {
		t.Fatalf("unknown article: %d", st)
	}
	if st, _, _ := e.rawCall(http.MethodPut, "/v1/admin/articles/"+id+"/image", "editor", "application/octet-stream", []byte("not an image")); st != 400 {
		t.Fatalf("not an image: %d", st)
	}

	// Public: the cover points at the website's image route; the picture is for everyone, the video only with the body.
	_, body, raw = e.call(http.MethodGet, "/v1/articles/copper-video", "", nil)
	if cover, _ := body["coverUrl"].(string); !strings.HasPrefix(cover, "/api/articles/"+id+"/image?v=") || body["videoUrl"] != nil || body["locked"] != true {
		t.Fatalf("anonymous article: %s", raw)
	}
	if st, raw, _ := e.rawCall(http.MethodGet, "/v1/articles/"+id+"/image", "", "", nil); st != 200 || !bytes.HasPrefix(raw, []byte{0xff, 0xd8}) {
		t.Fatalf("public image: %d", st)
	}
	e.grantGold()
	if _, body, _ := e.call(http.MethodGet, "/v1/articles/copper-video", "gold", nil); body["videoUrl"] != "https://www.aparat.com/v/abc123" {
		t.Fatalf("gold article video: %v", body["videoUrl"])
	}

	// Saving the form with an old (empty) cover keeps the uploaded picture; removing it clears the cover.
	in["coverUrl"] = ""
	if st, body, raw := e.call(http.MethodPut, "/v1/admin/articles/"+id, "editor", in); st != 200 || !strings.HasPrefix(body["coverUrl"].(string), "/api/articles/") {
		t.Fatalf("update keeps the picture: %d %s", st, raw)
	}
	if st, _, _ := e.call(http.MethodDelete, "/v1/admin/articles/"+id+"/image", "editor", nil); st != 204 {
		t.Fatalf("delete: %d", st)
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/admin/articles/"+id, "editor", nil); body["coverUrl"] != nil {
		t.Fatalf("cover after delete: %v", body["coverUrl"])
	}
	if st, _, _ := e.rawCall(http.MethodGet, "/v1/articles/"+id+"/image", "", "", nil); st != 404 {
		t.Fatalf("deleted image: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action IN ('article.image', 'article.image_delete')`); n != 2 {
		t.Fatalf("audit rows: %d", n)
	}

	// «مقالات» (client, 2026-11-04): educational articles are open to everyone.
	edu := article("article", "what-is-cathode", "published")
	if st, _, raw := e.call(http.MethodPost, "/v1/admin/articles", "editor", edu); st != 201 {
		t.Fatalf("create article: %d %s", st, raw)
	}
	if _, body, raw := e.call(http.MethodGet, "/v1/articles/what-is-cathode", "", nil); body["locked"] != false || body["body"] == nil {
		t.Fatalf("educational article for a visitor: %s", raw)
	}
}
