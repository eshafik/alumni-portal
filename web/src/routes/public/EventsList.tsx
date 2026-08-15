import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, MapPin, Clock, ImageIcon, ExternalLink, Search, Loader2 } from 'lucide-react'
import { eventsApi } from '../../api/content'
import type { Event } from '../../types/api'
import { Button, Card, Input, Loading, EmptyState, Pagination } from '../../components/shared/ui'
import { useDebounce } from '../../hooks/useDebounce'
import { normalizeExternalUrl } from '../../lib/utils'

const DESCRIPTION_LIMIT = 180

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  if (text.length <= DESCRIPTION_LIMIT) {
    return <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{text}</p>
  }
  return (
    <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">
      {expanded ? text : text.slice(0, DESCRIPTION_LIMIT).trimEnd() + '…'}{' '}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setExpanded((v) => !v)
        }}
        className="text-brand text-xs font-medium hover:underline"
      >
        {expanded ? 'See less' : 'See more'}
      </button>
    </p>
  )
}

export default function EventsList() {
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [page, setPage] = useState(1)
  const [events, setEvents] = useState<Event[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    eventsApi
      .list(page, debouncedQ)
      .then((res) => {
        setEvents(res.items ?? [])
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }, [page, debouncedQ])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Events</h1>
      <div className="relative max-w-xs mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search events..."
          className="pl-9"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
      </div>
      {loading && events.length === 0 ? (
        <Loading />
      ) : events.length === 0 ? (
        <EmptyState title="No events found" />
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          {events.map((e) => (
            <Card key={e.id} className="p-0 overflow-hidden hover:shadow-md hover:border-brand/30 transition-all">
              <div className="flex flex-col sm:flex-row">
                <Link to={`/events/${e.slug}`} className="sm:w-56 shrink-0">
                  {e.coverUrl ? (
                    <img src={e.coverUrl} alt="" className="w-full h-40 sm:h-full object-cover bg-slate-100" />
                  ) : (
                    <div className="w-full h-40 sm:h-full bg-slate-50 border-b sm:border-b-0 sm:border-r border-slate-100 flex items-center justify-center">
                      <ImageIcon size={28} className="text-slate-300" />
                    </div>
                  )}
                </Link>
                <div className="p-4 flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <Link to={`/events/${e.slug}`}>
                      <p className="font-semibold text-slate-900 hover:text-brand">{e.title}</p>
                    </Link>
                    {e.registrationUrl && (
                      <a href={normalizeExternalUrl(e.registrationUrl)} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <Button className="text-sm px-3 py-1.5">
                          Register <ExternalLink size={12} className="ml-1" />
                        </Button>
                      </a>
                    )}
                    {!e.registrationUrl && (
                      <Link to={`/events/${e.slug}`} className="shrink-0">
                        <Button variant="secondary" className="text-sm px-3 py-1.5">
                          View &amp; Register
                        </Button>
                      </Link>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <CalendarDays size={12} /> {new Date(e.startAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                    {(e.venue || e.onlineUrl) && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} /> {e.venue || 'Online'}
                      </span>
                    )}
                    {e.registrationDeadline && (
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> Register by {new Date(e.registrationDeadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>

                  {e.description && <ExpandableText text={e.description} />}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} pageSize={20} onChange={setPage} />
    </div>
  )
}
