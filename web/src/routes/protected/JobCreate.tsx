import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { jobsApi } from '../../api/content'
import { ApiError } from '../../api/client'
import { Button, Card, Input, Textarea, Field, Loading } from '../../components/shared/ui'
import { ImageUploadField } from '../../components/shared/ImageUploadField'

export default function JobCreate() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = Boolean(id)

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
  const [loading, setLoading] = useState(isEditing)

  useEffect(() => {
    if (!id) return
    jobsApi
      .get(Number(id))
      .then((job) => {
        setForm({
          title: job.title,
          companyName: job.companyName,
          location: job.location,
          employmentType: job.employmentType,
          description: job.description,
          salary: job.salary,
          applyUrl: job.applyUrl,
          applyEmail: job.applyEmail,
          deadline: job.deadline ? job.deadline.slice(0, 10) : '',
        })
        setImageAttachmentId(job.imageAttachmentId ?? null)
        setImageUrl(job.imageUrl)
      })
      .finally(() => setLoading(false))
  }, [id])

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = { ...form, imageAttachmentId, deadline: form.deadline || null }
      const job = isEditing ? await jobsApi.update(Number(id), payload) : await jobsApi.create(payload)
      navigate(`/jobs/${job.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${isEditing ? 'update' : 'post'} this job — please try again.`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">{isEditing ? 'Edit Job Post' : 'Post a Job'}</h1>
      <p className="text-sm text-slate-500 mb-6">{isEditing ? 'Update the details of this listing.' : 'Share an opportunity with fellow alumni.'}</p>

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <fieldset disabled={saving} className="space-y-4">
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
          </fieldset>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 size={15} className="mr-1.5 animate-spin" />}
            {saving ? (isEditing ? 'Saving...' : 'Posting...') : isEditing ? 'Save changes' : 'Post job'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
