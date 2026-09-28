package support

import "testing"

func TestStatusAfterMessage(t *testing.T) {
	if StatusAfterMessage(true) != Answered || StatusAfterMessage(false) != Open {
		t.Fatal("a message must hand the turn to the other side")
	}
	for s, want := range map[string]bool{Open: true, Answered: true, Closed: true, "pending": false, "": false} {
		if ValidStatus(s) != want {
			t.Errorf("ValidStatus(%q) != %v", s, want)
		}
	}
}
