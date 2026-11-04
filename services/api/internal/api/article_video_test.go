package api

import (
	"testing"

	"github.com/google/uuid"
)

func TestVideoKeyOf(t *testing.T) {
	id := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	for key, want := range map[string]bool{
		"articles/11111111-2222-3333-4444-555555555555/ab12.mp4": true,
		"articles/11111111-2222-3333-4444-555555555555/":         false,
		"articles/99999999-2222-3333-4444-555555555555/ab12.mp4": false, // another article's file
		"articles/11111111-2222-3333-4444-555555555555/../x.mp4": false,
		"other/11111111-2222-3333-4444-555555555555/ab12.mp4":    false,
	} {
		if got := videoKeyOf(id, key); got != want {
			t.Errorf("%q: %v, want %v", key, got, want)
		}
	}
}
