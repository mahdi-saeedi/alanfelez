// Package jobs holds the background jobs run by `alanfelez worker` on River (ADR-0008).
//
//	prices.fetch            every source's fetch_interval_s: fetch → ingest (outlier gate) → publish
//	source_runs.cleanup     daily: delete fetch history older than 90 days (DATA_MODEL §4)
//
// Periodic jobs are built from market.sources when the worker starts; restart the worker (a rollout)
// after adding or re-timing a source.
package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertype"

	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/prices"
	"github.com/alanfelez/alanfelez/services/api/internal/prices/source"
)

// Schema is where River keeps its tables (created by migration 00002, filled by `alanfelez migrate`).
const Schema = "river"

// FetchArgs fetches one source.
type FetchArgs struct {
	Source string `json:"source"`
}

// Kind implements river.JobArgs.
func (FetchArgs) Kind() string { return "prices.fetch" }

// InsertOpts allows one attempt (the next tick is the retry) and never two fetches of a source queued at once.
func (FetchArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		MaxAttempts: 1,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: []rivertype.JobState{
			rivertype.JobStateAvailable, rivertype.JobStatePending, rivertype.JobStateRunning, rivertype.JobStateScheduled,
		}},
	}
}

// FetchWorker runs FetchArgs.
type FetchWorker struct {
	river.WorkerDefaults[FetchArgs]
	Pool     *pgxpool.Pool
	Prices   *prices.Service
	Registry *source.Registry
	Log      *slog.Logger
}

// Timeout bounds one fetch, including a first-start back-fill.
func (w *FetchWorker) Timeout(*river.Job[FetchArgs]) time.Duration { return 2 * time.Minute }

// Work fetches, ingests and records the run in market.source_runs.
func (w *FetchWorker) Work(ctx context.Context, job *river.Job[FetchArgs]) error {
	q := dbq.New(w.Pool)
	src, err := q.GetSourceBySlug(ctx, job.Args.Source)
	if err != nil {
		return fmt.Errorf("fetch %s: load source: %w", job.Args.Source, err)
	}
	if !src.Active {
		return nil
	}
	started := time.Now()
	stored, quarantined, runErr := w.run(ctx, q, src)
	run := dbq.InsertSourceRunParams{
		SourceID: src.ID, StartedAt: pgtype.Timestamptz{Time: started, Valid: true}, Status: "ok",
		Points: int32(stored), Quarantined: int32(quarantined), //nolint:gosec // bounded by batch size
	}
	if runErr != nil {
		run.Status, run.Error = "error", pgtype.Text{String: truncate(runErr.Error(), 500), Valid: true}
	}
	if err := q.InsertSourceRun(ctx, run); err != nil {
		w.Log.ErrorContext(ctx, "record source run", "source", src.Slug, "err", err)
	}
	if runErr != nil {
		w.Log.WarnContext(ctx, "source fetch failed", "source", src.Slug, "err", runErr)
		return runErr
	}
	w.Log.DebugContext(ctx, "source fetched", "source", src.Slug, "stored", stored, "quarantined", quarantined,
		"duration_ms", time.Since(started).Milliseconds())
	return nil
}

func (w *FetchWorker) run(ctx context.Context, q *dbq.Queries, src dbq.GetSourceBySlugRow) (stored, quarantined int, err error) {
	f, err := w.Registry.New(src.Provider, src.Config, source.Deps{Latest: latestFunc(q)})
	if err != nil {
		return 0, 0, err
	}
	now := time.Now()
	origin := prices.Origin{SourceID: src.ID}

	if bf, ok := f.(source.Backfiller); ok {
		has, err := q.SourceHasPoints(ctx, src.ID)
		if err != nil {
			return 0, 0, fmt.Errorf("check history: %w", err)
		}
		if !has {
			history, err := bf.Backfill(ctx, now)
			if err != nil {
				return 0, 0, fmt.Errorf("backfill: %w", err)
			}
			res, err := w.Prices.Ingest(ctx, origin, history, prices.IngestOptions{})
			if err != nil {
				return 0, 0, fmt.Errorf("backfill ingest: %w", err)
			}
			s, qq := count(res)
			w.Log.InfoContext(ctx, "source back-filled", "source", src.Slug, "points", s, "quarantined", qq)
		}
	}

	quotes, err := f.Fetch(ctx, now)
	if err != nil {
		return 0, 0, err
	}
	res, err := w.Prices.Ingest(ctx, origin, quotes, prices.IngestOptions{Publish: true})
	if err != nil {
		return 0, 0, err
	}
	stored, quarantined = count(res)
	return stored, quarantined, nil
}

func count(res []prices.Result) (stored, quarantined int) {
	for _, r := range res {
		switch r.Outcome {
		case prices.Stored:
			stored++
		case prices.Quarantined:
			quarantined++
		}
	}
	return stored, quarantined
}

func latestFunc(q *dbq.Queries) func(context.Context) (map[string]int64, error) {
	return func(ctx context.Context) (map[string]int64, error) {
		rows, err := q.LatestPriceBySlug(ctx)
		if err != nil {
			return nil, fmt.Errorf("latest prices: %w", err)
		}
		out := make(map[string]int64, len(rows))
		for _, r := range rows {
			out[r.Slug] = r.PriceMinor
		}
		return out, nil
	}
}

// CleanupArgs deletes old fetch history.
type CleanupArgs struct{}

// Kind implements river.JobArgs.
func (CleanupArgs) Kind() string { return "source_runs.cleanup" }

// CleanupWorker runs CleanupArgs.
type CleanupWorker struct {
	river.WorkerDefaults[CleanupArgs]
	Pool *pgxpool.Pool
	Log  *slog.Logger
}

// sourceRunRetention matches DATA_MODEL §4.
const sourceRunRetention = 90 * 24 * time.Hour

// Work implements river.Worker.
func (w *CleanupWorker) Work(ctx context.Context, _ *river.Job[CleanupArgs]) error {
	n, err := dbq.New(w.Pool).DeleteOldSourceRuns(ctx, pgtype.Timestamptz{Time: time.Now().Add(-sourceRunRetention), Valid: true})
	if err != nil {
		return fmt.Errorf("cleanup source runs: %w", err)
	}
	w.Log.InfoContext(ctx, "old source runs deleted", "rows", n)
	return nil
}

// Config wires the River client.
type Config struct {
	Pool     *pgxpool.Pool
	Prices   *prices.Service
	Registry *source.Registry
	Log      *slog.Logger
	// RiverLog receives River's own logs (keep it at warn: River is chatty at debug/info).
	RiverLog *slog.Logger
}

// NewClient builds the River client with one periodic fetch job per active, fetchable source.
func NewClient(ctx context.Context, c Config) (*river.Client[pgx.Tx], error) {
	workers := river.NewWorkers()
	river.AddWorker(workers, &FetchWorker{Pool: c.Pool, Prices: c.Prices, Registry: c.Registry, Log: c.Log})
	river.AddWorker(workers, &CleanupWorker{Pool: c.Pool, Log: c.Log})

	sources, err := dbq.New(c.Pool).ListSources(ctx)
	if err != nil {
		return nil, fmt.Errorf("jobs: list sources: %w", err)
	}
	periodic := []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(24*time.Hour), func() (river.JobArgs, *river.InsertOpts) {
			return CleanupArgs{}, nil
		}, &river.PeriodicJobOpts{ID: "source_runs.cleanup"}),
	}
	for _, s := range sources {
		if !s.Active || s.Provider == source.ProviderManual {
			continue
		}
		if _, err := c.Registry.New(s.Provider, s.Config, source.Deps{}); err != nil {
			// Unknown provider (e.g. demo in production) or bad config: skip it, but say so loudly.
			c.Log.ErrorContext(ctx, "source disabled: cannot build adapter", "source", s.Slug, "provider", s.Provider, "err", err)
			continue
		}
		slug := s.Slug
		periodic = append(periodic, river.NewPeriodicJob(
			river.PeriodicInterval(time.Duration(s.FetchIntervalS)*time.Second),
			func() (river.JobArgs, *river.InsertOpts) { return FetchArgs{Source: slug}, nil },
			&river.PeriodicJobOpts{ID: "prices.fetch." + slug, RunOnStart: true},
		))
		c.Log.InfoContext(ctx, "source scheduled", "source", slug, "provider", s.Provider, "every_s", s.FetchIntervalS)
	}

	client, err := river.NewClient(riverpgxv5.New(c.Pool), &river.Config{
		Schema:       Schema,
		Logger:       c.RiverLog,
		Queues:       map[string]river.QueueConfig{river.QueueDefault: {MaxWorkers: 4}},
		Workers:      workers,
		PeriodicJobs: periodic,
	})
	if err != nil {
		return nil, fmt.Errorf("jobs: river client: %w", err)
	}
	return client, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
