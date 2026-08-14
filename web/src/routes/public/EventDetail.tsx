import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Share2, ExternalLink, CalendarDays, MapPin, Clock, Users } from 'lucide-react'
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
  const [shareMessage, setShareMessage] = useState('')

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

  const cancel = async () => {
    setError('')
    try {
      await eventsApi.cancelRegistration(event.slug)
      setStatus(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel registration')
    }
  }

  const share = async () => {
    const url = `${window.location.origin}/share/events/${event.slug}`
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, url })
      } catch {
        // user cancelled the share sheet — no error to show
      }
      return
    }
    await navigator.clipboard.writeText(url)
    setShareMessage('Link copied!')
    setTimeout(() => setShareMessage(''), 2500)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="p-0 overflow-hidden">
        {event.coverUrl && <img src={event.coverUrl} alt="" className="w-full max-h-72 object-cover" />}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold">{event.title}</h1>
            <div className="relative shrink-0">
              <button
                onClick={share}
                className="p-2 rounded-md text-slate-400 hover:text-brand hover:bg-blue-50"
                aria-label="Share event"
                title="Share"
              >
                <Share2 size={18} />
              </button>
              {shareMessage && <span className="absolute right-0 top-full mt-1 text-xs text-green-600 whitespace-nowrap">{shareMessage}</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <CalendarDays size={14} /> {new Date(event.startAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            {event.venue && (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} /> {event.venue}
              </span>
            )}
            {event.registrationDeadline && (
              <span className="flex items-center gap-1.5">
                <Clock size={14} /> Register by {new Date(event.registrationDeadline).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            )}
            {!event.registrationUrl && event.capacity !== undefined && event.capacity !== null && (
              <span className="flex items-center gap-1.5">
                <Users size={14} /> {registeredCount} / {event.capacity} registered
              </span>
            )}
          </div>

          {event.onlineUrl && (
            <p className="text-slate-500 mt-2 text-sm">
              Online:{' '}
              <a href={event.onlineUrl} className="text-brand" target="_blank" rel="noreferrer">
                {event.onlineUrl}
              </a>
            </p>
          )}
          {event.description && <p className="mt-4 text-slate-700 whitespace-pre-wrap">{event.description}</p>}

          <div className="mt-6">
            {event.registrationUrl ? (
              <a href={event.registrationUrl} target="_blank" rel="noopener noreferrer">
                <Button>
                  Register <ExternalLink size={14} className="ml-1.5" />
                </Button>
              </a>
            ) : !user ? (
              <p className="text-sm text-slate-500">Log in to register for this event.</p>
            ) : status ? (
              <div className="flex items-center gap-3">
                <p className="text-green-600 text-sm font-medium">
                  {status === 'waitlisted' ? "You're on the waitlist." : "You're registered!"}
                </p>
                <Button variant="secondary" onClick={cancel}>
                  Cancel registration
                </Button>
              </div>
            ) : (
              <Button onClick={register}>{isFull ? 'Join waitlist' : 'Register'}</Button>
            )}
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
        </div>
      </Card>
    </div>
  )
}
