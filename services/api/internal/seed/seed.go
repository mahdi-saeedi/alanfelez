// Package seed loads initial data from versioned YAML files (config/seed/<profile>/*.yaml)
// into the database. It is idempotent and safe to run on every deploy (ADR-0021):
//
//   - mode "insert_missing" (default) only adds rows whose natural key does not exist yet,
//     so later edits made in the admin panel are never overwritten;
//   - mode "upsert" makes the database match the file (use for data owned by code);
//   - files whose checksum is unchanged since the last run are skipped;
//   - a transaction-scoped advisory lock serialises concurrent runs (replicas, jobs).
package seed

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/goccy/go-yaml"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Mode controls conflict handling for a dataset block.
type Mode string

const (
	// InsertMissing adds rows whose natural key is new and never overwrites existing rows.
	InsertMissing Mode = "insert_missing"
	// Upsert makes existing rows match the file (for data owned by code only).
	Upsert Mode = "upsert"
)

// lockKey is an arbitrary constant shared by every seeding process.
const lockKey int64 = 0x616c616e_73656564 // "alanseed"

// File is the on-disk format of one seed file.
type File struct {
	Version  int     `yaml:"version"`
	Datasets []Block `yaml:"datasets"`
}

// Block is one dataset inside a seed file.
type Block struct {
	Name string           `yaml:"name"`
	Mode Mode             `yaml:"mode"`
	Rows []map[string]any `yaml:"rows"`
}

// Options configure a seeding run.
type Options struct {
	Dir      string   // root directory containing one sub-directory per profile
	Profiles []string // applied in order
	Force    bool     // re-apply files even if their checksum is unchanged
}

// Apply runs every seed file of every profile in order.
func Apply(ctx context.Context, pool *pgxpool.Pool, opts Options, log *slog.Logger) error {
	for _, profile := range opts.Profiles {
		files, err := filepath.Glob(filepath.Join(opts.Dir, profile, "*.yaml"))
		if err != nil {
			return fmt.Errorf("seed: list %s: %w", profile, err)
		}
		if len(files) == 0 {
			return fmt.Errorf("seed: profile %q has no files in %s", profile, filepath.Join(opts.Dir, profile))
		}
		slices.Sort(files)
		for _, path := range files {
			if err := applyFile(ctx, pool, profile, path, opts.Force, log); err != nil {
				return err
			}
		}
	}
	return nil
}

func applyFile(ctx context.Context, pool *pgxpool.Pool, profile, path string, force bool, log *slog.Logger) error {
	raw, err := os.ReadFile(path) //nolint:gosec // path comes from the configured seed directory, not from users
	if err != nil {
		return fmt.Errorf("seed: read %s: %w", path, err)
	}
	sum := sha256.Sum256(raw)
	checksum := hex.EncodeToString(sum[:])
	name := filepath.Base(path)

	f, err := Parse(raw)
	if err != nil {
		return fmt.Errorf("seed: %s: %w", path, err)
	}

	err = pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", lockKey); err != nil {
			return fmt.Errorf("seed: lock: %w", err)
		}
		var prev string
		err := tx.QueryRow(ctx, "SELECT checksum FROM app.seed_runs WHERE profile = $1 AND file = $2", profile, name).Scan(&prev)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("seed: read seed_runs: %w", err)
		}
		if prev == checksum && !force {
			log.Info("seed file unchanged, skipped", "profile", profile, "file", name)
			return nil
		}

		total := 0
		for _, b := range f.Datasets {
			n, err := applyBlock(ctx, tx, b)
			if err != nil {
				return fmt.Errorf("seed: %s: dataset %q: %w", name, b.Name, err)
			}
			total += n
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO app.seed_runs (profile, file, checksum, rows) VALUES ($1, $2, $3, $4)
			ON CONFLICT (profile, file) DO UPDATE SET checksum = EXCLUDED.checksum, rows = EXCLUDED.rows, applied_at = now()`,
			profile, name, checksum, total)
		if err != nil {
			return fmt.Errorf("seed: record run: %w", err)
		}
		log.Info("seed file applied", "profile", profile, "file", name, "rows_written", total)
		return nil
	})
	if err != nil {
		return fmt.Errorf("seed: %s: %w", name, err)
	}
	return nil
}

// Parse decodes and validates a seed file without touching the database.
func Parse(raw []byte) (File, error) {
	var f File
	if err := yaml.Unmarshal(raw, &f); err != nil {
		return f, fmt.Errorf("parse yaml: %w", err)
	}
	if f.Version != 1 {
		return f, fmt.Errorf("unsupported version %d (want 1)", f.Version)
	}
	for i := range f.Datasets {
		b := &f.Datasets[i]
		if b.Mode == "" {
			b.Mode = InsertMissing
		}
		if _, _, err := buildBlock(*b); err != nil {
			return f, fmt.Errorf("dataset %q: %w", b.Name, err)
		}
	}
	return f, nil
}

func applyBlock(ctx context.Context, tx pgx.Tx, b Block) (int, error) {
	stmts, args, err := buildBlock(b)
	if err != nil {
		return 0, err
	}
	written := 0
	for i, sql := range stmts {
		tag, err := tx.Exec(ctx, sql, args[i]...)
		if err != nil {
			return written, fmt.Errorf("row %d: %w", i+1, err)
		}
		written += int(tag.RowsAffected())
	}
	return written, nil
}

// buildBlock turns every row into one parameterised INSERT … ON CONFLICT statement.
func buildBlock(b Block) ([]string, [][]any, error) {
	ds, ok := Datasets[b.Name]
	if !ok {
		return nil, nil, fmt.Errorf("unknown dataset (add it to seed.Datasets)")
	}
	if b.Mode != InsertMissing && b.Mode != Upsert {
		return nil, nil, fmt.Errorf("mode must be %q or %q", InsertMissing, Upsert)
	}
	stmts := make([]string, 0, len(b.Rows))
	args := make([][]any, 0, len(b.Rows))
	for i, row := range b.Rows {
		sql, a, err := buildRow(ds, b.Mode, row)
		if err != nil {
			return nil, nil, fmt.Errorf("row %d: %w", i+1, err)
		}
		stmts = append(stmts, sql)
		args = append(args, a)
	}
	return stmts, args, nil
}

func buildRow(ds Dataset, mode Mode, row map[string]any) (string, []any, error) {
	for _, k := range ds.Key {
		if _, ok := row[k]; !ok {
			return "", nil, fmt.Errorf("missing key column %q", k)
		}
	}
	names := make([]string, 0, len(row))
	for name := range row {
		if _, ok := ds.Columns[name]; !ok {
			return "", nil, fmt.Errorf("column %q is not allowed for this dataset", name)
		}
		names = append(names, name)
	}
	slices.Sort(names) // deterministic SQL

	cols := make([]string, 0, len(names))
	vals := make([]string, 0, len(names))
	args := make([]any, 0, len(names))
	for _, name := range names {
		col, v := ds.Columns[name], row[name]
		args = append(args, v)
		ph := fmt.Sprintf("$%d", len(args))
		switch {
		case col.JSON:
			b, err := json.Marshal(v)
			if err != nil {
				return "", nil, fmt.Errorf("column %q: %w", name, err)
			}
			args[len(args)-1] = string(b)
			cols, vals = append(cols, name), append(vals, ph+"::jsonb")
		case col.Ref != nil:
			cols = append(cols, col.Ref.IDColumn)
			vals = append(vals, fmt.Sprintf("(SELECT id FROM %s WHERE %s = %s)", col.Ref.Table, col.Ref.By, ph))
		default:
			cols, vals = append(cols, name), append(vals, ph)
		}
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s)",
		ds.Table, strings.Join(cols, ", "), strings.Join(vals, ", "), strings.Join(ds.Key, ", "))
	if ds.ConflictWhere != "" {
		sb.WriteString(" WHERE " + ds.ConflictWhere)
	}
	var updates []string
	if mode == Upsert {
		for _, c := range cols {
			if !slices.Contains(ds.Key, c) {
				updates = append(updates, fmt.Sprintf("%s = EXCLUDED.%s", c, c))
			}
		}
	}
	if len(updates) > 0 {
		sb.WriteString(" DO UPDATE SET " + strings.Join(updates, ", "))
	} else {
		sb.WriteString(" DO NOTHING")
	}
	return sb.String(), args, nil
}
