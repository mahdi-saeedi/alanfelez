// Package db owns the PostgreSQL connection pool.
package db

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Connect opens a pool and waits (with backoff) until the database accepts connections
// or ctx expires. Waiting makes container start order irrelevant (compose, Kubernetes).
func Connect(ctx context.Context, url string, log *slog.Logger) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("db: parse url: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: new pool: %w", err)
	}
	backoff := 500 * time.Millisecond
	for {
		pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		err = pool.Ping(pingCtx)
		cancel()
		if err == nil {
			return pool, nil
		}
		log.Warn("database not ready, retrying", "err", err, "in", backoff)
		select {
		case <-ctx.Done():
			pool.Close()
			return nil, fmt.Errorf("db: gave up waiting for database: %w", err)
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, 5*time.Second)
	}
}
