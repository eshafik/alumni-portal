import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { eventsApi } from '../../api/content'
import { ApiError } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import type { Event } from '../../types/api'
import { Button, Card, Loading } from '../../components/shared/ui'

export default function EventDetail() {
  const { slug } = useParams()
  const { user } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [registeredCount, setRegisteredCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!slug) return
    eventsApi
      .get(slug)
      .then((res) => {
        setEvent(res.event)
        setRegisteredCount(res.registeredCount)
      })
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) return <Loading />
  if (!event) return <p className="text-center py-12 text-slate-500">Event not found.</p>

  const isFull = event.capacity !== undefined && event.capacity !== null && registeredCount >= event.capacity

  const register = async () => {
    setError('')
    try {
      const res = await eventsApi.register(event.slug)
      setStatus(res.status)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed')
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <p className="text-slate-500 mt-1">{new Date(event.startAt).toLocaleString()}</p>
        {event.venue && <p className="text-slate-500">{event.venue}</p>}
        {event.onlineUrl && (
          <p className="text-slate-500">
            Online:{' '}
            <a href={event.onlineUrl} className="text-brand" target="_blank" rel="noreferrer">
              {event.onlineUrl}
            </a>
          </p>
        )}
        {event.description && <p className="mt-4 text-slate-700 whitespace-pre-wrap">{event.description}</p>}

        {event.capacity !== undefined && event.capacity !== null && (
          <p className="mt-4 text-sm text-slate-500">
            {registeredCount} / {event.capacity} registered
          </p>
        )}

        <div className="mt-6">
          {!user ? (
            <p className="text-sm text-slate-500">Log in to register for this event.</p>
          ) : status ? (
            <p className="text-green-600 text-sm font-medium">
              {status === 'waitlisted' ? "You're on the waitlist." : "You're registered!"}
            </p>
          ) : (
            <Button onClick={register}>{isFull ? 'Join waitlist' : 'Register'}</Button>
          )}
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      </Card>
    </div>
  )
}
