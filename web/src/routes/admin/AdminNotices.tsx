import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Pencil, Trash2, Pin, Plus, Loader2, Search } from 'lucide-react'
import { noticesApi, adminNoticesApi } from '../../api/content'
import type { Notice } from '../../types/api'
import { Button, Card, Input, Textarea, Select, Loading } from '../../components/shared/ui'
import { ImageUploadField } from '../../components/shared/ImageUploadField'
import { useConfirm } from '../../hooks/useConfirm'
import { useDebounce } from '../../hooks/useDebounce'

const emptyForm = {
  title: '',
  body: '',
  importance: 'normal' as 'normal' | 'important' | 'urgent',
  pinned: false,
  isPublic: false,
  imageAttachmentId: null as number | null,
}

export default function AdminNotices() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [imageUrl, setImageUrl] = useState<string>()
  const [saving, setSaving] = useState(false)

  const reload = () => {
    setLoading(true)
    noticesApi
      .list(1, debouncedQ)
      .then((res) => setNotices(res.items ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [debouncedQ])

  const submit = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const created = await adminNoticesApi.create(form)
      setForm(emptyForm)
      setImageUrl(undefined)
      navigate(`/notices/${created.id}`)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (n: Notice) => {
    const ok = await confirm({ description: `Delete notice "${n.title}"?`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    await adminNoticesApi.delete(n.id)
    reload()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Notices</h1>
        <p className="text-sm text-slate-500 mt-1">
          Public notices are visible to anyone on the homepage. Private notices are visible only to logged-in,
          approved members. Click a notice below to edit it.
        </p>
      </div>

      <Card className="mb-6">
        <h2 className="text-lg font-medium mb-4">New notice</h2>
        <fieldset disabled={saving} className="space-y-4">
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
        </fieldset>
        <div className="flex gap-2 mt-4">
          <Button onClick={submit} disabled={!form.title.trim() || saving}>
            {saving ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Plus size={15} className="mr-1" />}
            Publish notice
          </Button>
        </div>
      </Card>

      <div className="relative max-w-xs mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search notices..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
      </div>

      {loading && notices.length === 0 ? (
        <Loading />
      ) : (
        <div className="space-y-3">
          {notices.length === 0 && <p className="text-sm text-slate-400">No notices found.</p>}
          {notices.map((n) => (
            <Card key={n.id} className="p-0 overflow-hidden hover:shadow-md hover:border-brand/30 transition-all">
              <Link to={`/notices/${n.id}`} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {n.pinned && <Pin size={13} className="text-brand" />}
                    <p className="font-medium hover:text-brand">{n.title}</p>
                    <span className="text-xs rounded-full px-2 py-0.5 bg-slate-100 text-slate-500">{n.importance}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${n.isPublic ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {n.isPublic ? 'Public' : 'Private'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{n.body}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="p-1.5 text-slate-300" title="Click to view / edit">
                    <Pencil size={15} />
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      remove(n)
                    }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
