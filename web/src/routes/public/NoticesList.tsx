import { useEffect, useState } from 'react'
import { noticesApi } from '../../api/content'
import type { Notice } from '../../types/api'
import { Card, Loading, EmptyState, Pagination, Badge } from '../../components/shared/ui'

export default function NoticesList() {
  const [page, setPage] = useState(1)
  const [notices, setNotices] = useState<Notice[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    noticesApi
      .list(page)
      .then((res) => {
        setNotices(res.items ?? [])
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }, [page])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Notices</h1>
      {loading ? (
        <Loading />
      ) : notices.length === 0 ? (
        <EmptyState title="No notices yet" />
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <Card key={n.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{n.body}</p>
                  <p className="text-xs text-slate-400 mt-2">{new Date(n.publishedAt).toLocaleDateString()}</p>
                </div>
                {n.importance !== 'normal' && <Badge tone={n.importance as 'important' | 'urgent'}>{n.importance}</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} pageSize={20} onChange={setPage} />
    </div>
  )
}
