export interface CountryCode {
  code: string // ISO 3166-1 alpha-2
  dial: string // e.g. "+880"
  flag: string
  name: string
}

// Bangladesh listed first — it's the default selection everywhere this is used.
export const COUNTRY_CODES: CountryCode[] = [
  { code: 'BD', dial: '+880', flag: '🇧🇩', name: 'Bangladesh' },
  { code: 'IN', dial: '+91', flag: '🇮🇳', name: 'India' },
  { code: 'PK', dial: '+92', flag: '🇵🇰', name: 'Pakistan' },
  { code: 'US', dial: '+1', flag: '🇺🇸', name: 'United States' },
  { code: 'CA', dial: '+1', flag: '🇨🇦', name: 'Canada' },
  { code: 'GB', dial: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'AU', dial: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: 'AE', dial: '+971', flag: '🇦🇪', name: 'United Arab Emirates' },
  { code: 'SA', dial: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: 'QA', dial: '+974', flag: '🇶🇦', name: 'Qatar' },
  { code: 'KW', dial: '+965', flag: '🇰🇼', name: 'Kuwait' },
  { code: 'OM', dial: '+968', flag: '🇴🇲', name: 'Oman' },
  { code: 'BH', dial: '+973', flag: '🇧🇭', name: 'Bahrain' },
  { code: 'MY', dial: '+60', flag: '🇲🇾', name: 'Malaysia' },
  { code: 'SG', dial: '+65', flag: '🇸🇬', name: 'Singapore' },
  { code: 'JP', dial: '+81', flag: '🇯🇵', name: 'Japan' },
  { code: 'KR', dial: '+82', flag: '🇰🇷', name: 'South Korea' },
  { code: 'CN', dial: '+86', flag: '🇨🇳', name: 'China' },
  { code: 'HK', dial: '+852', flag: '🇭🇰', name: 'Hong Kong' },
  { code: 'TH', dial: '+66', flag: '🇹🇭', name: 'Thailand' },
  { code: 'ID', dial: '+62', flag: '🇮🇩', name: 'Indonesia' },
  { code: 'PH', dial: '+63', flag: '🇵🇭', name: 'Philippines' },
  { code: 'VN', dial: '+84', flag: '🇻🇳', name: 'Vietnam' },
  { code: 'NP', dial: '+977', flag: '🇳🇵', name: 'Nepal' },
  { code: 'LK', dial: '+94', flag: '🇱🇰', name: 'Sri Lanka' },
  { code: 'DE', dial: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: 'FR', dial: '+33', flag: '🇫🇷', name: 'France' },
  { code: 'IT', dial: '+39', flag: '🇮🇹', name: 'Italy' },
  { code: 'ES', dial: '+34', flag: '🇪🇸', name: 'Spain' },
  { code: 'NL', dial: '+31', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'SE', dial: '+46', flag: '🇸🇪', name: 'Sweden' },
  { code: 'NO', dial: '+47', flag: '🇳🇴', name: 'Norway' },
  { code: 'CH', dial: '+41', flag: '🇨🇭', name: 'Switzerland' },
  { code: 'IE', dial: '+353', flag: '🇮🇪', name: 'Ireland' },
  { code: 'RU', dial: '+7', flag: '🇷🇺', name: 'Russia' },
  { code: 'TR', dial: '+90', flag: '🇹🇷', name: 'Turkey' },
  { code: 'ZA', dial: '+27', flag: '🇿🇦', name: 'South Africa' },
  { code: 'NG', dial: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { code: 'EG', dial: '+20', flag: '🇪🇬', name: 'Egypt' },
  { code: 'BR', dial: '+55', flag: '🇧🇷', name: 'Brazil' },
  { code: 'MX', dial: '+52', flag: '🇲🇽', name: 'Mexico' },
  { code: 'NZ', dial: '+64', flag: '🇳🇿', name: 'New Zealand' },
]

export const DEFAULT_COUNTRY_CODE = COUNTRY_CODES[0] // Bangladesh

/** Splits a stored phone value like "+8801711223344" into { dial, national }. Falls back to
 *  the default country (BD) if the value has no recognized dial code prefix (e.g. it was
 *  stored before this feature existed, as a bare national number). */
export function splitPhone(value: string): { dial: string; national: string } {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return { dial: DEFAULT_COUNTRY_CODE.dial, national: '' }
  // Match longest dial code first (e.g. "+1" is a prefix of nothing else here, but be safe).
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length)
  for (const c of sorted) {
    if (trimmed.startsWith(c.dial)) {
      return { dial: c.dial, national: trimmed.slice(c.dial.length).trim() }
    }
  }
  return { dial: DEFAULT_COUNTRY_CODE.dial, national: trimmed.replace(/^\+/, '') }
}

// Combines a dial code with a locally-typed national number into the stored E.164-style
// value. Strips a single leading trunk "0" (e.g. Bangladesh "01711223344" -> "1711223344")
// since that's how the number would actually be dialed once the country code is prefixed —
// dialing "+8800..." is invalid. This is the standard convention across the vast majority of
// countries that use a trunk prefix, so it's applied unconditionally rather than per-country.
export function joinPhone(dial: string, national: string): string {
  const digits = national.replace(/[^\d]/g, '').replace(/^0/, '')
  return digits ? `${dial}${digits}` : ''
}
