import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Pin, Pencil, Trash2, Loader2 } from 'lucide-react'
import { noticesApi, adminNoticesApi } from '../../api/content'
import { ApiError } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { useConfirm } from '../../hooks/useConfirm'
import { ROLE } from '../../types/api'
import type { Notice } from '../../types/api'
import { Button, Card, Input, Textarea, Select, Badge, Loading } from '../../components/shared/ui'
import { ImageUploadField } from '../../components/shared/ImageUploadField'
import { formatDateTime } from '../../lib/utils'

export default function NoticeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const confirm = useConfirm()
  const isAdmin = user?.roleId === ROLE.Admin || user?.roleId === ROLE.SuperAdmin

  const [notice, setNotice] = useState<Notice | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    title: '',
    body: '',
    importance: 'normal' as 'normal' | 'important' | 'urgent',
    pinned: false,
    isPublic: false,
    imageAttachmentId: null as number | null,
  })
  const [imageUrl, setImageUrl] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    if (!id) return
    setLoading(true)
    noticesApi
      .get(Number(id))
      .then(setNotice)
      .finally(() => setLoading(false))
  }
  useEffect(load, [id])

  if (loading) return <Loading />
  if (!notice) return <p className="text-center py-12 text-slate-500">Notice not found.</p>

  const startEdit = () => {
    setForm({
      title: notice.title,
      body: notice.body,
      importance: notice.importance,
      pinned: notice.pinned,
      isPublic: notice.isPublic,
      imageAttachmentId: notice.imageAttachmentId ?? null,
    })
    setImageUrl(notice.imageUrl)
    setError('')
    setEditing(true)
  }

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    setError('')
    try {
      await adminNoticesApi.update(notice.id, form)
      setEditing(false)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    const ok = await confirm({ description: `Delete "${notice.title}"? This can't be undone.`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    try {
      await adminNoticesApi.delete(notice.id)
      navigate('/notices')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this notice')
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="p-0 overflow-hidden">
        {!editing && notice.imageUrl && <img src={notice.imageUrl} alt="" className="w-full max-h-72 object-cover" />}
        <div className="p-5">
          {editing ? (
            <fieldset disabled={saving} className="space-y-4">
              <Input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              <Textarea placeholder="Body" rows={5} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
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
                    Public
                  </label>
                </div>
              </div>
              <ImageUploadField
                label="Image (optional)"
                context="notice"
                maxSizeMB={1}
                imageUrl={imageUrl}
                onChange={(imgId, url) => {
                  setForm((f) => ({ ...f, imageAttachmentId: imgId }))
                  setImageUrl(url)
                }}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button onClick={save} disabled={!form.title.trim() || saving}>
                  {saving && <Loader2 size={15} className="mr-1.5 animate-spin" />} Save changes
                </Button>
                <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </fieldset>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {notice.pinned && <Pin size={15} className="text-brand shrink-0" />}
                  <h1 className="text-xl font-semibold">{notice.title}</h1>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {notice.importance !== 'normal' && <Badge tone={notice.importance as 'important' | 'urgent'}>{notice.importance}</Badge>}
                  {isAdmin && (
                    <>
                      <button onClick={startEdit} className="p-1.5 rounded-md text-slate-400 hover:text-brand hover:bg-blue-50" aria-label="Edit">
                        <Pencil size={16} />
                      </button>
                      <button onClick={remove} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Delete">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">{formatDateTime(notice.publishedAt)}</p>
              <p className="mt-4 text-slate-700 whitespace-pre-wrap">{notice.body}</p>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
