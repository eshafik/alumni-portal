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
