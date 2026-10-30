package community

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func TestText(t *testing.T) {
	got := Text("  سلام <b>دنیا</b>  \r\n\r\n\r\n  خط   دوم\n\n")
	if got != "سلام دنیا\n\nخط دوم" {
		t.Fatalf("Text = %q", got)
	}
}

func TestCheckClaims(t *testing.T) {
	for _, s := range []string{"این سهم سود تضمینی دارد", "قيمت قطعي هفته\u200cی بعد", "Guaranteed  Profit here", "۱۰۰٪ سود: صد در صد سود"} {
		if CheckClaims("عنوان", s) == nil {
			t.Fatalf("not refused: %q", s)
		}
	}
	if err := CheckClaims("تحلیل مس", "حمایت ۹۶۰۰ دلار؛ اگر بشکند، سناریوی نزولی محتمل\u200cتر است."); err != nil {
		t.Fatalf("refused a normal analysis: %v", err)
	}
}

func TestReencodeImage(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 3200, 1000))
	for x := range 3200 {
		src.Set(x, 500, color.NRGBA{R: 200, A: 255})
	}
	var b bytes.Buffer
	if err := png.Encode(&b, src); err != nil {
		t.Fatal(err)
	}
	img, err := ReencodeImage(b.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if img.Width != MaxImageWidth || img.Height != 500 {
		t.Fatalf("size %d×%d, want %d×500", img.Width, img.Height, MaxImageWidth)
	}
	if _, err := jpeg.Decode(bytes.NewReader(img.JPEG)); err != nil {
		t.Fatalf("not a JPEG: %v", err)
	}
	if _, err := ReencodeImage([]byte("<html>not an image</html>")); !errors.Is(err, ErrImageFormat) {
		t.Fatalf("html: %v", err)
	}
	if _, err := ReencodeImage(make([]byte, MaxImageBytes+1)); !errors.Is(err, ErrImageSize) {
		t.Fatalf("too big: %v", err)
	}
}

func TestAuthorName(t *testing.T) {
	if n := AuthorName(" شرکت  فلز ", ""); n != "شرکت فلز" {
		t.Fatalf("company: %q", n)
	}
	if n := AuthorName("", ""); n == "" {
		t.Fatal("empty name")
	}
}
