// Package alerts sends SMS price alerts to Gold users (client answer #19, SCOPE §17).
//
// rules.go holds the pure decision (no I/O, table-tested): given an alert, the latest price and the time, should
// an SMS go out, and is the alert armed afterwards. service.go loads alerts, checks plans and caps, and sends.
package alerts

import (
	"errors"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

// Kind of alert.
type Kind string

// Alert kinds.
const (
	Above Kind = "above" // the price reaches or passes a threshold upward
	Below Kind = "below" // the price reaches or passes a threshold downward
	Move  Kind = "move"  // the daily change (vs the previous close) reaches ±MoveBp
)

// Tuning (🛠 SCOPE §17).
const (
	// RearmBandBp is the hysteresis: an above/below alert re-arms only once the price is back 0.5 % on the other
	// side of its threshold, so a price wobbling around the threshold doesn't send a stream of SMS.
	RearmBandBp = 50
	// MinInterval is the least time between two SMS of the same alert.
	MinInterval = time.Hour
	// MinMoveBp is the smallest daily move an alert can watch (0.5 %). The DB enforces the same bounds.
	MinMoveBp = 50
	// MaxMoveBp is the largest (50 %).
	MaxMoveBp = 5000
	// MaxPerUser is how many alerts one user may have.
	MaxPerUser = 20
	// DailyCapPerUser is how many alert SMS one user receives per Tehran day at most.
	DailyCapPerUser = 10
)

// Alert is the state the decision needs.
type Alert struct {
	Kind          Kind
	Threshold     int64 // above / below, minor units of the series
	MoveBp        int64 // move
	Armed         bool
	LastTriggered *time.Time
}

// Quote is the series' latest price.
type Quote struct {
	Price     int64
	PrevClose *int64
}

// Decision is what to do.
type Decision struct {
	Fire  bool
	Armed bool // the armed state to store
}

// Evaluate decides whether a fires now.
func Evaluate(a Alert, q Quote, now time.Time) Decision {
	d := Decision{Armed: a.Armed}
	recent := a.LastTriggered != nil && now.Sub(*a.LastTriggered) < MinInterval
	switch a.Kind {
	case Above, Below:
		hit := q.Price >= a.Threshold
		back := q.Price*10_000 < a.Threshold*(10_000-RearmBandBp)
		if a.Kind == Below {
			hit = q.Price <= a.Threshold
			back = q.Price*10_000 > a.Threshold*(10_000+RearmBandBp)
		}
		switch {
		case hit && a.Armed && !recent:
			d.Fire, d.Armed = true, false
		case back && !a.Armed:
			d.Armed = true
		}
	case Move:
		c, ok := prices.ChangeFrom(q.PrevClose, q.Price)
		if !ok || abs(c.Bp) < a.MoveBp || recent {
			return d
		}
		if a.LastTriggered != nil && prices.SameTehranDay(*a.LastTriggered, now) {
			return d // once per day
		}
		d.Fire = true
	}
	return d
}

// Errors from Validate.
var (
	ErrKind      = errors.New("unknown alert kind")
	ErrThreshold = errors.New("threshold must be a positive price")
	ErrMove      = errors.New("move must be 0.5 %–50 %")
)

// Validate checks a new alert's settings.
func Validate(kind Kind, threshold, moveBp int64) error {
	switch kind {
	case Above, Below:
		if threshold <= 0 || threshold > 1_000_000_000_000 {
			return ErrThreshold
		}
	case Move:
		if moveBp < MinMoveBp || moveBp > MaxMoveBp {
			return ErrMove
		}
	default:
		return ErrKind
	}
	return nil
}

func abs(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}
