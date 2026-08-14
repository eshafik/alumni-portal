import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ImagePlus, Upload, X, Building2 } from 'lucide-react'
import { adminApi } from '../../api/admin'
import { galleryApi } from '../../api/content'
import { api } from '../../api/client'
import { useInstitution } from '../../hooks/useInstitution'
import type { GalleryImage } from '../../types/api'
import { Button, Card, Input, Textarea, Select, Field, SectionHeader, Loading } from '../../components/shared/ui'

async function uploadImage(file: File, context: string): Promise<{ attachmentId: number; url: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('context', context)
  return api.upload('/api/uploads', form)
}

const INSTITUTION_TYPES = [
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College' },
  { value: 'university', label: 'University' },
  { value: 'institute', label: 'Institute' },
]

export default function AdminInstitutionSettings() {
  const { institution, refresh, loading: institutionLoading } = useInstitution()
  const [form, setForm] = useState({
    name: '',
    shortName: '',
    institutionType: 'university',
    description: '',
    aboutText: '',
    missionText: '',
    address: '',
    website: '',
    contactEmail: '',
    themeColor: '#1e3a8a',
    socialLinks: '{}',
    logoAttachmentId: undefined as number | undefined,
  })
  const [logoUrl, setLogoUrl] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  const [gallery, setGallery] = useState<GalleryImage[]>([])
  const [galleryUploading, setGalleryUploading] = useState(false)

  useEffect(() => {
    if (institution) {
      setForm({
        name: institution.name,
        shortName: institution.shortName,
        institutionType: institution.institutionType,
        description: institution.description,
        aboutText: institution.aboutText,
        missionText: institution.missionText,
        address: institution.address,
        website: institution.website,
        contactEmail: institution.contactEmail,
        themeColor: institution.themeColor || '#1e3a8a',
        socialLinks: institution.socialLinks || '{}',
        logoAttachmentId: institution.logoAttachmentId,
      })
      setLogoUrl(institution.logoUrl ?? '')
    }
  }, [institution])

  const loadGallery = () => galleryApi.list().then(setGallery)
  useEffect(() => {
    loadGallery()
  }, [])

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await adminApi.updateInstitution(form)
      await refresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const onLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const { attachmentId, url } = await uploadImage(file, 'logo')
      setForm((f) => ({ ...f, logoAttachmentId: attachmentId }))
      setLogoUrl(url)
    } finally {
      setLogoUploading(false)
    }
  }

  const onGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setGalleryUploading(true)
    try {
      const { attachmentId } = await uploadImage(file, 'gallery')
      await adminApi.createGalleryImage(attachmentId, '', gallery.length)
      await loadGallery()
    } finally {
      setGalleryUploading(false)
      e.target.value = ''
    }
  }

  const updateGalleryCaption = async (img: GalleryImage, caption: string) => {
    await adminApi.updateGalleryImage(img.id, { caption, sortOrder: img.sortOrder, isActive: img.isActive })
    loadGallery()
  }

  const removeGalleryImage = async (img: GalleryImage) => {
    await adminApi.deleteGalleryImage(img.id)
    loadGallery()
  }

  if (institutionLoading) return <Loading />

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Institution Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Branding, contact details, and homepage content shown to all visitors.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Branding */}
        <Card>
          <SectionHeader title="Branding" description="Logo and identity shown across the portal." />
          <div className="flex items-center gap-5 mb-6">
            <div className="w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" /> : <Building2 size={28} className="text-slate-300" />}
            </div>
            <div>
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogoChange} className="hidden" />
              <Button type="button" variant="secondary" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
                <Upload size={15} className="mr-1.5" /> {logoUploading ? 'Uploading...' : logoUrl ? 'Replace logo' : 'Upload logo'}
              </Button>
              <p className="text-xs text-slate-400 mt-1.5">PNG, JPG, or WebP. Square images work best.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Institution name">
              <Input required value={form.name} onChange={set('name')} />
            </Field>
            <Field label="Short name" hint="Shown in the nav bar and browser tab.">
              <Input value={form.shortName} onChange={set('shortName')} />
            </Field>
            <Field label="Institution type">
              <Select value={form.institutionType} onChange={set('institutionType')}>
                {INSTITUTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Brand color" hint="Applied site-wide as the accent color.">
              <div className="flex items-center gap-2.5 h-[38px]">
                <input
                  type="color"
                  value={form.themeColor}
                  onChange={set('themeColor')}
                  className="h-9 w-9 rounded-md border border-slate-300 cursor-pointer p-0.5"
                />
                <Input value={form.themeColor} onChange={set('themeColor')} className="font-mono" />
              </div>
            </Field>
          </div>
        </Card>

        {/* Homepage content */}
        <Card>
          <SectionHeader title="Homepage Content" description="Displayed on the public homepage." />
          <div className="space-y-4">
            <Field label="Hero subtitle" hint="A one-line summary shown under the headline.">
              <Textarea rows={2} value={form.description} onChange={set('description')} />
            </Field>
            <Field label="About Us">
              <Textarea rows={4} value={form.aboutText} onChange={set('aboutText')} />
            </Field>
            <Field label="Our Mission">
              <Textarea rows={4} value={form.missionText} onChange={set('missionText')} />
            </Field>
          </div>
        </Card>

        {/* Contact */}
        <Card>
          <SectionHeader title="Contact & Location" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Address" className="sm:col-span-2">
              <Input value={form.address} onChange={set('address')} />
            </Field>
            <Field label="Website">
              <Input type="url" placeholder="https://" value={form.website} onChange={set('website')} />
            </Field>
            <Field label="Contact email">
              <Input type="email" value={form.contactEmail} onChange={set('contactEmail')} />
            </Field>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
          {saved && <span className="text-sm text-green-600">Saved.</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </form>

      {/* Homepage slider */}
      <Card className="mt-6">
        <SectionHeader title="Homepage Image Slider" description="Rotating images shown in the hero section. Recommended: wide, high-resolution photos." />

        {gallery.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {gallery.map((img) => (
              <div key={img.id} className="group relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                <img src={img.imageUrl} alt="" className="w-full aspect-video object-cover" />
                <button
                  type="button"
                  onClick={() => removeGalleryImage(img)}
                  className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  aria-label="Remove image"
                >
                  <X size={13} />
                </button>
                <input
                  defaultValue={img.caption}
                  onBlur={(e) => updateGalleryCaption(img, e.target.value)}
                  placeholder="Add a caption..."
                  className="w-full text-xs px-2 py-1.5 bg-white border-t border-slate-200 outline-none focus:bg-blue-50"
                />
              </div>
            ))}
          </div>
        )}

        <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 py-8 text-center cursor-pointer hover:border-brand hover:bg-blue-50/40 transition-colors">
          <ImagePlus size={22} className="text-slate-400" />
          <span className="text-sm text-slate-500">{galleryUploading ? 'Uploading...' : 'Click to add an image'}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onGalleryUpload} disabled={galleryUploading} className="hidden" />
        </label>
      </Card>
    </div>
  )
}
