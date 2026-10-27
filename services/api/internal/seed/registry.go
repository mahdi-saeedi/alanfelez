package seed

// Column describes how a seed value is written.
type Column struct {
	JSON bool // value is marshalled to JSON and cast to jsonb
	// Ref resolves a natural key to a foreign-key id with a sub-select, e.g. a product
	// row written as `metal: copper` becomes (SELECT id FROM market.metals WHERE slug = $n).
	Ref *Ref
	// Ago writes the value (a number of days) as a time relative to when the seed runs, into the column named
	// here, e.g. `published_days_ago: 2` → published_at = now() − 2 days. For demo content that should look fresh.
	Ago string
}

// Ref is a natural-key reference to another table.
type Ref struct {
	Table    string // referenced table
	By       string // natural-key column in the referenced table
	IDColumn string // column written in this table
}

// Dataset whitelists a table that seed files may write to. Only tables and columns
// listed here can be touched, so seed files cannot inject arbitrary SQL.
type Dataset struct {
	Table         string
	Key           []string // conflict target (natural key)
	ConflictWhere string   // predicate of a partial unique index, if the key is partial
	Columns       map[string]Column
}

// Datasets is the registry of seedable data. Add an entry when a new table needs
// initial data, together with a migration and a seed file.
var Datasets = map[string]Dataset{
	"metals": {
		Table:   "market.metals",
		Key:     []string{"slug"},
		Columns: map[string]Column{"slug": {}, "name_fa": {}, "name_en": {}, "sort": {}},
	},
	"product_categories": {
		Table:   "market.product_categories",
		Key:     []string{"slug"},
		Columns: map[string]Column{"slug": {}, "name_fa": {}, "name_en": {}, "sort": {}},
	},
	"markets": {
		Table:   "market.markets",
		Key:     []string{"slug"},
		Columns: map[string]Column{"slug": {}, "name_fa": {}, "name_en": {}, "scope": {}, "sort": {}},
	},
	"products": {
		Table: "market.products",
		Key:   []string{"slug"},
		Columns: map[string]Column{
			"slug": {}, "name_fa": {}, "name_en": {}, "sort": {}, "active": {},
			"metal":    {Ref: &Ref{Table: "market.metals", By: "slug", IDColumn: "metal_id"}},
			"category": {Ref: &Ref{Table: "market.product_categories", By: "slug", IDColumn: "category_id"}},
		},
	},
	"sources": {
		Table: "market.sources",
		Key:   []string{"slug"},
		Columns: map[string]Column{
			"slug": {}, "name_fa": {}, "name_en": {}, "provider": {}, "config": {JSON: true},
			"fetch_interval_s": {}, "stale_after_s": {}, "active": {},
		},
	},
	"price_series": {
		Table: "market.price_series",
		Key:   []string{"slug"},
		Columns: map[string]Column{
			"slug": {}, "currency": {}, "unit": {}, "is_base": {}, "max_jump_bp": {}, "sort": {}, "active": {},
			"product": {Ref: &Ref{Table: "market.products", By: "slug", IDColumn: "product_id"}},
			"market":  {Ref: &Ref{Table: "market.markets", By: "slug", IDColumn: "market_id"}},
		},
	},
	"plans": {
		Table:   "app.plans",
		Key:     []string{"code"},
		Columns: map[string]Column{"code": {}, "name_fa": {}, "name_en": {}, "rank": {}, "active": {}},
	},
	"plan_prices": {
		Table:         "app.plan_prices",
		Key:           []string{"plan_code", "period"},
		ConflictWhere: "valid_to IS NULL",
		Columns:       map[string]Column{"plan_code": {}, "period": {}, "amount_rial": {}},
	},
	"feature_flags": {
		Table:   "app.feature_flags",
		Key:     []string{"key"},
		Columns: map[string]Column{"key": {}, "enabled": {}, "rules": {JSON: true}, "description": {}, "owner": {}},
	},
	"site_settings": {
		Table:   "app.site_settings",
		Key:     []string{"key"},
		Columns: map[string]Column{"key": {}, "value": {JSON: true}},
	},
	"article_categories": {
		Table:   "app.article_categories",
		Key:     []string{"slug"},
		Columns: map[string]Column{"slug": {}, "name_fa": {}, "name_en": {}, "sort": {}},
	},
	"articles": {
		Table: "app.articles",
		Key:   []string{"slug"},
		Columns: map[string]Column{
			"slug": {}, "type": {}, "status": {}, "outlook": {}, "featured": {}, "title_fa": {}, "title_en": {},
			"summary_fa": {}, "summary_en": {}, "body_fa": {}, "body_en": {}, "author_fa": {}, "author_en": {},
			"cover_url": {}, "read_minutes": {},
			"published_days_ago": {Ago: "published_at"},
			"category":           {Ref: &Ref{Table: "app.article_categories", By: "slug", IDColumn: "category_id"}},
			"metal":              {Ref: &Ref{Table: "market.metals", By: "slug", IDColumn: "metal_id"}},
		},
	},
	// Demo auctions only (staff enter the real ones); a fixed id per row so a re-seed doesn't duplicate them.
	"auctions": {
		Table: "market.auctions",
		Key:   []string{"id"},
		Columns: map[string]Column{
			"id": {}, "title_fa": {}, "title_en": {}, "category": {}, "quantity": {}, "unit": {}, "status": {},
			"location_fa": {}, "location_en": {}, "organizer_fa": {}, "organizer_en": {}, "details_fa": {}, "details_en": {},
			"metal":             {Ref: &Ref{Table: "market.metals", By: "slug", IDColumn: "metal_id"}},
			"created_days_ago":  {Ago: "created_at"},
			"deadline_days_ago": {Ago: "deadline_at"},
		},
	},
	"faq_categories": {
		Table:   "app.faq_categories",
		Key:     []string{"slug"},
		Columns: map[string]Column{"slug": {}, "name_fa": {}, "name_en": {}, "sort": {}},
	},
	"faq_items": {
		Table: "app.faq_items",
		Key:   []string{"slug"},
		Columns: map[string]Column{
			"slug": {}, "question_fa": {}, "question_en": {}, "answer_fa": {}, "answer_en": {}, "popular": {}, "published": {}, "sort": {},
			"category": {Ref: &Ref{Table: "app.faq_categories", By: "slug", IDColumn: "category_id"}},
		},
	},
	"pages": {
		Table:   "app.pages",
		Key:     []string{"slug"},
		Columns: map[string]Column{"slug": {}, "title_fa": {}, "title_en": {}, "body_fa": {}, "body_en": {}, "published": {}},
	},
}
