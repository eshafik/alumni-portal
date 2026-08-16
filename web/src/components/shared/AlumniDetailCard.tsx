import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { api } from '../../api/client'
import { Avatar, Badge, Card, Loading } from './ui'
import { normalizeExternalUrl, waLink } from '../../lib/utils'

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
  skillNames?: string
  passingYear?: number
  studentId?: string
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
            {[
              profile.currentDesignation && profile.companyName
                ? `${profile.currentDesignation} at ${profile.companyName}`
                : profile.currentDesignation || profile.companyName,
              profile.departmentName,
              profile.batchLabel,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>
      {profile.bio && <p className="mt-4 text-slate-700">{profile.bio}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {profile.programName && (
          <div>
            <dt className="text-slate-400">Program</dt>
            <dd>{profile.programName}</dd>
          </div>
        )}
        {profile.currentLocation && (
          <div>
            <dt className="text-slate-400">Location</dt>
            <dd>{profile.currentLocation}</dd>
          </div>
        )}
        {profile.passingYear && (
          <div>
            <dt className="text-slate-400">Passing Year</dt>
            <dd>{profile.passingYear}</dd>
          </div>
        )}
        {profile.studentId && (
          <div>
            <dt className="text-slate-400">Student ID</dt>
            <dd>{profile.studentId}</dd>
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
              <a href={waLink(profile.whatsapp)} target="_blank" rel="noreferrer" className="text-brand">
                {profile.whatsapp}
              </a>
            </dd>
          </div>
        )}
        {profile.linkedinUrl && (
          <div>
            <dt className="text-slate-400">LinkedIn</dt>
            <dd>
              <a href={normalizeExternalUrl(profile.linkedinUrl)} target="_blank" rel="noreferrer" className="text-brand">
                View profile
              </a>
            </dd>
          </div>
        )}
        {profile.websiteUrl && (
          <div>
            <dt className="text-slate-400">Website</dt>
            <dd>
              <a href={normalizeExternalUrl(profile.websiteUrl)} target="_blank" rel="noreferrer" className="text-brand">
                {profile.websiteUrl}
              </a>
            </dd>
          </div>
        )}
      </dl>
      {profile.skillNames && (
        <div className="mt-4">
          <p className="text-xs text-slate-400 mb-1.5">Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.skillNames.split(',').map((skill) => (
              <Badge key={skill}>{skill}</Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
