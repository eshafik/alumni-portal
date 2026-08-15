import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { businessesApi } from '../../api/content'
import type { Business } from '../../types/api'
import { ROLE } from '../../types/api'
import { Avatar, Button, Card, Input, Loading, EmptyState, Pagination } from '../../components/shared/ui'
import { useDebounce } from '../../hooks/useDebounce'
import { useAuth } from '../../hooks/useAuth'

export default function BusinessesList() {
  const { user } = useAuth()
  const canPost = user && [ROLE.Alumni, ROLE.Admin, ROLE.SuperAdmin].includes(user.roleId as any)
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [page, setPage] = useState(1)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    businessesApi
      .list(debouncedQ, page)
      .then((res) => {
        setBusinesses(res.items ?? [])
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }, [debouncedQ, page])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">Alumni Business Directory</h1>
        {canPost && (
          <Link to="/businesses/new">
            <Button>Add Your Business</Button>
          </Link>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-6">Discover and support businesses built by fellow alumni.</p>
      <Input placeholder="Search businesses..." className="max-w-xs mb-6" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
      {loading ? (
        <Loading />
      ) : businesses.length === 0 ? (
        <EmptyState title="No businesses listed yet" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {businesses.map((b) => (
            <Link key={b.id} to={`/businesses/${b.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <p className="font-medium">{b.name}</p>
                <p className="text-xs text-slate-400">{b.category}</p>
                <p className="text-sm text-slate-600 mt-2 line-clamp-2">{b.description}</p>
                {b.ownerName && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                    <Avatar name={b.ownerName} url={b.ownerAvatarUrl} size="sm" />
                    <span className="text-xs text-slate-500">By {b.ownerName}</span>
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} pageSize={20} onChange={setPage} />
    </div>
  )
}
