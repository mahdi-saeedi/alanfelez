package prices

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Point statuses (market.price_points.status).
const (
	StatusPublished   = "published"
	StatusQuarantined = "quarantined"
	StatusRejected    = "rejected"
)

// Quote is one price observation from a source, in the series' minor unit.
type Quote struct {
	Series     string
	ObservedAt time.Time
	Price      int64
	Force      bool // manual only: store even above the outlier threshold
}

// Origin says where a batch of quotes comes from.
type Origin struct {
	SourceID int16
	Manual   bool         // staff entry: a jump is refused (not quarantined) unless the quote has Force
	Actor    *audit.Actor // required for manual entries (audit log)
}

// Outcome of one quote.
type Outcome string

// Outcomes of Ingest.
const (
	Stored      Outcome = "stored"      // published
	Quarantined Outcome = "quarantined" // stored, held back until staff review (automated sources)
	Jump        Outcome = "jump"        // manual entry above the threshold without Force; nothing stored
	Duplicate   Outcome = "duplicate"   // a point already exists at that time
	Invalid     Outcome = "invalid"     // unknown or inactive series, bad price or time
	OK          Outcome = "ok"          // dry run: would be stored
)

// Result reports what happened to one quote.
type Result struct {
	Index    int
	Series   string
	Outcome  Outcome
	PointID  int64
	Previous *int64 // the price the quote is compared with: the latest, or for a back-dated quote the one around its time
	JumpBp   int64
	Message  string
}

// Event is a published price change, fanned out to live clients (internal/prices/live).
type Event struct {
	PointID    int64     `json:"pointId"`
	SeriesID   int32     `json:"seriesId"`
	Series     string    `json:"series"`
	IsBase     bool      `json:"isBase"`
	Currency   string    `json:"currency"`
	Unit       string    `json:"unit"`
	Price      int64     `json:"price"`
	ObservedAt time.Time `json:"observedAt"`
	PrevClose  *int64    `json:"prevClose,omitempty"`
}

// Publisher delivers events after the transaction that produced them has committed.
type Publisher interface {
	Publish(ctx context.Context, events []Event) error
}

// Errors returned to handlers (mapped to problem codes in internal/api).
var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

// Service writes price data. Reads go straight through dbq from the handlers.
type Service struct {
	pool *pgxpool.Pool
	pub  Publisher
	log  *slog.Logger
	now  func() time.Time
}

// NewService wires the service. pub may be nil (no live fan-out, e.g. in tests or back-fills).
func NewService(pool *pgxpool.Pool, pub Publisher, log *slog.Logger) *Service {
	return &Service{pool: pool, pub: pub, log: log, now: time.Now}
}

// IngestOptions tune one Ingest call.
type IngestOptions struct {
	DryRun  bool // validate and report, store nothing
	Publish bool // send live events for published points
}

// maxFutureSkew tolerates small clock differences between sources and us.
const maxFutureSkew = 2 * time.Minute

// Ingest stores quotes in one transaction. Each quote is checked on its own: unknown series, duplicates and
// jumps are reported per row and don't fail the batch. A database error fails (and rolls back) the whole batch.
func (s *Service) Ingest(ctx context.Context, o Origin, quotes []Quote, opt IngestOptions) ([]Result, error) {
	if o.Manual && o.Actor == nil {
		return nil, errors.New("prices: manual ingest needs an actor")
	}
	results := make([]Result, len(quotes))
	var events []Event

	err := inTx(ctx, s.pool, func(q *dbq.Queries) error {
		series, err := s.lookupSeries(ctx, q, quotes)
		if err != nil {
			return err
		}
		now := s.now()
		for i, qt := range quotes {
			r := &results[i]
			*r = Result{Index: i, Series: qt.Series}
			sr, ok := series[qt.Series]
			switch {
			case !ok:
				r.Outcome, r.Message = Invalid, "unknown series"
				continue
			case !sr.Active:
				r.Outcome, r.Message = Invalid, "series is inactive"
				continue
			case qt.Price <= 0:
				r.Outcome, r.Message = Invalid, "price must be positive"
				continue
			case qt.ObservedAt.After(now.Add(maxFutureSkew)):
				r.Outcome, r.Message = Invalid, "observedAt is in the future"
				continue
			}
			ev, err := s.ingestOne(ctx, q, o, sr, qt, opt.DryRun, r)
			if err != nil {
				return fmt.Errorf("ingest %s: %w", qt.Series, err)
			}
			if ev != nil {
				events = append(events, *ev)
			}
		}
		if opt.DryRun {
			return errDryRun
		}
		return nil
	})
	if err != nil && !errors.Is(err, errDryRun) {
		return nil, err
	}
	if opt.DryRun {
		return results, nil
	}
	if opt.Publish {
		s.publish(ctx, events)
	}
	return results, nil
}

var errDryRun = errors.New("dry run")

func (s *Service) lookupSeries(ctx context.Context, q *dbq.Queries, quotes []Quote) (map[string]dbq.GetSeriesIDsRow, error) {
	slugs := make([]string, 0, len(quotes))
	seen := make(map[string]bool, len(quotes))
	for _, qt := range quotes {
		if !seen[qt.Series] {
			seen[qt.Series] = true
			slugs = append(slugs, qt.Series)
		}
	}
	rows, err := q.GetSeriesIDs(ctx, slugs)
	if err != nil {
		return nil, fmt.Errorf("lookup series: %w", err)
	}
	out := make(map[string]dbq.GetSeriesIDsRow, len(rows))
	for _, r := range rows {
		out[r.Slug] = r
	}
	return out, nil
}

// ingestOne gates, stores and (when it becomes the latest price) promotes one quote. It fills r.
func (s *Service) ingestOne(ctx context.Context, q *dbq.Queries, o Origin, sr dbq.GetSeriesIDsRow, qt Quote, dryRun bool, r *Result) (*Event, error) {
	cur, err := lockLatest(ctx, q, sr.ID)
	if err != nil {
		return nil, err
	}
	status := StatusPublished
	if cur != nil {
		prev := cur.Price
		if qt.ObservedAt.Before(cur.ObservedAt) {
			// A back-dated quote (history entry) is checked against the price of its own time, not today's.
			around, err := q.PriceAround(ctx, dbq.PriceAroundParams{SeriesID: sr.ID, At: ts(qt.ObservedAt)})
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return nil, fmt.Errorf("price around: %w", err)
			}
			if err == nil {
				prev = around
			}
		}
		r.Previous = &prev
		r.JumpBp = JumpBp(prev, qt.Price)
		if r.JumpBp > int64(sr.MaxJumpBp) {
			switch {
			case o.Manual && !qt.Force:
				r.Outcome = Jump
				r.Message = fmt.Sprintf("move of %s%% exceeds the %s%% threshold", pct(r.JumpBp), pct(int64(sr.MaxJumpBp)))
				return nil, nil
			case !o.Manual:
				status = StatusQuarantined
			}
		}
	}
	if dryRun {
		r.Outcome = OK
		if status == StatusQuarantined {
			r.Outcome = Quarantined
		}
		return nil, nil
	}

	var enteredBy pgtype.UUID
	if o.Actor != nil {
		enteredBy = o.Actor.ID
	}
	row, err := q.InsertPoint(ctx, dbq.InsertPointParams{
		SeriesID:   sr.ID,
		ObservedAt: ts(qt.ObservedAt),
		PriceMinor: qt.Price,
		SourceID:   o.SourceID,
		IsManual:   o.Manual,
		EnteredBy:  enteredBy,
		Status:     status,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		r.Outcome, r.Message = Duplicate, "a point already exists at this time"
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("insert point: %w", err)
	}
	r.PointID = row.ID

	if o.Manual {
		if err := audit.Write(ctx, q, *o.Actor, audit.Entry{
			Action: "price.manual_entry", Entity: "price_point", EntityID: strconv.FormatInt(row.ID, 10),
			Data: map[string]any{"series": qt.Series, "price": qt.Price, "observedAt": qt.ObservedAt, "previous": r.Previous, "jumpBp": r.JumpBp, "force": qt.Force},
		}); err != nil {
			return nil, err
		}
	}
	if status == StatusQuarantined {
		r.Outcome = Quarantined
		return nil, nil
	}
	r.Outcome = Stored
	return promote(ctx, q, sr, cur, row.ID, qt.Price, qt.ObservedAt, o.SourceID)
}

// promote makes a published point the latest price when it's the newest one, and returns its live event.
func promote(ctx context.Context, q *dbq.Queries, sr dbq.GetSeriesIDsRow, cur *Latest, pointID, price int64, at time.Time, sourceID int16) (*Event, error) {
	replace, prevClose := NextLatest(cur, at)
	if !replace {
		return nil, nil
	}
	if err := q.UpsertLatest(ctx, dbq.UpsertLatestParams{
		SeriesID: sr.ID, PointID: pointID, PriceMinor: price, ObservedAt: ts(at), SourceID: sourceID,
		PrevCloseMinor: int8p(prevClose),
	}); err != nil {
		return nil, fmt.Errorf("upsert latest: %w", err)
	}
	return &Event{
		PointID: pointID, SeriesID: sr.ID, Series: sr.Slug, IsBase: sr.IsBase, Currency: sr.Currency, Unit: sr.Unit,
		Price: price, ObservedAt: at.UTC(), PrevClose: prevClose,
	}, nil
}

func lockLatest(ctx context.Context, q *dbq.Queries, seriesID int32) (*Latest, error) {
	l, err := q.LockLatest(ctx, seriesID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("lock latest: %w", err)
	}
	out := &Latest{Price: l.PriceMinor, ObservedAt: l.ObservedAt.Time}
	if l.PrevCloseMinor.Valid {
		v := l.PrevCloseMinor.Int64
		out.PrevClose = &v
	}
	return out, nil
}

// ReviewedPoint is a point after staff review.
type ReviewedPoint struct {
	dbq.LockPointRow
	Status string
}

// Review approves (publishes) or rejects a quarantined point.
func (s *Service) Review(ctx context.Context, id int64, approve bool, actor audit.Actor) (ReviewedPoint, error) {
	var out ReviewedPoint
	var ev *Event
	err := inTx(ctx, s.pool, func(q *dbq.Queries) error {
		p, err := q.LockPoint(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock point: %w", err)
		}
		if p.Status != StatusQuarantined {
			return fmt.Errorf("%w: point is %s", ErrConflict, p.Status)
		}
		status, action := StatusRejected, "price.reject"
		if approve {
			status, action = StatusPublished, "price.approve"
		}
		if err := q.SetPointStatus(ctx, dbq.SetPointStatusParams{ID: id, Status: status, ReviewedBy: actor.ID}); err != nil {
			return fmt.Errorf("set status: %w", err)
		}
		if err := audit.Write(ctx, q, actor, audit.Entry{
			Action: action, Entity: "price_point", EntityID: strconv.FormatInt(id, 10),
			Data: map[string]any{"series": p.SeriesSlug, "price": p.PriceMinor, "observedAt": p.ObservedAt.Time},
		}); err != nil {
			return err
		}
		out = ReviewedPoint{LockPointRow: p, Status: status}
		if !approve {
			return nil
		}
		sr, err := q.GetSeriesByID(ctx, p.SeriesID)
		if err != nil {
			return fmt.Errorf("get series: %w", err)
		}
		cur, err := lockLatest(ctx, q, p.SeriesID)
		if err != nil {
			return err
		}
		ev, err = promote(ctx, q, dbq.GetSeriesIDsRow(sr), cur, p.ID, p.PriceMinor, p.ObservedAt.Time, p.SourceID)
		return err
	})
	if err != nil {
		return ReviewedPoint{}, err
	}
	if ev != nil {
		s.publish(ctx, []Event{*ev})
	}
	return out, nil
}

// Void takes a published point off the site (a wrong entry). The row stays, as rejected, and the void is audited.
// When the point was the latest price, the newest published point left becomes the latest again (or the series has
// no latest price when none is left). SMS alerts the point already triggered are not taken back.
func (s *Service) Void(ctx context.Context, id int64, reason string, actor audit.Actor) (ReviewedPoint, error) {
	var out ReviewedPoint
	var ev *Event
	err := inTx(ctx, s.pool, func(q *dbq.Queries) error {
		p, err := q.LockPoint(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock point: %w", err)
		}
		if p.Status != StatusPublished {
			return fmt.Errorf("%w: point is %s", ErrConflict, p.Status)
		}
		if err := q.SetPointStatus(ctx, dbq.SetPointStatusParams{ID: id, Status: StatusRejected, ReviewedBy: actor.ID}); err != nil {
			return fmt.Errorf("set status: %w", err)
		}
		if err := audit.Write(ctx, q, actor, audit.Entry{
			Action: "price.void", Entity: "price_point", EntityID: strconv.FormatInt(id, 10),
			Data: map[string]any{"series": p.SeriesSlug, "price": p.PriceMinor, "observedAt": p.ObservedAt.Time, "reason": reason},
		}); err != nil {
			return err
		}
		out = ReviewedPoint{LockPointRow: p, Status: StatusRejected}
		cur, err := q.LockLatest(ctx, p.SeriesID)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && cur.PointID != id) {
			return nil // it wasn't the latest price: history only
		}
		if err != nil {
			return fmt.Errorf("lock latest: %w", err)
		}
		next, err := q.LatestPublishedPoint(ctx, p.SeriesID)
		if errors.Is(err, pgx.ErrNoRows) {
			return q.DeleteLatest(ctx, p.SeriesID)
		}
		if err != nil {
			return fmt.Errorf("latest published: %w", err)
		}
		var prevClose *int64
		pc, err := q.LastCloseBefore(ctx, dbq.LastCloseBeforeParams{SeriesID: p.SeriesID, ObservedAt: ts(TehranDayStart(next.ObservedAt.Time))})
		switch {
		case err == nil:
			prevClose = &pc
		case !errors.Is(err, pgx.ErrNoRows):
			return fmt.Errorf("previous close: %w", err)
		}
		if err := q.UpsertLatest(ctx, dbq.UpsertLatestParams{
			SeriesID: p.SeriesID, PointID: next.ID, PriceMinor: next.PriceMinor, ObservedAt: next.ObservedAt,
			SourceID: next.SourceID, PrevCloseMinor: int8p(prevClose),
		}); err != nil {
			return fmt.Errorf("upsert latest: %w", err)
		}
		sr, err := q.GetSeriesByID(ctx, p.SeriesID)
		if err != nil {
			return fmt.Errorf("get series: %w", err)
		}
		ev = &Event{
			PointID: next.ID, SeriesID: sr.ID, Series: sr.Slug, IsBase: sr.IsBase, Currency: sr.Currency, Unit: sr.Unit,
			Price: next.PriceMinor, ObservedAt: next.ObservedAt.Time.UTC(), PrevClose: prevClose,
		}
		return nil
	})
	if err != nil {
		return ReviewedPoint{}, err
	}
	if ev != nil {
		s.publish(ctx, []Event{*ev})
	}
	return out, nil
}

// publish is best effort: the data is committed, and clients re-sync from the REST snapshot on reconnect.
func (s *Service) publish(ctx context.Context, events []Event) {
	if s.pub == nil || len(events) == 0 {
		return
	}
	if err := s.pub.Publish(context.WithoutCancel(ctx), events); err != nil {
		s.log.WarnContext(ctx, "publish price events failed", "events", len(events), "err", err)
	}
}

// inTx runs fn in one transaction. Errors keep their chain (errors.Is works on ErrNotFound etc.).
func inTx(ctx context.Context, pool *pgxpool.Pool, fn func(q *dbq.Queries) error) error {
	if err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error { return fn(dbq.New(tx)) }); err != nil {
		return fmt.Errorf("prices: %w", err)
	}
	return nil
}

func ts(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t.UTC(), Valid: true} }

func int8p(v *int64) pgtype.Int8 {
	if v == nil {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: *v, Valid: true}
}

// pct formats basis points as a percentage with two decimals (1250 → "12.50").
func pct(bp int64) string {
	sign := ""
	if bp < 0 {
		sign, bp = "-", -bp
	}
	return fmt.Sprintf("%s%d.%02d", sign, bp/100, bp%100)
}
