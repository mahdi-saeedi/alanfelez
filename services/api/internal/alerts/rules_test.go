package alerts

import (
	"errors"
	"testing"
	"time"
)

func TestEvaluate(t *testing.T) {
	now := time.Date(2026, 9, 28, 9, 0, 0, 0, time.UTC) // 12:30 Tehran
	ago := func(d time.Duration) *time.Time { v := now.Add(-d); return &v }
	prev := func(v int64) *int64 { return &v }
	cases := []struct {
		name      string
		a         Alert
		q         Quote
		fire, arm bool
	}{
		{"above: reaching the threshold fires", Alert{Kind: Above, Threshold: 1000, Armed: true}, Quote{Price: 1000}, true, false},
		{"above: still below does nothing", Alert{Kind: Above, Threshold: 1000, Armed: true}, Quote{Price: 999}, false, true},
		{"above: fired, still above: no repeat", Alert{Kind: Above, Threshold: 1000, Armed: false, LastTriggered: ago(3 * time.Hour)}, Quote{Price: 1200}, false, false},
		{"above: just under the threshold doesn't re-arm (hysteresis)", Alert{Kind: Above, Threshold: 10000, Armed: false}, Quote{Price: 9960}, false, false},
		{"above: 0.5 % under re-arms", Alert{Kind: Above, Threshold: 10000, Armed: false}, Quote{Price: 9949}, false, true},
		{"above: armed but fired minutes ago waits", Alert{Kind: Above, Threshold: 1000, Armed: true, LastTriggered: ago(10 * time.Minute)}, Quote{Price: 1100}, false, true},
		{"below: reaching the threshold fires", Alert{Kind: Below, Threshold: 1000, Armed: true}, Quote{Price: 950}, true, false},
		{"below: above it does nothing", Alert{Kind: Below, Threshold: 1000, Armed: true}, Quote{Price: 1001}, false, true},
		{"below: 0.5 % over re-arms", Alert{Kind: Below, Threshold: 10000, Armed: false}, Quote{Price: 10051}, false, true},
		{"move: +3 % against a 2 % alert fires", Alert{Kind: Move, MoveBp: 200}, Quote{Price: 1030, PrevClose: prev(1000)}, true, false},
		{"move: −3 % fires too", Alert{Kind: Move, MoveBp: 200}, Quote{Price: 970, PrevClose: prev(1000)}, true, false},
		{"move: +1 % is not enough", Alert{Kind: Move, MoveBp: 200}, Quote{Price: 1010, PrevClose: prev(1000)}, false, false},
		{"move: once per Tehran day", Alert{Kind: Move, MoveBp: 200, LastTriggered: ago(2 * time.Hour)}, Quote{Price: 1100, PrevClose: prev(1000)}, false, false},
		{"move: again the next day", Alert{Kind: Move, MoveBp: 200, LastTriggered: ago(20 * time.Hour)}, Quote{Price: 1100, PrevClose: prev(1000)}, true, false},
		{"move: no previous close, no alert", Alert{Kind: Move, MoveBp: 200}, Quote{Price: 1100}, false, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := Evaluate(c.a, c.q, now)
			if d.Fire != c.fire || d.Armed != c.arm {
				t.Fatalf("got fire=%v armed=%v, want %v %v", d.Fire, d.Armed, c.fire, c.arm)
			}
		})
	}
}

func TestValidate(t *testing.T) {
	for _, c := range []struct {
		kind      Kind
		thr, move int64
		wantErr   error
	}{
		{Above, 1, 0, nil}, {Below, 5_000_000, 0, nil}, {Move, 0, 50, nil}, {Move, 0, 5000, nil},
		{Above, 0, 0, ErrThreshold}, {Move, 0, 49, ErrMove}, {Move, 0, 5001, ErrMove}, {"cross", 1, 0, ErrKind},
	} {
		if err := Validate(c.kind, c.thr, c.move); !errors.Is(err, c.wantErr) {
			t.Errorf("Validate(%s, %d, %d) = %v, want %v", c.kind, c.thr, c.move, err, c.wantErr)
		}
	}
}

func TestFormat(t *testing.T) {
	for _, c := range []struct{ got, want string }{
		{FormatPrice(1_850_000, "IRR", "kg", "fa"), "۱۸۵٬۰۰۰ تومان/کیلوگرم"},
		{FormatPrice(1_850_000, "IRR", "kg", "en"), "185,000 Toman/kg"},
		{FormatPrice(953_000, "USD", "ton", "en"), "$9,530/ton"},
		{FormatPrice(953_000, "USD", "ton", "fa"), "۹٬۵۳۰ دلار/تن"},
		{FormatBp(325, "en"), "+3.25%"},
		{FormatBp(-5, "en"), "−0.05%"},
		{FormatBp(325, "fa"), "+۳٫۲۵٪"},
	} {
		if c.got != c.want {
			t.Errorf("got %q, want %q", c.got, c.want)
		}
	}
}
