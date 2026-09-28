// Command alanfelez is the single backend binary. One image, several roles:
//
//	alanfelez serve       HTTP API
//	alanfelez migrate     apply database migrations (goose, embedded)
//	alanfelez seed        load initial data from config/seed (idempotent)
//	alanfelez bootstrap   migrate + seed; run once per deploy (compose job / Argo CD PreSync hook)
//	alanfelez healthcheck exit 0 if the local server is ready (container HEALTHCHECK; image has no curl)
//	alanfelez version     print build information
//
// Kubernetes runs the same image with different args, so the schema, seed loader and
// API that ship together are always the versions that were tested together.
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver for goose
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
	"github.com/redis/go-redis/v9"

	"github.com/alanfelez/alanfelez/services/api/internal/api"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/config"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/db"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/httpx"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/logx"
	"github.com/alanfelez/alanfelez/services/api/internal/seed"
	"github.com/alanfelez/alanfelez/services/api/migrations"
)

// Set at build time: -ldflags "-X main.version=… -X main.commit=…"
var (
	version = "dev"
	commit  = "none"
)

const usage = `usage: alanfelez <serve|migrate|seed|bootstrap|healthcheck|version> [flags]`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}
	cmd, args := os.Args[1], os.Args[2:]
	switch cmd {
	case "version":
		fmt.Printf("alanfelez %s (%s)\n", version, commit)
		return
	case "healthcheck":
		os.Exit(healthcheck())
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	log := logx.New(os.Stdout, cfg.LogLevel, cfg.LogFormat).With("app", "alanfelez", "cmd", cmd, "version", version, "env", cfg.Env)
	slog.SetDefault(log)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	switch cmd {
	case "serve":
		err = serve(ctx, cfg, log)
	case "migrate":
		err = migrate(ctx, cfg, log)
	case "seed":
		fs := flag.NewFlagSet("seed", flag.ExitOnError)
		force := fs.Bool("force", false, "re-apply seed files even if unchanged")
		_ = fs.Parse(args)
		err = runSeed(ctx, cfg, log, *force)
	case "bootstrap":
		if err = migrate(ctx, cfg, log); err == nil {
			err = runSeed(ctx, cfg, log, false)
		}
	default:
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}
	if err != nil {
		log.Error("command failed", "err", err)
		os.Exit(1)
	}
}

func serve(ctx context.Context, cfg config.Config, log *slog.Logger) error {
	startCtx, cancel := context.WithTimeout(ctx, cfg.StartupTimeout)
	defer cancel()

	pool, err := db.Connect(startCtx, cfg.DatabaseURL, log)
	if err != nil {
		return err
	}
	defer pool.Close()

	ropts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return fmt.Errorf("redis: parse url: %w", err)
	}
	rdb := redis.NewClient(ropts)
	defer func() { _ = rdb.Close() }()

	router := httpx.NewRouter(log, cfg.CORSOrigins, map[string]httpx.Pinger{
		"postgres": pool,
		"redis":    redisPinger{rdb},
	})
	strict := api.NewStrictHandlerWithOptions(api.NewServer(dbq.New(pool)), nil, api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  httpx.RequestErrorHandler,
		ResponseErrorHandlerFunc: httpx.ResponseErrorHandler(log),
	})
	api.HandlerWithOptions(strict, api.ChiServerOptions{BaseRouter: router, ErrorHandlerFunc: httpx.RequestErrorHandler})

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		IdleTimeout:       120 * time.Second,
		// No WriteTimeout: SSE streams are long-lived; per-route timeouts apply instead.
	}
	errCh := make(chan error, 1)
	go func() {
		log.Info("http server listening", "addr", cfg.HTTPAddr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("http server: %w", err)
		}
		return nil
	case <-ctx.Done():
	}
	log.Info("shutting down", "timeout", cfg.ShutdownTimeout)
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancelShutdown()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("http server shutdown: %w", err)
	}
	return nil
}

// healthcheck probes /readyz on the local server (address from HTTP_ADDR).
func healthcheck() int {
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	if addr[0] == ':' {
		addr = "127.0.0.1" + addr
	}
	c := http.Client{Timeout: 3 * time.Second}
	resp, err := c.Get("http://" + addr + "/readyz") //nolint:gosec,noctx // loopback probe; address comes from our own HTTP_ADDR
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		fmt.Fprintln(os.Stderr, "not ready:", resp.Status)
		return 1
	}
	return 0
}

type redisPinger struct{ c *redis.Client }

func (p redisPinger) Ping(ctx context.Context) error {
	if err := p.c.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis ping: %w", err)
	}
	return nil
}

// migrate applies all pending migrations. A Postgres session lock makes concurrent runs safe.
func migrate(ctx context.Context, cfg config.Config, log *slog.Logger) error {
	startCtx, cancel := context.WithTimeout(ctx, cfg.StartupTimeout)
	defer cancel()
	// Wait for the database with the same backoff as the server.
	pool, err := db.Connect(startCtx, cfg.DatabaseURL, log)
	if err != nil {
		return err
	}
	pool.Close()

	sqlDB, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("migrate: open: %w", err)
	}
	defer func() { _ = sqlDB.Close() }()

	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return fmt.Errorf("migrate: locker: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, migrations.FS, goose.WithSessionLocker(locker))
	if err != nil {
		return fmt.Errorf("migrate: provider: %w", err)
	}
	results, err := provider.Up(ctx)
	if err != nil {
		return fmt.Errorf("migrate: up: %w", err)
	}
	for _, r := range results {
		log.Info("migration applied", "version", r.Source.Version, "file", r.Source.Path, "duration", r.Duration)
	}
	current, err := provider.GetDBVersion(ctx)
	if err != nil {
		return fmt.Errorf("migrate: version: %w", err)
	}
	log.Info("database schema up to date", "version", current, "applied_now", len(results))
	return nil
}

func runSeed(ctx context.Context, cfg config.Config, log *slog.Logger, force bool) error {
	startCtx, cancel := context.WithTimeout(ctx, cfg.StartupTimeout)
	defer cancel()
	pool, err := db.Connect(startCtx, cfg.DatabaseURL, log)
	if err != nil {
		return err
	}
	defer pool.Close()
	return applySeed(ctx, pool, cfg, log, force)
}

func applySeed(ctx context.Context, pool *pgxpool.Pool, cfg config.Config, log *slog.Logger, force bool) error {
	log.Info("seeding", "dir", cfg.Seed.Dir, "profiles", cfg.Seed.Profiles, "force", force)
	return seed.Apply(ctx, pool, seed.Options{Dir: cfg.Seed.Dir, Profiles: cfg.Seed.Profiles, Force: force}, log)
}
