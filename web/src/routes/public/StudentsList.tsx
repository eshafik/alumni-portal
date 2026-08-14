import { Loader2 } from 'lucide-react'
import { api } from '../../api/client'
import type { PagedResult, StudentDirectoryRow } from '../../types/api'
import { Card, Avatar, EmptyState, CardGridSkeleton } from '../../components/shared/ui'
import { useInfiniteList } from '../../hooks/useInfiniteList'

export default function StudentsList() {
  const { items: rows, total, loading, loadingMore, hasMore, sentinelRef } = useInfiniteList<StudentDirectoryRow>(
    (page) => api.get<PagedResult<StudentDirectoryRow>>(`/api/students?page=${page}`),
    [],
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Current Students</h1>
        <p className="text-sm text-slate-500 mt-1">
          {loading ? 'Loading...' : `${total.toLocaleString()} currently enrolled — view-only directory.`}
        </p>
      </div>

      {loading ? (
        <CardGridSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState title="No students found" />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((r) => (
              <Card key={r.userId}>
                <div className="flex items-center gap-3">
                  <Avatar name={r.fullName} url={r.avatarUrl} />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{r.fullName}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {r.departmentName} · {r.batchLabel}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

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
            <p className="text-center text-xs text-slate-400 py-8">You've reached the end — {total} students total.</p>
          )}
        </>
      )}
    </div>
  )
}
