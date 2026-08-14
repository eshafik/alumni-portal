import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { businessesApi } from '../../api/content'
import { ApiError } from '../../api/client'
import { PhoneInput } from '../../components/shared/PhoneInput'
import { Button, Card, Input, Textarea, Field } from '../../components/shared/ui'
import { ImageUploadField } from '../../components/shared/ImageUploadField'

export default function BusinessCreate() {
  const navigate = useNavigate()
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
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const business = await businessesApi.create({ ...form, logoAttachmentId })
      navigate(`/businesses/${business.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your business — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Add Your Business</h1>
      <p className="text-sm text-slate-500 mb-6">List your business in the Alumni Business Directory.</p>

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
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
            onChange={(id, url) => {
              setLogoAttachmentId(id)
              setLogoUrl(url)
            }}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Add business'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
