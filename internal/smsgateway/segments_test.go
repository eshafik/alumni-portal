package smsgateway

import "testing"

func TestCountSegments(t *testing.T) {
	cases := []struct {
		name        string
		message     string
		wantSeg     int
		wantUnicode bool
	}{
		{"empty", "", 0, false},
		{"short ascii", "Hello alumni!", 1, false},
		{"exactly 160 gsm7", repeat("a", 160), 1, false},
		{"161 gsm7 -> 2 segments of 153", repeat("a", 161), 2, false},
		{"306 gsm7 -> 2 segments", repeat("a", 306), 2, false},
		{"307 gsm7 -> 3 segments", repeat("a", 307), 3, false},
		{"bengali forces unicode", "প্রিয় শিক্ষার্থী", 1, true},
		{"exactly 70 unicode", repeat("অ", 70), 1, true},
		{"71 unicode -> 2 segments of 67", repeat("অ", 71), 2, true},
		{"extended char counts double", repeat("a", 159) + "€", 2, false}, // 159 + 2 = 161 > 160
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			seg, isUnicode := CountSegments(c.message)
			if seg != c.wantSeg || isUnicode != c.wantUnicode {
				t.Errorf("CountSegments(%q) = (%d, %v), want (%d, %v)", c.name, seg, isUnicode, c.wantSeg, c.wantUnicode)
			}
		})
	}
}

func repeat(s string, n int) string {
	out := ""
	for range n {
		out += s
	}
	return out
}
