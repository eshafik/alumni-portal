import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, Plus, ExternalLink, Users, Download, ImageIcon, Clock } from 'lucide-react'
import { eventsApi, adminEventsApi, type EventRegistrationRow } from '../../api/content'
import type { Event } from '../../types/api'
import { Button, Card, Input, Textarea, Badge, Loading, Pagination } from '../../components/shared/ui'
import { ImageUploadField } from '../../components/shared/ImageUploadField'
import { useDebounce } from '../../hooks/useDebounce'
import { useConfirm } from '../../hooks/useConfirm'

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
  isPublic: true,
  registrationUrl: '',
  responseUrl: '',
}

export default function AdminEvents() {
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [page, setPage] = useState(1)
  const [events, setEvents] = useState<Event[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [coverUrl, setCoverUrl] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const reload = () => {
    setLoading(true)
    eventsApi
      .list(page, debouncedQ)
      .then((res) => {
        setEvents(res.items ?? [])
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }
  useEffect(reload, [page, debouncedQ])

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm)
    setCoverUrl(undefined)
    setError('')
  }

  const startEdit = async (ev: Event) => {
    setEditingId(ev.id)
    setError('')
    const detail = await adminEventsApi.getById(ev.id)
    setForm({
      title: detail.title,
      description: detail.description,
      coverAttachmentId: detail.coverAttachmentId ?? null,
      startAt: detail.startAt ? detail.startAt.slice(0, 16) : '',
      endAt: detail.endAt ? detail.endAt.slice(0, 16) : '',
      venue: detail.venue,
      onlineUrl: detail.onlineUrl,
      registrationDeadline: detail.registrationDeadline ? detail.registrationDeadline.slice(0, 16) : '',
      capacity: detail.capacity != null ? String(detail.capacity) : '',
      isPublic: detail.isPublic,
      registrationUrl: detail.registrationUrl ?? '',
      responseUrl: detail.responseUrl ?? '',
    })
    setCoverUrl(undefined)
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
        isPublic: form.isPublic,
        registrationUrl: form.registrationUrl || null,
        responseUrl: form.responseUrl || null,
      }
      if (editingId !== null) {
        await adminEventsApi.update(editingId, payload)
      } else {
        await adminEventsApi.create(payload)
      }
      resetForm()
      setPage(1)
      reload()
    } catch {
      setError('Could not save this event — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (ev: Event) => {
    const ok = await confirm({ description: `Cancel event "${ev.title}"?`, confirmLabel: 'Cancel event', danger: true })
    if (!ok) return
    await adminEventsApi.delete(ev.id)
    reload()
  }

  const [regEventId, setRegEventId] = useState<number | null>(null)
  const [registrations, setRegistrations] = useState<EventRegistrationRow[]>([])
  const [regLoading, setRegLoading] = useState(false)

  const toggleRegistrations = async (ev: Event) => {
    if (regEventId === ev.id) {
      setRegEventId(null)
      return
    }
    setRegEventId(ev.id)
    setRegLoading(true)
    try {
      const rows = await adminEventsApi.listRegistrations(ev.id)
      setRegistrations(rows ?? [])
    } finally {
      setRegLoading(false)
    }
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

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))} />
            Public event
          </label>
          <p className="text-xs text-slate-400 -mt-3">Unchecked events are only visible to logged-in, approved members.</p>

          <div>
            <span className="text-sm font-medium text-slate-700 block mb-1.5">Registration link (optional)</span>
            <Input placeholder="https://forms.gle/..." value={form.registrationUrl} onChange={(e) => setForm((f) => ({ ...f, registrationUrl: e.target.value }))} />
            <p className="text-xs text-slate-400 mt-1.5">
              Paste a Google Form (or any) link — this becomes the Register button.{' '}
              <a href="https://docs.google.com/forms/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                Create one on Google Forms <ExternalLink size={11} />
              </a>
              . Leave blank to use in-app registration instead.
            </p>
          </div>

          <div>
            <span className="text-sm font-medium text-slate-700 block mb-1.5">Response link (optional)</span>
            <Input placeholder="https://docs.google.com/forms/.../responses" value={form.responseUrl} onChange={(e) => setForm((f) => ({ ...f, responseUrl: e.target.value }))} />
            <p className="text-xs text-slate-400 mt-1.5">e.g. your Google Form's response sheet — only visible to admins here.</p>
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

      <Input
        placeholder="Search events..."
        className="max-w-xs mb-4"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPage(1)
        }}
      />

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-3">
          {events.length === 0 && <p className="text-sm text-slate-400">No events found.</p>}
          {events.map((ev) => (
            <Card key={ev.id} className="p-0 overflow-hidden">
              <div className="flex items-start gap-4 p-4">
                {ev.coverUrl ? (
                  <img src={ev.coverUrl} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0 bg-slate-100" />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                    <ImageIcon size={22} className="text-slate-300" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link to={`/events/${ev.slug}`} className="font-medium hover:text-brand">
                      {ev.title}
                    </Link>
                    {!ev.isPublic && <Badge>Private</Badge>}
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {ev.startAt?.replace('T', ' ').slice(0, 16)} {ev.venue && `· ${ev.venue}`}
                  </p>
                  {ev.registrationDeadline && (
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                      <Clock size={11} /> Register by {ev.registrationDeadline.replace('T', ' ').slice(0, 16)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleRegistrations(ev)} className="p-1.5 rounded-md text-slate-400 hover:text-brand hover:bg-blue-50" aria-label="View registrations">
                    <Users size={15} />
                  </button>
                  <button onClick={() => startEdit(ev)} className="p-1.5 rounded-md text-slate-400 hover:text-brand hover:bg-blue-50" aria-label="Edit">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => remove(ev)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Cancel event">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {regEventId === ev.id && (
                <div className="border-t border-slate-100 bg-slate-50/60 p-4">
                  {regLoading ? (
                    <Loading />
                  ) : registrations.length === 0 ? (
                    <p className="text-sm text-slate-400">No registrations yet.</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-700">{registrations.length} registration{registrations.length !== 1 && 's'}</p>
                        <a
                          href={adminEventsApi.registrationsCsvUrl(ev.id)}
                          className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                        >
                          <Download size={12} /> Export CSV
                        </a>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-400">
                              <th className="pb-1.5 pr-4">Name</th>
                              <th className="pb-1.5 pr-4">Email</th>
                              <th className="pb-1.5">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {registrations.map((row) => (
                              <tr key={row.userId}>
                                <td className="py-1.5 pr-4">{row.fullName}</td>
                                <td className="py-1.5 pr-4 text-slate-500">{row.email}</td>
                                <td className="py-1.5 capitalize">{row.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} pageSize={20} onChange={setPage} />
    </div>
  )
}
