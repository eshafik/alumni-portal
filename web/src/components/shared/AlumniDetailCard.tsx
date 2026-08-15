import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { api } from '../../api/client'
import { Avatar, Card, Loading } from './ui'

function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {value}
      <button
        onClick={copy}
        className="text-slate-400 hover:text-brand p-0.5 rounded"
        aria-label={`Copy ${value}`}
        title={copied ? 'Copied!' : 'Copy'}
        type="button"
      >
        {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
      </button>
    </span>
  )
}

interface ProfileDetail {
  fullName: string
  avatarUrl?: string
  bio: string
  batchLabel: string
  programName: string
  departmentName: string
  currentDesignation: string
  companyName?: string
  bloodGroupName?: string
  linkedinUrl: string
  websiteUrl: string
  email?: string
  phone?: string
  whatsapp?: string
  currentLocation?: string
}

export function AlumniDetailCard({ userId }: { userId: number | string }) {
  const [profile, setProfile] = useState<ProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api
      .get<ProfileDetail>(`/api/alumni/${userId}`)
      .then(setProfile)
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <Card className="py-12">
        <Loading />
      </Card>
    )
  }
  if (!profile) return <Card className="text-center py-12 text-slate-500">Profile not found.</Card>

  return (
    <Card>
      <div className="flex items-center gap-4">
        <Avatar name={profile.fullName} url={profile.avatarUrl} size="lg" />
        <div>
          <h1 className="text-xl font-semibold">{profile.fullName}</h1>
          <p className="text-slate-500 text-sm">
            {profile.currentDesignation && `${profile.currentDesignation}${profile.companyName ? ` at ${profile.companyName}` : ''} · `}
            {profile.departmentName} · {profile.batchLabel}
          </p>
        </div>
      </div>
      {profile.bio && <p className="mt-4 text-slate-700">{profile.bio}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {profile.currentLocation && (
          <div>
            <dt className="text-slate-400">Location</dt>
            <dd>{profile.currentLocation}</dd>
          </div>
        )}
        {profile.bloodGroupName && (
          <div>
            <dt className="text-slate-400">Blood Group</dt>
            <dd>{profile.bloodGroupName}</dd>
          </div>
        )}
        {profile.email && (
          <div>
            <dt className="text-slate-400">Email</dt>
            <dd>
              <CopyableValue value={profile.email} />
            </dd>
          </div>
        )}
        {profile.phone && (
          <div>
            <dt className="text-slate-400">Phone</dt>
            <dd>
              <CopyableValue value={profile.phone} />
            </dd>
          </div>
        )}
        {profile.whatsapp && (
          <div>
            <dt className="text-slate-400">WhatsApp</dt>
            <dd>
              <CopyableValue value={profile.whatsapp} />
            </dd>
          </div>
        )}
        {profile.linkedinUrl && (
          <div>
            <dt className="text-slate-400">LinkedIn</dt>
            <dd>
              <a href={profile.linkedinUrl} target="_blank" rel="noreferrer" className="text-brand">
                View profile
              </a>
            </dd>
          </div>
        )}
        {profile.websiteUrl && (
          <div>
            <dt className="text-slate-400">Website</dt>
            <dd>
              <a href={profile.websiteUrl} target="_blank" rel="noreferrer" className="text-brand">
                {profile.websiteUrl}
              </a>
            </dd>
          </div>
        )}
      </dl>
    </Card>
  )
}
