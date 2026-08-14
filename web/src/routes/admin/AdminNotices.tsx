import { useEffect, useState } from 'react'
import { Pencil, Trash2, Pin, Plus } from 'lucide-react'
import { noticesApi, adminNoticesApi } from '../../api/content'
import type { Notice } from '../../types/api'
import { Button, Card, Input, Textarea, Select, Loading } from '../../components/shared/ui'
import { ImageUploadField } from '../../components/shared/ImageUploadField'

const emptyForm = {
  title: '',
  body: '',
  importance: 'normal' as 'normal' | 'important' | 'urgent',
  pinned: false,
  isPublic: false,
  imageAttachmentId: null as number | null,
}

export default function AdminNotices() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [imageUrl, setImageUrl] = useState<string>()
  const [saving, setSaving] = useState(false)

  const reload = () => {
    setLoading(true)
    noticesApi
      .list(1)
      .then((res) => setNotices(res.items ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [])

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm)
    setImageUrl(undefined)
  }

  const startEdit = (n: Notice) => {
    setEditingId(n.id)
    setForm({
      title: n.title,
      body: n.body,
      importance: n.importance,
      pinned: n.pinned,
      isPublic: n.isPublic,
      imageAttachmentId: n.imageAttachmentId ?? null,
    })
    setImageUrl(n.imageUrl)
  }

  const submit = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      if (editingId !== null) {
        await adminNoticesApi.update(editingId, form)
      } else {
        await adminNoticesApi.create(form)
      }
      resetForm()
      reload()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (n: Notice) => {
    if (!window.confirm(`Delete notice "${n.title}"?`)) return
    await adminNoticesApi.delete(n.id)
    reload()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Notices</h1>
        <p className="text-sm text-slate-500 mt-1">
          Public notices are visible to anyone on the homepage. Private notices are visible only to logged-in,
          approved members.
        </p>
      </div>

      <Card className="mb-6">
        <h2 className="text-lg font-medium mb-4">{editingId !== null ? 'Edit notice' : 'New notice'}</h2>
        <div className="space-y-4">
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea placeholder="Body" rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Select value={form.importance} onChange={(e) => setForm((f) => ({ ...f, importance: e.target.value as typeof form.importance }))}>
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </Select>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} />
                Pinned
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))} />
                Public (visible without login)
              </label>
            </div>
          </div>
          <ImageUploadField
            label="Image (optional)"
            context="notice"
            maxSizeMB={1}
            imageUrl={imageUrl}
            onChange={(id, url) => {
              setForm((f) => ({ ...f, imageAttachmentId: id }))
              setImageUrl(url)
            }}
          />
          <div className="flex gap-2">
            <Button onClick={submit} disabled={!form.title.trim() || saving}>
              <Plus size={15} className="mr-1" /> {editingId !== null ? 'Save changes' : 'Publish notice'}
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
          {notices.length === 0 && <p className="text-sm text-slate-400">No notices yet.</p>}
          {notices.map((n) => (
            <Card key={n.id} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {n.pinned && <Pin size={13} className="text-brand" />}
                  <p className="font-medium">{n.title}</p>
                  <span className="text-xs rounded-full px-2 py-0.5 bg-slate-100 text-slate-500">{n.importance}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${n.isPublic ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {n.isPublic ? 'Public' : 'Private'}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">{n.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => startEdit(n)} className="p-1.5 rounded-md text-slate-400 hover:text-brand hover:bg-blue-50" aria-label="Edit">
                  <Pencil size={15} />
                </button>
                <button onClick={() => remove(n)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Delete">
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
