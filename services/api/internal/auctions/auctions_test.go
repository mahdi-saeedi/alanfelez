package auctions

import (
	"errors"
	"strings"
	"testing"
)

func s(v string) *string { return &v }

func TestValidate(t *testing.T) {
	ok := Input{TitleFa: " مزایده فروش ضایعات مس ", Category: "scrap", Unit: "ton", Status: "open", Quantity: 50,
		Texts: map[string]*string{"locationFa": s("  تهران "), "detailsFa": s("   "), "organizerFa": nil}}
	got, err := Validate(ok)
	if err != nil {
		t.Fatal(err)
	}
	if got.TitleFa != "مزایده فروش ضایعات مس" || *got.Texts["locationFa"] != "تهران" || got.Texts["detailsFa"] != nil {
		t.Fatalf("not trimmed: %+v", got)
	}
	bad := func(mut func(*Input)) Input { in := ok; in.Texts = map[string]*string{}; mut(&in); return in }
	cases := []struct {
		name string
		in   Input
		want error
	}{
		{"short title", bad(func(i *Input) { i.TitleFa = "م" }), ErrTitle},
		{"long title", bad(func(i *Input) { i.TitleFa = strings.Repeat("م", 201) }), ErrTitle},
		{"category", bad(func(i *Input) { i.Category = "global" }), ErrCategory},
		{"unit", bad(func(i *Input) { i.Unit = "litre" }), ErrUnit},
		{"status", bad(func(i *Input) { i.Status = "draft" }), ErrStatus},
		{"zero quantity", bad(func(i *Input) { i.Quantity = 0 }), ErrQuantity},
		{"huge quantity", bad(func(i *Input) { i.Quantity = MaxQuantity + 1 }), ErrQuantity},
		{"long place", bad(func(i *Input) { i.Texts["locationFa"] = s(strings.Repeat("x", 201)) }), ErrTooLong},
		{"long details", bad(func(i *Input) { i.Texts["detailsFa"] = s(strings.Repeat("x", 5001)) }), ErrTooLong},
		{"long english title", bad(func(i *Input) { i.TitleEn = s(strings.Repeat("x", 201)) }), ErrTooLong},
	}
	for _, c := range cases {
		if _, err := Validate(c.in); !errors.Is(err, c.want) {
			t.Errorf("%s: got %v, want %v", c.name, err, c.want)
		}
	}
	if _, err := Validate(bad(func(i *Input) { i.Texts["detailsFa"] = s(strings.Repeat("x", 5000)) })); err != nil {
		t.Errorf("5000-character details must pass: %v", err)
	}
}

func TestCheckPDF(t *testing.T) {
	if err := CheckPDF([]byte("%PDF-1.7\n...")); err != nil {
		t.Fatal(err)
	}
	if err := CheckPDF([]byte("<html>")); !errors.Is(err, ErrNotPDF) {
		t.Fatalf("html: %v", err)
	}
	if err := CheckPDF(append([]byte("%PDF-"), make([]byte, MaxPDFBytes)...)); !errors.Is(err, ErrPDFSize) {
		t.Fatalf("too big: %v", err)
	}
}

func TestFileName(t *testing.T) {
	for in, want := range map[string]string{
		"آگهی مزایده.pdf":        "آگهی مزایده.pdf",
		`C:\docs\notice.PDF`:     "notice.PDF",
		"../../etc/passwd":       "passwd.pdf",
		"a\"b;c\r\n.pdf":         "abc.pdf",
		"":                       "auction.pdf",
		strings.Repeat("ب", 200): strings.Repeat("ب", 120) + ".pdf",
	} {
		if got := FileName(in); got != want {
			t.Errorf("FileName(%q) = %q, want %q", in, got, want)
		}
	}
}
