package seed

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildRow_InsertMissing(t *testing.T) {
	sql, args, err := buildRow(Datasets["metals"], InsertMissing, map[string]any{"slug": "copper", "name_fa": "مس", "sort": 2})
	if err != nil {
		t.Fatal(err)
	}
	want := "INSERT INTO market.metals (name_fa, slug, sort) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING"
	if sql != want {
		t.Errorf("got  %s\nwant %s", sql, want)
	}
	if len(args) != 3 || args[1] != "copper" {
		t.Errorf("unexpected args %v", args)
	}
}

func TestBuildRow_UpsertUpdatesOnlyNonKeyColumns(t *testing.T) {
	sql, _, err := buildRow(Datasets["plan_prices"], Upsert, map[string]any{"plan_code": "gold", "period": "month", "amount_rial": 20000000})
	if err != nil {
		t.Fatal(err)
	}
	want := "INSERT INTO app.plan_prices (amount_rial, period, plan_code) VALUES ($1, $2, $3) " +
		"ON CONFLICT (plan_code, period) WHERE valid_to IS NULL DO UPDATE SET amount_rial = EXCLUDED.amount_rial"
	if sql != want {
		t.Errorf("got  %s\nwant %s", sql, want)
	}
}

func TestBuildRow_JSONColumn(t *testing.T) {
	sql, args, err := buildRow(Datasets["site_settings"], InsertMissing, map[string]any{"key": "contact", "value": map[string]any{"email": ""}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sql, "$2::jsonb") || args[1] != `{"email":""}` {
		t.Errorf("json column not encoded: %s %v", sql, args)
	}
}

func TestBuildRow_RejectsUnknownColumnAndMissingKey(t *testing.T) {
	if _, _, err := buildRow(Datasets["metals"], InsertMissing, map[string]any{"slug": "x", "drop_table": 1}); err == nil {
		t.Error("unknown column must be rejected")
	}
	if _, _, err := buildRow(Datasets["metals"], InsertMissing, map[string]any{"name_fa": "x"}); err == nil {
		t.Error("missing key must be rejected")
	}
}

func TestParse_RejectsUnknownDatasetAndBadMode(t *testing.T) {
	for name, doc := range map[string]string{
		"unknown dataset": "version: 1\ndatasets:\n  - name: users\n    rows: [{id: 1}]\n",
		"bad mode":        "version: 1\ndatasets:\n  - name: metals\n    mode: replace\n    rows: [{slug: a, name_fa: b}]\n",
		"bad version":     "version: 2\ndatasets: []\n",
	} {
		if _, err := Parse([]byte(doc)); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
}

// Every committed seed file must parse and validate against the registry.
func TestCommittedSeedFilesAreValid(t *testing.T) {
	files, err := filepath.Glob("../../../../config/seed/*/*.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatal("no seed files found")
	}
	for _, path := range files {
		raw, err := os.ReadFile(path) //nolint:gosec // test reads committed repo files
		if err != nil {
			t.Fatal(err)
		}
		if _, err := Parse(raw); err != nil {
			t.Errorf("%s: %v", path, err)
		}
	}
}
