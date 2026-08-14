import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { eventsApi, adminEventsApi } from '../../api/content'
import type { Event } from '../../types/api'
import { Button, Card, Input, Textarea, Loading } from '../../components/shared/ui'
import { ImageUploadField } from '../../components/shared/ImageUploadField'

const emptyForm = {
  title: '',
  description: '',
  coverAttachmentId: null as number | null,
  startAt: '',
  endAt: '',
  venue: '',
  onlineUrl: '',
  registrationDeadline: '',
  capacity: '',
}

export default function AdminEvents() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [coverUrl, setCoverUrl] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const reload = () => {
    setLoading(true)
    eventsApi
      .list(1)
      .then((res) => setEvents(res.items ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [])

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm)
    setCoverUrl(undefined)
    setError('')
  }

  const startEdit = (ev: Event) => {
    setEditingId(ev.id)
    setForm({
      title: ev.title,
      description: ev.description,
      coverAttachmentId: ev.coverAttachmentId ?? null,
      startAt: ev.startAt ? ev.startAt.slice(0, 16) : '',
      endAt: ev.endAt ? ev.endAt.slice(0, 16) : '',
      venue: ev.venue,
      onlineUrl: ev.onlineUrl,
      registrationDeadline: ev.registrationDeadline ? ev.registrationDeadline.slice(0, 16) : '',
      capacity: ev.capacity != null ? String(ev.capacity) : '',
    })
    setCoverUrl(undefined)
    setError('')
  }

  const submit = async () => {
    setError('')
    if (!form.title.trim() || !form.startAt) {
      setError('Title and start date/time are required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        description: form.description,
        coverAttachmentId: form.coverAttachmentId,
        startAt: form.startAt,
        endAt: form.endAt || null,
        venue: form.venue,
        onlineUrl: form.onlineUrl,
        registrationDeadline: form.registrationDeadline || null,
        capacity: form.capacity ? Number(form.capacity) : null,
      }
      if (editingId !== null) {
        await adminEventsApi.update(editingId, payload)
      } else {
        await adminEventsApi.create(payload)
      }
      resetForm()
      reload()
    } catch {
      setError('Could not save this event — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (ev: Event) => {
    if (!window.confirm(`Cancel event "${ev.title}"?`)) return
    await adminEventsApi.delete(ev.id)
    reload()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Events</h1>
        <p className="text-sm text-slate-500 mt-1">Create and manage alumni events. A shareable page is generated automatically.</p>
      </div>

      <Card className="mb-6">
        <h2 className="text-lg font-medium mb-4">{editingId !== null ? 'Edit event' : 'New event'}</h2>
        <div className="space-y-4">
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea placeholder="Description" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-slate-700 block mb-1.5">Start date/time</span>
              <Input type="datetime-local" value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))} />
            </div>
            <div>
              <span className="text-sm font-medium text-slate-700 block mb-1.5">End date/time (optional)</span>
              <Input type="datetime-local" value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input placeholder="Venue" value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))} />
            <Input placeholder="Online meeting URL (optional)" value={form.onlineUrl} onChange={(e) => setForm((f) => ({ ...f, onlineUrl: e.target.value }))} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-slate-700 block mb-1.5">Registration deadline (optional)</span>
              <Input type="datetime-local" value={form.registrationDeadline} onChange={(e) => setForm((f) => ({ ...f, registrationDeadline: e.target.value }))} />
            </div>
            <Input placeholder="Capacity (optional)" type="number" min="1" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
          </div>
          <ImageUploadField
            label="Cover image (optional)"
            context="event"
            maxSizeMB={8}
            imageUrl={coverUrl}
            onChange={(id, url) => {
              setForm((f) => ({ ...f, coverAttachmentId: id }))
              setCoverUrl(url)
            }}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={submit} disabled={saving}>
              <Plus size={15} className="mr-1" /> {editingId !== null ? 'Save changes' : 'Create event'}
            </Button>
            {editingId !== null && (
              <Button variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </Card>

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-3">
          {events.length === 0 && <p className="text-sm text-slate-400">No events yet.</p>}
          {events.map((ev) => (
            <Card key={ev.id} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Link to={`/events/${ev.slug}`} className="font-medium hover:text-brand">
                  {ev.title}
                </Link>
                <p className="text-sm text-slate-500 mt-1">
                  {ev.startAt?.replace('T', ' ').slice(0, 16)} {ev.venue && `· ${ev.venue}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => startEdit(ev)} className="p-1.5 rounded-md text-slate-400 hover:text-brand hover:bg-blue-50" aria-label="Edit">
                  <Pencil size={15} />
                </button>
                <button onClick={() => remove(ev)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Cancel event">
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
