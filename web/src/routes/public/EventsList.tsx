import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { eventsApi } from '../../api/content'
import type { Event } from '../../types/api'
import { Card, Loading, EmptyState, Pagination } from '../../components/shared/ui'

export default function EventsList() {
  const [page, setPage] = useState(1)
  const [events, setEvents] = useState<Event[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    eventsApi
      .list(page)
      .then((res) => {
        setEvents(res.items ?? [])
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }, [page])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Events</h1>
      {loading ? (
        <Loading />
      ) : events.length === 0 ? (
        <EmptyState title="No upcoming events" />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {events.map((e) => (
            <Link key={e.id} to={`/events/${e.slug}`}>
              <Card className="hover:shadow-md transition-shadow">
                <p className="font-medium">{e.title}</p>
                <p className="text-sm text-slate-500 mt-1">{new Date(e.startAt).toLocaleString()}</p>
                <p className="text-sm text-slate-500">{e.venue || e.onlineUrl}</p>
                {e.description && <p className="text-sm text-slate-600 mt-2 line-clamp-2">{e.description}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} pageSize={20} onChange={setPage} />
    </div>
  )
}
