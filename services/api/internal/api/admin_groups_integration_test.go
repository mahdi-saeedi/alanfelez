//go:build integration

package api_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

func TestProductGroups(t *testing.T) {
	e := setup(t)
	e.seedPrices()
	e.grantGold()
	// Migration 00024's first groups need the metals, which a fresh database only gets from the seed afterwards.
	before := e.count(`SELECT count(*) FROM market.product_groups`)
	group := map[string]any{"metal": "aluminum", "category": "scrap", "nameFa": "آلیاژی"}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/groups", "support", group); st != 403 {
		t.Fatalf("support create: %d", st)
	}
	st, body, raw := e.call(http.MethodPost, "/v1/admin/groups", "editor", group)
	if st != 201 {
		t.Fatalf("create: %d %s", st, raw)
	}
	id := int(body["id"].(float64))
	steps := []struct {
		method, path, token string
		body                any
		want                int
	}{
		{http.MethodPost, "/v1/admin/groups", "editor", group, 409},
		{http.MethodPost, "/v1/admin/groups", "editor", map[string]any{"metal": "nope", "category": "scrap", "nameFa": "x"}, 404},
		{http.MethodPost, "/v1/admin/groups", "editor", map[string]any{"metal": "aluminum", "category": "scrap", "nameFa": " "}, 400},
		{http.MethodPut, "/v1/admin/products/aluminum-piston/group", "editor", map[string]any{"group": id}, 204},
		{http.MethodPut, "/v1/admin/products/copper-telecom/group", "editor", map[string]any{"group": id}, 400},
		{http.MethodPut, "/v1/admin/products/nope/group", "editor", map[string]any{"group": id}, 404},
		{http.MethodPut, "/v1/admin/products/aluminum-piston/group", "user", map[string]any{"group": id}, 403},
		{http.MethodPut, fmt.Sprintf("/v1/admin/groups/%d", id), "editor", map[string]any{"nameFa": "آلومینیوم آلیاژی", "sort": 5}, 204},
		{http.MethodPut, "/v1/admin/groups/30000", "editor", map[string]any{"nameFa": "x"}, 404},
	}
	for i, s := range steps {
		if st, _, raw := e.call(s.method, s.path, s.token, s.body); st != s.want {
			t.Fatalf("step %d %s %s as %q: %d, want %d: %s", i, s.method, s.path, s.token, st, s.want, raw)
		}
	}

	// The public list carries the group of a priced row.
	src, _ := dbq.New(e.pool).GetSourceBySlug(t.Context(), "test")
	if _, err := e.prices.Ingest(t.Context(), prices.Origin{SourceID: src.ID}, []prices.Quote{
		{Series: "aluminum-piston-free", ObservedAt: time.Now().UTC().Add(-time.Minute), Price: 1_700_000},
	}, prices.IngestOptions{}); err != nil {
		t.Fatal(err)
	}
	_, _, raw = e.call(http.MethodGet, "/v1/prices?metal=aluminum", "gold", nil)
	var list struct {
		Items []struct {
			Series struct {
				Slug  string `json:"slug"`
				Group *struct {
					Name string `json:"name"`
					Sort int    `json:"sort"`
				} `json:"group"`
			} `json:"series"`
		} `json:"items"`
	}
	if err := json.Unmarshal([]byte(raw), &list); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, it := range list.Items {
		if it.Series.Slug == "aluminum-piston-free" {
			found = it.Series.Group != nil && it.Series.Group.Name == "آلومینیوم آلیاژی" && it.Series.Group.Sort == 5
		}
	}
	if !found {
		t.Fatalf("group missing on the price row: %s", raw)
	}

	// Moving the product to another category drops its group; deleting a group keeps its products.
	if st, _, raw := e.call(http.MethodPut, "/v1/admin/products/aluminum-piston", "editor", map[string]any{"nameFa": "پیستون", "category": "raw"}); st != 204 {
		t.Fatalf("move: %d %s", st, raw)
	}
	if n := e.count(`SELECT count(*) FROM market.products WHERE slug = 'aluminum-piston' AND group_id IS NOT NULL`); n != 0 {
		t.Fatal("group kept after a category change")
	}
	if st, _, _ := e.call(http.MethodDelete, fmt.Sprintf("/v1/admin/groups/%d", id), "editor", nil); st != 204 {
		t.Fatalf("delete: %d", st)
	}
	if st, _, _ := e.call(http.MethodDelete, fmt.Sprintf("/v1/admin/groups/%d", id), "editor", nil); st != 404 {
		t.Fatalf("delete twice: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM market.products WHERE slug = 'aluminum-piston'`); n != 1 {
		t.Fatal("deleting a group deleted its product")
	}
	_, body, _ = e.call(http.MethodGet, "/v1/admin/catalog", "editor", nil)
	if len(body["groups"].([]any)) != before {
		t.Fatalf("groups in catalog: %v", body["groups"])
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action LIKE 'group.%' OR action = 'product.group'`); n != 4 {
		t.Fatalf("audit rows = %d", n)
	}
}
