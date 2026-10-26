// Package auctions holds the rules for metal auction notices («مزایدات», client 2026-10-26): what a staff entry
// must look like and which uploaded files count as a PDF notice. Information only: there's no bidding on the site.
package auctions

import (
	"bytes"
	"errors"
	"path"
	"strings"
	"unicode/utf8"
)

// The allowed values (the database CHECKs say the same).
var (
	Categories = []string{"intermediate", "scrap", "raw"} // ingots and intermediate products, scrap, raw materials
	Units      = []string{"ton", "kg", "piece"}
	Statuses   = []string{"open", "paused", "closed"} // in progress, stopped, finished (set by staff)
)

// Limits.
const (
	MaxQuantity = 1_000_000_000
	MaxTitle    = 200
	MaxShort    = 200  // place, organiser
	MaxDetails  = 5000 // details (plain text)
	MaxPDFBytes = 10 << 20
)

// Validation errors.
var (
	ErrTitle    = errors.New("title must be 2–200 characters")
	ErrCategory = errors.New("unknown category")
	ErrUnit     = errors.New("unknown unit")
	ErrStatus   = errors.New("unknown status")
	ErrQuantity = errors.New("quantity must be 1–1,000,000,000")
	ErrTooLong  = errors.New("a text is too long")
	ErrNotPDF   = errors.New("the file is not a PDF")
	ErrPDFSize  = errors.New("the PDF must be at most 10 MB")
)

// Input is a staff entry before it's saved. Optional texts are nil when not given.
type Input struct {
	TitleFa                string
	TitleEn                *string
	Category, Unit, Status string
	Quantity               int64
	Texts                  map[string]*string // locationFa, locationEn, organizerFa, organizerEn, detailsFa, detailsEn
}

// Validate checks an entry and returns it with every text trimmed (empty optional texts become nil).
func Validate(in Input) (Input, error) {
	in.TitleFa = strings.TrimSpace(in.TitleFa)
	if n := utf8.RuneCountInString(in.TitleFa); n < 2 || n > MaxTitle {
		return in, ErrTitle
	}
	switch {
	case !oneOf(in.Category, Categories):
		return in, ErrCategory
	case !oneOf(in.Unit, Units):
		return in, ErrUnit
	case !oneOf(in.Status, Statuses):
		return in, ErrStatus
	case in.Quantity <= 0 || in.Quantity > MaxQuantity:
		return in, ErrQuantity
	}
	var err error
	if in.TitleEn, err = optional(in.TitleEn, MaxTitle); err != nil {
		return in, err
	}
	texts := make(map[string]*string, len(in.Texts))
	for k, v := range in.Texts {
		limit := MaxShort
		if strings.HasPrefix(k, "details") {
			limit = MaxDetails
		}
		if texts[k], err = optional(v, limit); err != nil {
			return in, err
		}
	}
	in.Texts = texts
	return in, nil
}

// CheckPDF accepts a PDF notice of at most MaxPDFBytes: the file must start with the PDF signature, whatever its name.
func CheckPDF(b []byte) error {
	switch {
	case len(b) > MaxPDFBytes:
		return ErrPDFSize
	case !bytes.HasPrefix(b, []byte("%PDF-")):
		return ErrNotPDF
	}
	return nil
}

// FileName is a safe download name: the base name without control characters or quotes, ending in .pdf.
func FileName(name string) string {
	name = path.Base(strings.ReplaceAll(strings.TrimSpace(name), `\`, "/"))
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f || r == '"' || r == ';' {
			return -1
		}
		return r
	}, name)
	if r := []rune(name); len(r) > 120 {
		name = string(r[:120])
	}
	if name == "" || name == "." || name == "/" {
		name = "auction"
	}
	if !strings.HasSuffix(strings.ToLower(name), ".pdf") {
		name += ".pdf"
	}
	return name
}

func optional(s *string, limit int) (*string, error) {
	if s == nil {
		return nil, nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil, nil
	}
	if utf8.RuneCountInString(v) > limit {
		return nil, ErrTooLong
	}
	return &v, nil
}

func oneOf(v string, all []string) bool {
	for _, a := range all {
		if v == a {
			return true
		}
	}
	return false
}
