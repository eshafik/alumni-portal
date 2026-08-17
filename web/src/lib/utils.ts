import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const DEFAULT_TIMEZONE = 'Asia/Dhaka'

let displayTimezone = DEFAULT_TIMEZONE

// Set once at app boot from GET /api/institution's `timezone` field so every formatter below
// uses it without threading the value through every call site.
export function setDisplayTimezone(tz: string) {
  displayTimezone = tz || DEFAULT_TIMEZONE
}

// Backend timestamps from SQLite's datetime('now') default come as "YYYY-MM-DD HH:MM:SS" —
// true UTC, but no timezone marker, and JS engines parse that non-ISO space-separated form
// inconsistently (commonly as local time). Normalize to a real UTC instant first.
export function parseServerDate(raw: string): Date {
  if (!raw) return new Date(NaN)
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T')
  return new Date(iso.endsWith('Z') ? iso : iso + 'Z')
}

export function formatDateTime(
  raw: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short', hour12: true },
): string {
  return parseServerDate(raw).toLocaleString(undefined, { ...opts, timeZone: displayTimezone })
}

export function formatDate(raw: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return parseServerDate(raw).toLocaleDateString(undefined, { ...opts, timeZone: displayTimezone })
}

// User-entered URLs (website, LinkedIn, apply links, ...) are often saved without a scheme
// ("linkedin.com/in/x"). A bare `<a href="linkedin.com/in/x">` resolves as relative to the
// current page — clicking it appends the value to this app's own URL instead of navigating out.
// Always route through this before using a stored URL as an href.
export function normalizeExternalUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

// Builds a wa.me deep link from a stored phone number, stripping everything but digits
// (wa.me requires the number with country code and no punctuation/plus sign).
export function waLink(number: string): string {
  const digits = number.replace(/\D/g, '')
  return `https://wa.me/${digits}`
}

// Currency is admin-configured (EMAIL_COST_CURRENCY/SMS_COST_CURRENCY env vars, e.g. "BDT"),
// so this always renders the currency *code* rather than a locale-guessed symbol — a symbol
// can be missing/ambiguous for less common currencies, a code is always unambiguous.
export function formatCurrency(amount: number, currency: string): string {
  if (!currency) return amount.toFixed(2)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'code' }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}
