package content

import "testing"

func TestAparatVideo(t *testing.T) {
	for in, want := range map[string]string{
		"https://www.aparat.com/v/abc123":                                    "https://www.aparat.com/v/abc123",
		"aparat.com/v/abc123/":                                               "https://www.aparat.com/v/abc123",
		"http://aparat.com/v/abc123?playlist=1":                              "https://www.aparat.com/v/abc123",
		"https://www.aparat.com/video/video/embed/videohash/abc123/vt/frame": "https://www.aparat.com/v/abc123",
		"https://www.youtube.com/watch?v=abc123":                             "",
		"https://aparat.com.evil.example/v/abc123":                           "",
		"javascript:alert(1)":                                                "",
		"https://www.aparat.com/v/abc<script>":                               "",
	} {
		got, ok := AparatVideo(in)
		if got != want || ok != (want != "") {
			t.Errorf("%q → %q %v, want %q", in, got, ok, want)
		}
	}
}
