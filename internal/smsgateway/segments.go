package smsgateway

// SMS segment thresholds (GSM 03.38 vs UCS-2). Duplicated deliberately (not shared via codegen)
// in web/src/lib/smsSegments.ts for live client-side typing feedback — keep both in sync if
// these ever change; the authoritative count for cost/logging always comes from this file via
// the /api/admin/outreach/estimate and campaign-creation endpoints, the client-side copy is
// only for immediate feedback while typing.
const (
	gsm7SingleSegment = 160
	gsm7MultiSegment  = 153 // reduced by the 7-char (6-septet) concatenation UDH header
	ucs2SingleSegment = 70
	ucs2MultiSegment  = 67
)

// gsm7Basic is the GSM 03.38 default character set (single septet each).
var gsm7Basic = map[rune]bool{}

// gsm7Extended requires an ESC escape sequence — counts as 2 characters for segmentation.
var gsm7Extended = map[rune]bool{
	'^': true, '{': true, '}': true, '\\': true, '[': true, '~': true, ']': true, '|': true, '€': true,
}

func init() {
	basic := "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
		"ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
	for _, r := range basic {
		gsm7Basic[r] = true
	}
}

// CountSegments reports how many SMS segments `message` will occupy, and whether it required
// Unicode (UCS-2) encoding — a single character outside the GSM-7 charset (e.g. Bengali script)
// forces the whole message into the much smaller 70/67-char UCS-2 segments, not just that
// character.
func CountSegments(message string) (segments int, isUnicode bool) {
	if message == "" {
		return 0, false
	}

	length := 0
	for _, r := range message {
		if gsm7Basic[r] {
			length++
			continue
		}
		if gsm7Extended[r] {
			length += 2
			continue
		}
		isUnicode = true
		break
	}

	if isUnicode {
		length = 0
		for range message {
			length++
		}
		if length <= ucs2SingleSegment {
			return 1, true
		}
		return ceilDiv(length, ucs2MultiSegment), true
	}

	if length <= gsm7SingleSegment {
		return 1, false
	}
	return ceilDiv(length, gsm7MultiSegment), false
}

func ceilDiv(a, b int) int {
	if a <= 0 {
		return 0
	}
	return (a + b - 1) / b
}
