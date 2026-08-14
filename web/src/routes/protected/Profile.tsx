import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { api, ApiError } from '../../api/client'
import { alumniApi, configApi } from '../../api/directory'
import { ROLE } from '../../types/api'
import type { BloodGroup } from '../../types/api'
import { Button, Card, Input, Loading } from '../../components/shared/ui'
import { PhoneInput } from '../../components/shared/PhoneInput'
import { AvatarUploader } from '../../components/shared/AvatarUploader'

interface FormState {
  fullName: string
  phone: string
  bio: string
  currentDesignation: string
  currentCompanyName: string
  currentLocation: string
  bloodGroupId: string
  avatarAttachmentId: number | null
  linkedinUrl: string
  whatsappNumber: string
  websiteUrl: string
  privacyEmail: boolean
  privacyPhone: boolean
  privacyWhatsapp: boolean
  privacyLocation: boolean
  privacyCompany: boolean
}

const emptyForm: FormState = {
  fullName: '',
  phone: '',
  bio: '',
  currentDesignation: '',
  currentCompanyName: '',
  currentLocation: '',
  bloodGroupId: '',
  avatarAttachmentId: null,
  linkedinUrl: '',
  whatsappNumber: '',
  websiteUrl: '',
  privacyEmail: false,
  privacyPhone: false,
  privacyWhatsapp: false,
  privacyLocation: true,
  privacyCompany: true,
}

export default function Profile() {
  const { user, refresh } = useAuth()
  const isAlumni = user?.roleId === ROLE.Alumni
  const [form, setForm] = useState<FormState>(emptyForm)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>()
  const [bloodGroups, setBloodGroups] = useState<BloodGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    configApi.bloodGroups().then((bg) => setBloodGroups(bg ?? []))
    const load = isAlumni ? alumniApi.getMe() : api.get('/api/students/me')
    load
      .then((data: any) => {
        setForm((f) => ({
          ...f,
          fullName: data.fullName ?? '',
          phone: data.phone ?? '',
          bio: data.bio ?? '',
          currentDesignation: data.currentDesignation ?? '',
          currentCompanyName: data.currentCompanyName ?? '',
          currentLocation: data.currentLocation ?? '',
          bloodGroupId: data.bloodGroupId ? String(data.bloodGroupId) : '',
          avatarAttachmentId: data.avatarAttachmentId ?? null,
          linkedinUrl: data.linkedinUrl ?? '',
          whatsappNumber: data.whatsappNumber ?? '',
          websiteUrl: data.websiteUrl ?? '',
          privacyEmail: data.privacyEmail ?? false,
          privacyPhone: data.privacyPhone ?? false,
          privacyWhatsapp: data.privacyWhatsapp ?? false,
          privacyLocation: data.privacyLocation ?? true,
          privacyCompany: data.privacyCompany ?? true,
        }))
        setAvatarUrl(data.avatarUrl)
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAlumni])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaved(false)
    setError('')
    setSaving(true)
    try {
      if (isAlumni) {
        await alumniApi.updateMe({
          ...form,
          bloodGroupId: form.bloodGroupId ? Number(form.bloodGroupId) : null,
        })
      } else {
        await api.put('/api/students/me', {
          fullName: form.fullName,
          phone: form.phone,
          currentLocation: form.currentLocation,
          bloodGroupId: form.bloodGroupId ? Number(form.bloodGroupId) : null,
          avatarAttachmentId: form.avatarAttachmentId,
        })
      }
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  if (loading) return <Loading />

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">My Profile</h1>
      <p className="text-sm text-slate-500 mb-6">Email can't be changed. Everything else here is yours to update.</p>
      <Card>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="pb-5 border-b border-slate-100">
            <AvatarUploader
              avatarUrl={avatarUrl}
              onUploaded={(attachmentId, url) => {
                setForm((f) => ({ ...f, avatarAttachmentId: attachmentId }))
                setAvatarUrl(url)
              }}
            />
          </div>

          <Input placeholder="Full name" required value={form.fullName} onChange={set('fullName')} />
          <PhoneInput required value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />

          {isAlumni && (
            <>
              <div>
                <label className="text-sm font-medium block mb-1">Bio</label>
                <textarea className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={3} value={form.bio} onChange={set('bio')} />
              </div>
              <Input placeholder="Current designation" value={form.currentDesignation} onChange={set('currentDesignation')} />
              <Input placeholder="Current organization" value={form.currentCompanyName} onChange={set('currentCompanyName')} />
              <Input placeholder="LinkedIn URL" value={form.linkedinUrl} onChange={set('linkedinUrl')} />
              <PhoneInput placeholder="WhatsApp number" value={form.whatsappNumber} onChange={(v) => setForm((f) => ({ ...f, whatsappNumber: v }))} />
              <Input placeholder="Website" value={form.websiteUrl} onChange={set('websiteUrl')} />
            </>
          )}

          <Input placeholder="Current location" value={form.currentLocation} onChange={set('currentLocation')} />

          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.bloodGroupId} onChange={set('bloodGroupId')}>
            <option value="">Select blood group</option>
            {bloodGroups.map((bg) => (
              <option key={bg.id} value={bg.id}>
                {bg.name}
              </option>
            ))}
          </select>

          {isAlumni && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Privacy — show to other members</p>
              <div className="space-y-2 text-sm">
                {(
                  [
                    ['privacyEmail', 'Email'],
                    ['privacyPhone', 'Phone'],
                    ['privacyWhatsapp', 'WhatsApp'],
                    ['privacyLocation', 'Location'],
                    ['privacyCompany', 'Company'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input type="checkbox" checked={form[key]} onChange={set(key)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">Profile updated.</p>}
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
