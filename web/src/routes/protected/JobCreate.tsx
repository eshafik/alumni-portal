import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { jobsApi } from '../../api/content'
import { ApiError } from '../../api/client'
import { Button, Card, Input, Textarea, Field } from '../../components/shared/ui'
import { ImageUploadField } from '../../components/shared/ImageUploadField'

export default function JobCreate() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '',
    companyName: '',
    location: '',
    employmentType: '',
    description: '',
    salary: '',
    applyUrl: '',
    applyEmail: '',
    deadline: '',
  })
  const [imageAttachmentId, setImageAttachmentId] = useState<number | null>(null)
  const [imageUrl, setImageUrl] = useState<string>()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const job = await jobsApi.create({
        ...form,
        imageAttachmentId,
        deadline: form.deadline || null,
      })
      navigate(`/jobs/${job.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post this job — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Post a Job</h1>
      <p className="text-sm text-slate-500 mb-6">Share an opportunity with fellow alumni.</p>

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Job title">
            <Input required value={form.title} onChange={set('title')} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Company">
              <Input value={form.companyName} onChange={set('companyName')} />
            </Field>
            <Field label="Location">
              <Input value={form.location} onChange={set('location')} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Employment type" hint="e.g. Full-time, Internship">
              <Input value={form.employmentType} onChange={set('employmentType')} />
            </Field>
            <Field label="Salary (optional)">
              <Input value={form.salary} onChange={set('salary')} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea rows={5} value={form.description} onChange={set('description')} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Application URL (optional)">
              <Input type="url" placeholder="https://" value={form.applyUrl} onChange={set('applyUrl')} />
            </Field>
            <Field label="Application email (optional)">
              <Input type="email" value={form.applyEmail} onChange={set('applyEmail')} />
            </Field>
          </div>
          <Field label="Application deadline (optional)">
            <Input type="date" value={form.deadline} onChange={set('deadline')} />
          </Field>

          <ImageUploadField
            label="Job image (optional)"
            context="job"
            maxSizeMB={1}
            imageUrl={imageUrl}
            onChange={(id, url) => {
              setImageAttachmentId(id)
              setImageUrl(url)
            }}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? 'Posting...' : 'Post job'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
