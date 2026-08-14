import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { jobsApi } from '../../api/content'
import type { JobPost } from '../../types/api'
import { Avatar, Button, Card, Loading } from '../../components/shared/ui'

export default function JobDetail() {
  const { id } = useParams()
  const [job, setJob] = useState<JobPost | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    jobsApi
      .get(Number(id))
      .then(setJob)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Loading />
  if (!job) return <p className="text-center py-12 text-slate-500">Job not found.</p>

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        {job.imageUrl && (
          <img src={job.imageUrl} alt="" className="w-full rounded-md mb-4 object-cover max-h-64" />
        )}
        <h1 className="text-2xl font-semibold">{job.title}</h1>
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
        {job.deadline && <p className="mt-4 text-sm text-slate-400">Apply by {new Date(job.deadline).toLocaleDateString()}</p>}
        <div className="mt-6">
          {job.applyUrl ? (
            <a href={job.applyUrl} target="_blank" rel="noreferrer">
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
