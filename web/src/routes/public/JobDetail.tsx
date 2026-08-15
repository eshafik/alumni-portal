import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { jobsApi } from '../../api/content'
import { ApiError } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { useConfirm } from '../../hooks/useConfirm'
import { ROLE } from '../../types/api'
import type { JobPost } from '../../types/api'
import { Avatar, Button, Card, Loading } from '../../components/shared/ui'
import { formatDateTime, normalizeExternalUrl } from '../../lib/utils'

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const confirm = useConfirm()
  const [job, setJob] = useState<JobPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    jobsApi
      .get(Number(id))
      .then(setJob)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Loading />
  if (!job) return <p className="text-center py-12 text-slate-500">Job not found.</p>

  const canManage = !!user && (user.id === job.postedByUserId || user.roleId === ROLE.Admin || user.roleId === ROLE.SuperAdmin)

  const remove = async () => {
    const ok = await confirm({ description: `Delete "${job.title}"? This can't be undone.`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    setError('')
    try {
      await jobsApi.delete(job.id)
      navigate('/jobs')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this job')
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          {canManage && (
            <div className="flex items-center gap-1 shrink-0">
              <Link to={`/jobs/${job.id}/edit`} className="p-2 rounded-md text-slate-400 hover:text-brand hover:bg-blue-50" aria-label="Edit">
                <Pencil size={16} />
              </Link>
              <button onClick={remove} className="p-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>
        {job.imageUrl && (
          <img src={job.imageUrl} alt="" className="w-full rounded-md mb-4 mt-3 object-cover max-h-64" />
        )}
        <p className="text-slate-500 mt-1">
          {job.companyName} {job.location && `· ${job.location}`}
        </p>
        {job.postedByName && (
          <Link to={`/directory/${job.postedByUserId}`} className="inline-flex items-center gap-2 mt-3 group">
            <Avatar name={job.postedByName} url={job.postedByAvatarUrl} size="sm" />
            <span className="text-sm text-slate-600 group-hover:text-brand">Posted by {job.postedByName}</span>
          </Link>
        )}
        {job.employmentType && <p className="text-sm text-slate-500">{job.employmentType}</p>}
        {job.salary && <p className="text-sm text-slate-500">Salary: {job.salary}</p>}
        {job.description && <p className="mt-4 text-slate-700 whitespace-pre-wrap">{job.description}</p>}
        <p className="mt-3 text-xs text-slate-400">Posted {formatDateTime(job.createdAt)}</p>
        {job.deadline && <p className="mt-4 text-sm text-slate-400">Apply by {new Date(job.deadline).toLocaleDateString()}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-6">
          {job.applyUrl ? (
            <a href={normalizeExternalUrl(job.applyUrl)} target="_blank" rel="noreferrer">
              <Button>Apply now</Button>
            </a>
          ) : job.applyEmail ? (
            <a href={`mailto:${job.applyEmail}`}>
              <Button>Apply via email</Button>
            </a>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
