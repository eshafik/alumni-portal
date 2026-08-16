import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { institutionApi } from '../api/directory'
import type { Institution } from '../types/api'
import { DEFAULT_TIMEZONE, setDisplayTimezone } from '../lib/utils'

interface InstitutionContextValue {
  institution: Institution | null
  stats: Record<string, number>
  timezone: string
  loading: boolean
  refresh: () => Promise<void>
}

const InstitutionContext = createContext<InstitutionContextValue | null>(null)

export function InstitutionProvider({ children }: { children: ReactNode }) {
  const [institution, setInstitution] = useState<Institution | null>(null)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const res = await institutionApi.get()
      setInstitution(res.institution)
      setStats(res.stats)
      const tz = res.timezone || DEFAULT_TIMEZONE
      setTimezone(tz)
      setDisplayTimezone(tz)
      // Overrides the Tailwind @theme --color-brand token at runtime so admin-configured
      // branding applies site-wide without a rebuild.
      if (res.institution.themeColor) {
        document.documentElement.style.setProperty('--color-brand', res.institution.themeColor)
        document.documentElement.style.setProperty('--color-brand-dark', `color-mix(in srgb, ${res.institution.themeColor} 80%, black)`)
      }
      // Same runtime-override idea for the browser tab: index.html ships static "Alumni
      // Portal" title/favicon defaults so the tab isn't blank before this fetch resolves;
      // an admin-configured name/favicon takes over here without a rebuild.
      document.title = res.institution.shortName || res.institution.name || 'Alumni Portal'
      if (res.institution.faviconUrl) {
        for (const rel of ['icon', 'apple-touch-icon']) {
          let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
          if (!link) {
            link = document.createElement('link')
            link.rel = rel
            document.head.appendChild(link)
          }
          link.href = res.institution.faviconUrl
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <InstitutionContext.Provider value={{ institution, stats, timezone, loading, refresh }}>{children}</InstitutionContext.Provider>
  )
}

export function useInstitution() {
  const ctx = useContext(InstitutionContext)
  if (!ctx) throw new Error('useInstitution must be used within InstitutionProvider')
  return ctx
}
