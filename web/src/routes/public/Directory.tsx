import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Loader2 } from 'lucide-react'
import { alumniApi, configApi } from '../../api/directory'
import type { Department, Batch } from '../../types/api'
import { Card, Input, Select, Avatar, EmptyState, CardGridSkeleton } from '../../components/shared/ui'
import { useDebounce } from '../../hooks/useDebounce'
import { useInfiniteList } from '../../hooks/useInfiniteList'

export default function Directory() {
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [departmentId, setDepartmentId] = useState('')
  const [batchId, setBatchId] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [batches, setBatches] = useState<Batch[]>([])

  useEffect(() => {
    configApi.departments().then((d) => setDepartments(d ?? []))
    configApi.batches().then((b) => setBatches(b ?? []))
  }, [])

  const { items: rows, total, loading, loadingMore, hasMore, sentinelRef } = useInfiniteList(
    (page) => alumniApi.list({ q: debouncedQ, departmentId, batchId, page }),
    [debouncedQ, departmentId, batchId],
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Alumni Directory</h1>
        <p className="text-sm text-slate-500 mt-1">
          {loading ? 'Searching...' : `${total.toLocaleString()} alumni`}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search by name, company, skill..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-auto min-w-[160px]">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="w-auto min-w-[160px]">
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label || `${b.startYear}-${b.endYear}`}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <CardGridSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState title="No alumni found" description="Try adjusting your search or filters." />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((r) => (
              <Link key={r.userId} to={`/directory/${r.userId}`}>
                <Card className="hover:shadow-md hover:border-slate-300 transition-all">
                  <div className="flex items-center gap-3">
                    <Avatar name={r.fullName} url={r.avatarUrl} />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{r.fullName}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {r.currentDesignation}
                        {r.companyName ? ` at ${r.companyName}` : ''}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {r.departmentName} · {r.batchLabel}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Infinite scroll sentinel — fetches the next page ~400px before it reaches the viewport */}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-8">
              {loadingMore && (
                <span className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 size={16} className="animate-spin" /> Loading more...
                </span>
              )}
            </div>
          )}
          {!hasMore && rows.length > 0 && (
            <p className="text-center text-xs text-slate-400 py-8">You've reached the end — {total} alumni total.</p>
          )}
        </>
      )}
    </div>
  )
}
