import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, MapPin, Clock, Wallet, Search, Loader2 } from 'lucide-react'
import { jobsApi } from '../../api/content'
import type { JobPost } from '../../types/api'
import { ROLE } from '../../types/api'
import { Button, Card, Input, Loading, EmptyState, Pagination } from '../../components/shared/ui'
import { useAuth } from '../../hooks/useAuth'
import { useDebounce } from '../../hooks/useDebounce'

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diffMs / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} mo ago`
  return `${Math.floor(months / 12)} yr ago`
}

export default function JobsList() {
  const { user } = useAuth()
  const canPost = user && [ROLE.Alumni, ROLE.Admin, ROLE.SuperAdmin].includes(user.roleId as any)
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [page, setPage] = useState(1)
  const [jobs, setJobs] = useState<JobPost[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    jobsApi
      .list(page, debouncedQ)
      .then((res) => {
        setJobs(res.items ?? [])
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }, [page, debouncedQ])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Job Opportunities</h1>
        {canPost && (
          <Link to="/jobs/new">
            <Button>Post a Job</Button>
          </Link>
        )}
      </div>

      <div className="relative max-w-xs mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search jobs, company, location..."
          className="pl-9"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
      </div>

      {loading && jobs.length === 0 ? (
        <Loading />
      ) : jobs.length === 0 ? (
        <EmptyState title="No job postings found" />
      ) : (
        <div className={`space-y-3 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          {jobs.map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`}>
              <Card className="hover:shadow-md hover:border-brand/30 transition-all p-0 overflow-hidden">
                <div className="flex gap-4 p-4">
                  {j.imageUrl ? (
                    <img src={j.imageUrl} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0 bg-slate-100" />
                  ) : (
                    <div className="w-20 h-20 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                      <Briefcase size={22} className="text-slate-300" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-900 truncate">{j.title}</p>
                      <span className="text-xs text-slate-400 shrink-0">{timeAgo(j.createdAt)}</span>
                    </div>
                    {j.companyName && <p className="text-sm text-slate-600 mt-0.5">{j.companyName}</p>}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                      {j.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} /> {j.location}
                        </span>
                      )}
                      {j.employmentType && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> {j.employmentType}
                        </span>
                      )}
                      {j.salary && (
                        <span className="flex items-center gap-1">
                          <Wallet size={12} /> {j.salary}
                        </span>
                      )}
                    </div>
                    {j.postedByName && (
                      <div className="mt-2 flex items-center gap-1.5">
                        {j.postedByAvatarUrl ? (
                          <img src={j.postedByAvatarUrl} alt={j.postedByName} className="w-5 h-5 rounded-full object-cover shrink-0" />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-slate-200 shrink-0" />
                        )}
                        <span className="text-xs text-slate-400">Posted by {j.postedByName}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} pageSize={20} onChange={setPage} />
    </div>
  )
}
