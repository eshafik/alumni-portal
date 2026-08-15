import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useInstitution } from '../../hooks/useInstitution'
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
}

// First-run gate for newly-approved alumni/students: a profile picture is required before the
// rest of the portal is reachable (enforced by the redirect logic in components/layout/Shell,
// not here — this page just fulfills that requirement). Other fields are offered but not
// blocking, matching how the regular Profile edit screen treats them.
export default function CompleteProfile() {
  const { user, refresh } = useAuth()
  const { institution } = useInstitution()
  const isAlumni = user?.roleId === ROLE.Alumni
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>()
  const [bloodGroups, setBloodGroups] = useState<BloodGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
        }))
        setAvatarUrl(data.avatarUrl)
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAlumni])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.avatarAttachmentId) {
      setError('Please add a profile picture before continuing.')
      return
    }
    setError('')
    setSaving(true)
    try {
      if (isAlumni) {
        await alumniApi.updateMe({
          fullName: form.fullName,
          phone: form.phone,
          bio: form.bio,
          currentDesignation: form.currentDesignation,
          currentCompanyName: form.currentCompanyName,
          currentLocation: form.currentLocation,
          bloodGroupId: form.bloodGroupId ? Number(form.bloodGroupId) : null,
          avatarAttachmentId: form.avatarAttachmentId,
          linkedinUrl: form.linkedinUrl,
          whatsappNumber: form.whatsappNumber,
          websiteUrl: form.websiteUrl,
          // Everything visible by default at first-time setup — no privacy toggles are shown
          // here, so nothing should default to hidden. Revisit anytime from the Profile page's
          // Security section.
          privacyEmail: true,
          privacyPhone: true,
          privacyWhatsapp: true,
          privacyLocation: true,
          privacyCompany: true,
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
      navigate('/directory')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  if (loading) return <Loading />

  return (
    <div className="max-w-lg mx-auto py-6">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Welcome{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}!</h1>
        <p className="text-sm text-slate-500 mt-1.5">
          Your account has been approved{institution?.shortName ? ` by ${institution.shortName}` : ''}. Add a profile picture to
          finish setting up your account and join the directory.
        </p>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="space-y-5">
          <fieldset disabled={saving} className="space-y-5">
          <div className="pb-5 border-b border-slate-100">
            <AvatarUploader
              avatarUrl={avatarUrl}
              onUploaded={(attachmentId, url) => {
                setForm((f) => ({ ...f, avatarAttachmentId: attachmentId }))
                setAvatarUrl(url)
                setError('')
              }}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-3">A few more details (optional, but helps classmates find you)</p>
            <div className="space-y-4">
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
                <>
                  <Input placeholder="LinkedIn URL" value={form.linkedinUrl} onChange={set('linkedinUrl')} />
                  <Input placeholder="Website" value={form.websiteUrl} onChange={set('websiteUrl')} />
                </>
              )}
            </div>
          </div>
          </fieldset>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full" disabled={saving}>
            <span className="inline-flex items-center gap-1.5">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {saving ? 'Saving...' : 'Save & continue to directory'}
            </span>
          </Button>
          <p className="text-xs text-center text-slate-400">You can update any of this later from your profile.</p>
        </form>
      </Card>
    </div>
  )
}
