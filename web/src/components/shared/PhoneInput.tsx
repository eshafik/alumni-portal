import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { COUNTRY_CODES, splitPhone, joinPhone, type CountryCode } from '../../lib/countryCodes'
import { Input } from './ui'

interface PhoneInputProps {
  value: string // full stored value, e.g. "+8801711223344"
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
}

// Country-code combobox (searchable by name/ISO code/dial code, defaults to Bangladesh) +
// national number field. The two are combined into one stored "+<dial><digits>" value, with
// a leading trunk "0" stripped automatically (e.g. "01711223344" -> "+8801711223344").
//
// Display state is kept local rather than re-derived from `value` on every keystroke — if it
// were re-derived, the leading "0" a user is mid-typing would vanish the instant it's stripped
// for the outbound value, corrupting what they see. Local state only resyncs when `value`
// changes for a reason other than our own onChange (e.g. the async profile-load prefill).
export function PhoneInput({ value, onChange, required, placeholder = 'Phone number' }: PhoneInputProps) {
  const [local, setLocal] = useState(() => splitPhone(value))
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setLocal(splitPhone(value))
      lastEmitted.current = value
    }
  }, [value])

  const emit = (dial: string, national: string) => {
    setLocal({ dial, national })
    const joined = joinPhone(dial, national)
    lastEmitted.current = joined
    onChange(joined)
  }

  return (
    <div className="flex gap-2">
      <CountryCombobox dial={local.dial} onSelect={(dial) => emit(dial, local.national)} />
      <Input
        type="tel"
        inputMode="numeric"
        placeholder={placeholder}
        required={required}
        value={local.national}
        onChange={(e) => emit(local.dial, e.target.value)}
        className="flex-1"
      />
    </div>
  )
}

function CountryCombobox({ dial, onSelect }: { dial: string; onSelect: (dial: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = COUNTRY_CODES.find((c) => c.dial === dial) ?? COUNTRY_CODES[0]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRY_CODES
    return COUNTRY_CODES.filter(
      (c: CountryCode) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.dial.includes(q.replace('+', '')),
    )
  }, [query])

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    setTimeout(() => searchRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          setQuery('')
        }}
        className="flex items-center gap-1.5 h-full rounded-md border border-slate-300 px-2.5 py-2 text-sm bg-white hover:bg-slate-50 outline-none focus:ring-2 focus:ring-brand focus:border-brand"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected.flag}</span>
        <span className="text-slate-600">{selected.dial}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-100">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code..."
              className="w-full text-sm outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No matches</li>}
            {filtered.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.dial === dial}
                  onClick={() => {
                    onSelect(c.dial)
                    setOpen(false)
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 ${
                    c.dial === dial ? 'bg-blue-50 text-brand font-medium' : 'text-slate-700'
                  }`}
                >
                  <span>{c.flag}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-slate-400">{c.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
