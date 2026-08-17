// Live typing feedback only — the authoritative segment count for cost/logging always comes
// from the backend (POST /api/admin/outreach/estimate), which uses the identical algorithm in
// internal/smsgateway/segments.go. Deliberately duplicated (not shared via codegen); keep both
// in sync with the same threshold table if these ever change.
const GSM7_SINGLE_SEGMENT = 160
const GSM7_MULTI_SEGMENT = 153
const UCS2_SINGLE_SEGMENT = 70
const UCS2_MULTI_SEGMENT = 67

const GSM7_BASIC = new Set(
  ('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
  ).split(''),
)
const GSM7_EXTENDED = new Set(['^', '{', '}', '\\', '[', '~', ']', '|', '€'])

export interface SmsCount {
  length: number
  segments: number
  isUnicode: boolean
  charsPerSegment: number
}

export function countSmsSegments(message: string): SmsCount {
  if (!message) return { length: 0, segments: 0, isUnicode: false, charsPerSegment: GSM7_SINGLE_SEGMENT }

  let gsm7Length = 0
  let isUnicode = false
  for (const ch of message) {
    if (GSM7_BASIC.has(ch)) {
      gsm7Length += 1
      continue
    }
    if (GSM7_EXTENDED.has(ch)) {
      gsm7Length += 2
      continue
    }
    isUnicode = true
    break
  }

  if (isUnicode) {
    const length = [...message].length
    const segments = length <= UCS2_SINGLE_SEGMENT ? 1 : Math.ceil(length / UCS2_MULTI_SEGMENT)
    return { length, segments, isUnicode: true, charsPerSegment: segments > 1 ? UCS2_MULTI_SEGMENT : UCS2_SINGLE_SEGMENT }
  }

  const segments = gsm7Length <= GSM7_SINGLE_SEGMENT ? 1 : Math.ceil(gsm7Length / GSM7_MULTI_SEGMENT)
  return { length: gsm7Length, segments, isUnicode: false, charsPerSegment: segments > 1 ? GSM7_MULTI_SEGMENT : GSM7_SINGLE_SEGMENT }
}
