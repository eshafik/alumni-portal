import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { api, ApiError } from '../../api/client'
import { authApi } from '../../api/auth'
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
  privacyEmail: true,
  privacyPhone: true,
  privacyWhatsapp: true,
  privacyLocation: true,
  privacyCompany: true,
}

export default function Profile() {
  const { user, refresh, logout } = useAuth()
  // Row existence, not current roleId, decides which endpoint owns this account's profile — a
  // promoted Admin/Moderator keeps their original alumni_profiles row and must keep
  // editing/searching through it (see AuthHandler.Me). Alumni takes precedence over student
  // when both rows exist (post-conversion accounts keep the old student_profiles row too).
  const isAlumni = user?.hasAlumniProfile ?? user?.roleId === ROLE.Alumni
  const isStudent = !isAlumni && (user?.hasStudentProfile ?? user?.roleId === ROLE.Student)
  // Roles with neither row (never-alumni, never-student Admin/SuperAdmin/Moderator) only ever
  // edit fullName/phone/etc on the users table itself (see AuthHandler.UpdateMe).
  const hasProfileRow = isAlumni || isStudent
  const [form, setForm] = useState<FormState>(emptyForm)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>()
  const [bloodGroups, setBloodGroups] = useState<BloodGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    configApi.bloodGroups().then((bg) => setBloodGroups(bg ?? []))
    if (!hasProfileRow) {
      // Admin/SuperAdmin/Moderator: no alumni_profiles/student_profiles row, but they do have
      // avatar/bio/location/blood group on the users table now (see AuthHandler.UpdateMe) — the
      // session's own user object already carries all of it, no extra fetch needed.
      setForm((f) => ({
        ...f,
        fullName: user?.fullName ?? '',
        phone: user?.phone ?? '',
        bio: user?.bio ?? '',
        currentLocation: user?.currentLocation ?? '',
        bloodGroupId: user?.bloodGroupId ? String(user.bloodGroupId) : '',
        avatarAttachmentId: user?.avatarAttachmentId ?? null,
        currentDesignation: user?.currentDesignation ?? '',
        privacyEmail: user?.privacyEmail ?? true,
        privacyPhone: user?.privacyPhone ?? true,
        privacyLocation: user?.privacyLocation ?? true,
        currentCompanyName: user?.currentCompanyName ?? '',
        linkedinUrl: user?.linkedinUrl ?? '',
        whatsappNumber: user?.whatsappNumber ?? '',
        websiteUrl: user?.websiteUrl ?? '',
        privacyWhatsapp: user?.privacyWhatsapp ?? true,
        privacyCompany: user?.privacyCompany ?? true,
      }))
      setAvatarUrl(user?.avatarUrl)
      setLoading(false)
      return
    }
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
          privacyEmail: data.privacyEmail ?? true,
          privacyPhone: data.privacyPhone ?? true,
          privacyWhatsapp: data.privacyWhatsapp ?? true,
          privacyLocation: data.privacyLocation ?? true,
          privacyCompany: data.privacyCompany ?? true,
        }))
        setAvatarUrl(data.avatarUrl)
      })
      .catch(() => setError('Could not load your profile — please refresh and try again.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAlumni, hasProfileRow])

  // Shared by both "Save changes" and "Save privacy settings" for Admin/SuperAdmin/Moderator —
  // those roles have one flat users-table record, unlike alumni which splits profile vs.
  // privacy across two calls to the same alumniApi.updateMe endpoint.
  const nonProfilePayload = () => ({
    fullName: form.fullName,
    phone: form.phone,
    bio: form.bio,
    currentLocation: form.currentLocation,
    bloodGroupId: form.bloodGroupId ? Number(form.bloodGroupId) : null,
    avatarAttachmentId: form.avatarAttachmentId,
    currentDesignation: form.currentDesignation,
    privacyEmail: form.privacyEmail,
    privacyPhone: form.privacyPhone,
    privacyLocation: form.privacyLocation,
    currentCompanyName: form.currentCompanyName,
    linkedinUrl: form.linkedinUrl,
    whatsappNumber: form.whatsappNumber,
    websiteUrl: form.websiteUrl,
    privacyWhatsapp: form.privacyWhatsapp,
    privacyCompany: form.privacyCompany,
  })

  const saveProfile = async () => {
    setSaved(false)
    setError('')
    setSaving(true)
    try {
      if (isAlumni) {
        await alumniApi.updateMe({
          ...form,
          bloodGroupId: form.bloodGroupId ? Number(form.bloodGroupId) : null,
        })
      } else if (isStudent) {
        await api.put('/api/students/me', {
          fullName: form.fullName,
          phone: form.phone,
          currentLocation: form.currentLocation,
          bloodGroupId: form.bloodGroupId ? Number(form.bloodGroupId) : null,
          avatarAttachmentId: form.avatarAttachmentId,
        })
      } else {
        await authApi.updateMe(nonProfilePayload())
      }
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    saveProfile()
  }

  const [privacySaving, setPrivacySaving] = useState(false)
  const [privacySaved, setPrivacySaved] = useState(false)
  const [privacyError, setPrivacyError] = useState('')

  const savePrivacy = async () => {
    setPrivacySaved(false)
    setPrivacyError('')
    setPrivacySaving(true)
    try {
      if (isAlumni) {
        await alumniApi.updateMe({
          ...form,
          bloodGroupId: form.bloodGroupId ? Number(form.bloodGroupId) : null,
        })
      } else {
        await authApi.updateMe(nonProfilePayload())
      }
      await refresh()
      setPrivacySaved(true)
    } catch (err) {
      setPrivacyError(err instanceof ApiError ? err.message : 'Could not save privacy settings')
    } finally {
      setPrivacySaving(false)
    }
  }

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordMessage('')
    setPasswordError('')
    setPasswordSaving(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setPasswordMessage('Password updated.')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Could not change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">My Profile</h1>
      <p className="text-sm text-slate-500 mb-6">Email can't be changed. Everything else here is yours to update.</p>
      <Card>
        <form onSubmit={onSubmit} className="space-y-5">
          <fieldset disabled={saving} className="space-y-5">
          <div className="pb-5 border-b border-slate-100">
            <AvatarUploader
              avatarUrl={avatarUrl}
              onUploaded={(attachmentId, url) => {
                setForm((f) => ({ ...f, avatarAttachmentId: attachmentId }))
                setAvatarUrl(url)
              }}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1 text-slate-700">Email</label>
            <Input value={user?.email ?? ''} disabled className="bg-slate-50 text-slate-500" />
          </div>

          <Input placeholder="Full name" required value={form.fullName} onChange={set('fullName')} />
          <PhoneInput required value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />

          {!isStudent && (
            <div>
              <label className="text-sm font-medium block mb-1">Bio</label>
              <textarea className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={3} value={form.bio} onChange={set('bio')} />
            </div>
          )}

          {(isAlumni || !hasProfileRow) && (
            <>
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
          </fieldset>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">Profile updated.</p>}
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 size={15} className="animate-spin mr-1.5" />}
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </Card>

      <h2 className="text-xl font-semibold mt-8 mb-2">Security</h2>
      <p className="text-sm text-slate-500 mb-6">Manage your password and who can see your contact details.</p>

      <Card>
        <p className="text-sm font-medium mb-3">Change password</p>
        <form onSubmit={onChangePassword} className="space-y-3">
          <fieldset disabled={passwordSaving} className="space-y-3">
            <Input type="password" placeholder="Current password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <Input type="password" placeholder="New password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </fieldset>
          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          {passwordMessage && <p className="text-sm text-green-600">{passwordMessage}</p>}
          <Button type="submit" variant="secondary" disabled={passwordSaving}>
            {passwordSaving && <Loader2 size={15} className="animate-spin mr-1.5" />}
            {passwordSaving ? 'Updating...' : 'Update password'}
          </Button>
        </form>
      </Card>

      {(isAlumni || !hasProfileRow) && (
        <Card className="mt-4">
          <p className="text-sm font-medium mb-1">Who can see your contact info</p>
          <p className="text-xs text-slate-400 mb-3">Visible to other approved members by default. Uncheck any field you'd rather keep private.</p>
          <fieldset disabled={privacySaving} className="space-y-2 text-sm">
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
          </fieldset>
          {privacyError && <p className="text-sm text-red-600 mt-3">{privacyError}</p>}
          {privacySaved && <p className="text-sm text-green-600 mt-3">Privacy settings saved.</p>}
          <Button variant="secondary" className="mt-3" onClick={savePrivacy} disabled={privacySaving}>
            {privacySaving && <Loader2 size={15} className="animate-spin mr-1.5" />}
            {privacySaving ? 'Saving...' : 'Save privacy settings'}
          </Button>
        </Card>
      )}

      <Button variant="secondary" className="mt-6 w-full text-red-600 hover:bg-red-50" onClick={logout}>
        <LogOut size={15} className="mr-1.5" /> Log out
      </Button>
    </div>
  )
}
