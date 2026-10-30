// Package community holds the rules for members' analyses («تحلیل کاربران», client 2026-10-30): what a post may say,
// how many a day, and how its chart image is stored. Who may read and post is in internal/access (community.*).
package community

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	_ "image/gif" // decode GIF uploads
	"image/jpeg"
	_ "image/png" // and PNG (most chart screenshots)
	"strings"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // and WebP

	"github.com/alanfelez/alanfelez/services/api/internal/content"
)

const (
	// PerDay is how many analyses one member may post in 24 hours.
	PerDay = 3
	// MaxImageBytes is the largest upload accepted (the stored copy is re-encoded and much smaller).
	MaxImageBytes = 5 << 20
	// MaxImageWidth is the stored image's largest width; wider charts are scaled down.
	MaxImageWidth = 1600
	// maxPixels refuses images whose decoded size would use too much memory (a 5 MB PNG can claim 50,000 × 50,000).
	maxPixels   = 40_000_000
	jpegQuality = 82
)

// Errors a member sees (as the 400 detail) when a post or image is refused.
var (
	ErrImageSize        = errors.New("the image is larger than 5 MB")
	ErrImageFormat      = errors.New("the file is not a JPEG, PNG, WebP or GIF image")
	ErrImagePixels      = errors.New("the image is too large in pixels")
	ErrForbiddenPromise = errors.New("analyses may not promise profit or a certain price")
)

// forbidden are claims the site never makes (CLAUDE.md copy rule), so members' posts can't either. Lowercased,
// with Persian letter variants normalized by norm.
var forbidden = []string{
	"سود تضمینی", "تضمین سود", "سود قطعی", "قیمت قطعی", "پیش بینی قطعی", "تضمینی", "بدون ریسک", "صد در صد سود",
	"guaranteed profit", "guaranteed return", "risk-free", "risk free", "100% profit",
}

func norm(s string) string {
	r := strings.NewReplacer("ي", "ی", "ك", "ک", "\u200c", " ", "٪", "%")
	return strings.Join(strings.Fields(strings.ToLower(r.Replace(s))), " ")
}

// Text cleans a title or body to plain text: no HTML, spaces collapsed, but line breaks kept (at most one blank line).
func Text(s string) string {
	lines := strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
	out := make([]string, 0, len(lines))
	for _, l := range lines {
		l = content.PlainText(l)
		if l == "" && (len(out) == 0 || out[len(out)-1] == "") {
			continue
		}
		out = append(out, l)
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

// CheckClaims refuses a post that promises profit or a certain price.
func CheckClaims(texts ...string) error {
	for _, t := range texts {
		n := norm(t)
		for _, f := range forbidden {
			if strings.Contains(n, norm(f)) {
				return ErrForbiddenPromise
			}
		}
	}
	return nil
}

// Image is a stored chart image.
type Image struct {
	JPEG          []byte
	Width, Height int
}

// ReencodeImage decodes an uploaded image and stores it as a JPEG at most MaxImageWidth wide. Re-encoding drops
// anything that isn't pixels (metadata, location, scripts in odd formats) and keeps the database small.
func ReencodeImage(b []byte) (Image, error) {
	if len(b) > MaxImageBytes {
		return Image{}, ErrImageSize
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil {
		return Image{}, ErrImageFormat
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > maxPixels {
		return Image{}, ErrImagePixels
	}
	src, _, err := image.Decode(bytes.NewReader(b))
	if err != nil {
		return Image{}, ErrImageFormat
	}
	w, h := cfg.Width, cfg.Height
	if w > MaxImageWidth {
		h = h * MaxImageWidth / w
		w = MaxImageWidth
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(dst, dst.Bounds(), image.White, image.Point{}, draw.Src) // transparent PNGs get a white background
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Over, nil)
	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: jpegQuality}); err != nil {
		return Image{}, fmt.Errorf("encode jpeg: %w", err)
	}
	return Image{JPEG: out.Bytes(), Width: w, Height: h}, nil
}

// AuthorName is the name shown under a post: the sign-up name (full name or company), else a neutral label.
func AuthorName(given, family string) string {
	if n := strings.TrimSpace(strings.Join(strings.Fields(given+" "+family), " ")); n != "" {
		return n
	}
	return "کاربر الان\u200cفلز"
}
