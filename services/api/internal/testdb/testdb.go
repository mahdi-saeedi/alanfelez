//go:build integration

// Package testdb gives integration tests a fresh, migrated and seeded Postgres database.
//
//	TEST_DATABASE_URL=postgres://alanfelez:alanfelez@localhost:15432/postgres?sslmode=disable \
//	  go test -tags integration ./...          (or: task test:integration)
//
// Each call creates a throwaway database (the role needs CREATEDB) and drops it when the test ends.
// Without TEST_DATABASE_URL the test is skipped.
package testdb

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"io"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver for goose
	"github.com/pressly/goose/v3"

	"github.com/alanfelez/alanfelez/services/api/internal/seed"
	"github.com/alanfelez/alanfelez/services/api/migrations"
)

// New returns a pool on a new database with every migration and the "reference" seed profile applied.
func New(t *testing.T) *pgxpool.Pool {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	name := "it_" + randomHex(6)

	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatalf("testdb: connect: %v", err)
	}
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("testdb: create database: %v", err)
	}
	_ = admin.Close(ctx)

	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("testdb: parse url: %v", err)
	}
	u.Path = "/" + name
	dsn := u.String()

	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("testdb: open: %v", err)
	}
	p, err := goose.NewProvider(goose.DialectPostgres, sqlDB, migrations.FS)
	if err != nil {
		t.Fatalf("testdb: goose: %v", err)
	}
	if _, err := p.Up(ctx); err != nil {
		t.Fatalf("testdb: migrate: %v", err)
	}
	_ = sqlDB.Close()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("testdb: pool: %v", err)
	}
	quiet := slog.New(slog.NewTextHandler(io.Discard, nil))
	if err := seed.Apply(ctx, pool, seed.Options{Dir: seedDir(), Profiles: []string{"reference"}}, quiet); err != nil {
		t.Fatalf("testdb: seed: %v", err)
	}

	t.Cleanup(func() {
		pool.Close()
		c, err := pgx.Connect(context.Background(), base)
		if err != nil {
			return
		}
		defer func() { _ = c.Close(context.Background()) }()
		_, _ = c.Exec(context.Background(), "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
	})
	return pool
}

// seedDir is config/seed at the repository root, found relative to this file.
func seedDir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "config", "seed")
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
