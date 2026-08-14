import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api/client'
import { Card, Loading } from '../../components/shared/ui'

interface ProfileDetail {
  fullName: string
  bio: string
  batchLabel: string
  programName: string
  departmentName: string
  currentDesignation: string
  linkedinUrl: string
  websiteUrl: string
  email?: string
  phone?: string
  whatsapp?: string
  currentLocation?: string
}

export default function AlumniProfile() {
  const { id } = useParams()
  const [profile, setProfile] = useState<ProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<ProfileDetail>(`/api/alumni/${id}`)
      .then(setProfile)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Loading />
  if (!profile) return <p className="text-center py-12 text-slate-500">Profile not found.</p>

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-slate-200 shrink-0" />
          <div>
            <h1 className="text-xl font-semibold">{profile.fullName}</h1>
            <p className="text-slate-500 text-sm">
              {profile.currentDesignation && `${profile.currentDesignation} · `}
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
          {profile.email && (
            <div>
              <dt className="text-slate-400">Email</dt>
              <dd>{profile.email}</dd>
            </div>
          )}
          {profile.phone && (
            <div>
              <dt className="text-slate-400">Phone</dt>
              <dd>{profile.phone}</dd>
            </div>
          )}
          {profile.whatsapp && (
            <div>
              <dt className="text-slate-400">WhatsApp</dt>
              <dd>{profile.whatsapp}</dd>
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
        </dl>
      </Card>
    </div>
  )
}
