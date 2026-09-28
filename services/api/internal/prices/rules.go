// Package prices owns market price data: ingestion (with the outlier gate), latest prices, history
// and the review of quarantined points (DATA_MODEL §2, SECURITY §6).
//
// rules.go holds the pure rules (no I/O) so they can be table-tested:
// outlier gate, daily change, which point becomes "latest", and chart range windows.
package prices

import (
	"errors"
	"time"
)

// Tehran is the market calendar. Daily change and daily chart buckets use Tehran calendar days.
var Tehran = mustLoad("Asia/Tehran")

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		// Iran has used a fixed +03:30 offset without DST since 2022; fall back if tzdata is missing.
		return time.FixedZone("IRST", 3*3600+1800)
	}
	return loc
}

// JumpBp is the absolute move from prev to next in basis points (1500 = 15 %). prev must be > 0.
func JumpBp(prev, next int64) int64 {
	d := next - prev
	if d < 0 {
		d = -d
	}
	return d * 10_000 / prev
}

// Change is the move against the previous close. Bp is truncated toward zero (125 = +1.25 %).
type Change struct {
	Amount int64
	Bp     int64
}

// ChangeFrom returns the change of price against prevClose, or false when there's no previous close.
func ChangeFrom(prevClose *int64, price int64) (Change, bool) {
	if prevClose == nil || *prevClose <= 0 {
		return Change{}, false
	}
	d := price - *prevClose
	return Change{Amount: d, Bp: d * 10_000 / *prevClose}, true
}

// Latest is the current latest published point of a series.
type Latest struct {
	Price      int64
	ObservedAt time.Time
	PrevClose  *int64
}

// NextLatest decides whether a newly published point at (at, price) replaces cur as the latest price, and
// which previous close the new latest carries.
//
//   - no latest yet → it becomes latest, without a previous close
//   - older than the latest → history only (back-fills never move the latest price)
//   - same Tehran day → replaces the latest, keeps its previous close
//   - later Tehran day → replaces it, and the old latest becomes the previous close
func NextLatest(cur *Latest, at time.Time) (replace bool, prevClose *int64) {
	switch {
	case cur == nil:
		return true, nil
	case at.Before(cur.ObservedAt):
		return false, nil
	case SameTehranDay(cur.ObservedAt, at):
		return true, cur.PrevClose
	default:
		p := cur.Price
		return true, &p
	}
}

// SameTehranDay reports whether a and b fall on the same calendar day in Tehran.
func SameTehranDay(a, b time.Time) bool {
	ay, am, ad := a.In(Tehran).Date()
	by, bm, bd := b.In(Tehran).Date()
	return ay == by && am == bm && ad == bd
}

// Range is a chart range (SCOPE §14).
type Range string

// Chart ranges. Keys match the API enum.
const (
	Range1D  Range = "1D"
	Range1W  Range = "1W"
	Range1M  Range = "1M"
	Range3M  Range = "3M"
	Range6M  Range = "6M"
	Range1Y  Range = "1Y"
	Range3Y  Range = "3Y"
	RangeMax Range = "MAX"
)

var rangeDays = map[Range]int{Range1D: 1, Range1W: 7, Range1M: 30, Range3M: 90, Range6M: 180, Range1Y: 365, Range3Y: 1095}

// ErrUnknownRange is returned for a range that isn't in the enum.
var ErrUnknownRange = errors.New("unknown chart range")

// Days returns the length of r in days; MAX returns 0 (all stored history).
func (r Range) Days() (int, error) {
	if r == RangeMax {
		return 0, nil
	}
	d, ok := rangeDays[r]
	if !ok {
		return 0, ErrUnknownRange
	}
	return d, nil
}

// AllowedBy reports whether r fits a history limit in days (0 = unlimited). MAX needs an unlimited plan.
func (r Range) AllowedBy(limitDays int) bool {
	if limitDays == 0 {
		return true
	}
	d, err := r.Days()
	return err == nil && d > 0 && d <= limitDays
}

// maxPoints is the target number of chart points per request.
const maxPoints = 300

// bucketSteps are the bucket sizes the chart downsamples to, in seconds.
var bucketSteps = []int{60, 300, 900, 1800, 3600, 2 * 3600, 4 * 3600, 6 * 3600, 12 * 3600, 86400, 2 * 86400, 3 * 86400, 7 * 86400}

// Window returns the time span and bucket size for a chart of r ending at now.
// first is the oldest stored point, used for MAX (and to shorten a window that starts before any data).
func Window(r Range, now, first time.Time) (since time.Time, bucketSeconds int, err error) {
	days, err := r.Days()
	if err != nil {
		return time.Time{}, 0, err
	}
	since = first
	if days > 0 {
		since = now.AddDate(0, 0, -days)
	}
	if since.After(now) {
		since = now
	}
	span := int(now.Sub(since).Seconds())
	bucketSeconds = bucketSteps[len(bucketSteps)-1]
	for _, b := range bucketSteps {
		if span/b <= maxPoints {
			bucketSeconds = b
			break
		}
	}
	return since, bucketSeconds, nil
}
