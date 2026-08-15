import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pin, ImageIcon, Search, Loader2 } from 'lucide-react'
import { noticesApi } from '../../api/content'
import type { Notice } from '../../types/api'
import { Card, Input, Loading, EmptyState, Pagination, Badge } from '../../components/shared/ui'
import { useDebounce } from '../../hooks/useDebounce'
import { formatDate } from '../../lib/utils'

export default function NoticesList() {
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [page, setPage] = useState(1)
  const [notices, setNotices] = useState<Notice[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    noticesApi
      .list(page, debouncedQ)
      .then((res) => {
        setNotices(res.items ?? [])
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }, [page, debouncedQ])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Notices</h1>
      <div className="relative max-w-xs mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search notices..."
          className="pl-9"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
      </div>
      {loading && notices.length === 0 ? (
        <Loading />
      ) : notices.length === 0 ? (
        <EmptyState title="No notices found" />
      ) : (
        <div className={`space-y-3 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          {notices.map((n) => (
            <Link key={n.id} to={`/notices/${n.id}`}>
              <Card className="p-0 overflow-hidden hover:shadow-md hover:border-brand/30 transition-all">
                <div className="flex gap-4 p-4">
                  {n.imageUrl ? (
                    <img src={n.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0 bg-slate-100" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                      <ImageIcon size={18} className="text-slate-300" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {n.pinned && <Pin size={13} className="text-brand shrink-0" />}
                        <p className="font-medium truncate">{n.title}</p>
                      </div>
                      {n.importance !== 'normal' && <Badge tone={n.importance as 'important' | 'urgent'}>{n.importance}</Badge>}
                    </div>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{n.body}</p>
                    <p className="text-xs text-slate-400 mt-2">{formatDate(n.publishedAt)}</p>
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
