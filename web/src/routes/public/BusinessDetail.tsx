import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import { businessesApi } from '../../api/content'
import { ApiError } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { useConfirm } from '../../hooks/useConfirm'
import { ROLE } from '../../types/api'
import type { Business } from '../../types/api'
import { Avatar, Button, Card, Field, Input, Textarea, Loading } from '../../components/shared/ui'
import { PhoneInput } from '../../components/shared/PhoneInput'
import { ImageUploadField } from '../../components/shared/ImageUploadField'
import { normalizeExternalUrl } from '../../lib/utils'

export default function BusinessDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const confirm = useConfirm()
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: '',
    category: '',
    description: '',
    location: '',
    website: '',
    contactPhone: '',
    contactEmail: '',
  })
  const [logoAttachmentId, setLogoAttachmentId] = useState<number | null>(null)
  const [logoUrl, setLogoUrl] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    if (!id) return
    setLoading(true)
    businessesApi
      .get(Number(id))
      .then(setBusiness)
      .finally(() => setLoading(false))
  }
  useEffect(load, [id])

  if (loading) return <Loading />
  if (!business) return <p className="text-center py-12 text-slate-500">Business not found.</p>

  const canManage = !!user && (user.id === business.ownerUserId || user.roleId === ROLE.Admin || user.roleId === ROLE.SuperAdmin)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const startEdit = () => {
    setForm({
      name: business.name,
      category: business.category,
      description: business.description,
      location: business.location,
      website: business.website,
      contactPhone: business.contactPhone,
      contactEmail: business.contactEmail,
    })
    setLogoAttachmentId(business.logoAttachmentId ?? null)
    setLogoUrl(business.logoUrl)
    setError('')
    setEditing(true)
  }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    try {
      await businessesApi.update(business.id, { ...form, logoAttachmentId })
      setEditing(false)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    const ok = await confirm({ description: `Delete "${business.name}"? This can't be undone.`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    try {
      await businessesApi.delete(business.id)
      navigate('/businesses')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this business')
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        {editing ? (
          <fieldset disabled={saving} className="space-y-4">
            <Field label="Business name">
              <Input required value={form.name} onChange={set('name')} />
            </Field>
            <Field label="Category" hint="e.g. Restaurant, Consulting, Retail">
              <Input value={form.category} onChange={set('category')} />
            </Field>
            <Field label="Description">
              <Textarea rows={4} value={form.description} onChange={set('description')} />
            </Field>
            <Field label="Location">
              <Input value={form.location} onChange={set('location')} />
            </Field>
            <Field label="Website">
              <Input type="url" placeholder="https://" value={form.website} onChange={set('website')} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Contact phone">
                <PhoneInput value={form.contactPhone} onChange={(v) => setForm((f) => ({ ...f, contactPhone: v }))} />
              </Field>
              <Field label="Contact email">
                <Input type="email" value={form.contactEmail} onChange={set('contactEmail')} />
              </Field>
            </div>
            <ImageUploadField
              label="Logo (optional)"
              context="business"
              maxSizeMB={4}
              imageUrl={logoUrl}
              onChange={(logoId, url) => {
                setLogoAttachmentId(logoId)
                setLogoUrl(url)
              }}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={save} disabled={!form.name.trim() || saving}>
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
              <h1 className="text-2xl font-semibold">{business.name}</h1>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={startEdit} className="p-1.5 rounded-md text-slate-400 hover:text-brand hover:bg-blue-50" aria-label="Edit">
                    <Pencil size={16} />
                  </button>
                  <button onClick={remove} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
            <p className="text-slate-500">{business.category}</p>
            {business.ownerName && (
              <Link to={`/directory/${business.ownerUserId}`} className="inline-flex items-center gap-2 mt-3 group">
                <Avatar name={business.ownerName} url={business.ownerAvatarUrl} size="sm" />
                <span className="text-sm text-slate-600 group-hover:text-brand">Listed by {business.ownerName}</span>
              </Link>
            )}
            {business.description && <p className="mt-4 text-slate-700 whitespace-pre-wrap">{business.description}</p>}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {business.location && (
                <div>
                  <dt className="text-slate-400">Location</dt>
                  <dd>{business.location}</dd>
                </div>
              )}
              {business.website && (
                <div>
                  <dt className="text-slate-400">Website</dt>
                  <dd>
                    <a href={normalizeExternalUrl(business.website)} className="text-brand" target="_blank" rel="noreferrer">
                      {business.website}
                    </a>
                  </dd>
                </div>
              )}
              {business.contactPhone && (
                <div>
                  <dt className="text-slate-400">Phone</dt>
                  <dd>{business.contactPhone}</dd>
                </div>
              )}
              {business.contactEmail && (
                <div>
                  <dt className="text-slate-400">Email</dt>
                  <dd>{business.contactEmail}</dd>
                </div>
              )}
            </dl>
          </>
        )}
      </Card>
    </div>
  )
}
