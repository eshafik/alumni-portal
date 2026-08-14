import { useEffect, useState } from 'react'
import { UserCheck, UserX, Mail, Phone } from 'lucide-react'
import { adminApi, type PendingRegistration } from '../../api/admin'
import { ApiError } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { ROLE } from '../../types/api'
import { Button, Card, Loading, EmptyState, Badge } from '../../components/shared/ui'

type Tab = 'pending' | 'rejected'

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('')
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const isFullAdmin = user?.roleId === ROLE.SuperAdmin || user?.roleId === ROLE.Admin
  const [tab, setTab] = useState<Tab>('pending')
  const [pending, setPending] = useState<PendingRegistration[]>([])
  const [rejected, setRejected] = useState<PendingRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [reason, setReason] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([adminApi.pendingRegistrations(), adminApi.rejectedRegistrations()])
      .then(([p, rj]) => {
        setPending(p.items ?? [])
        setRejected(rj.items ?? [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const approve = async (userId: number) => {
    setError('')
    try {
      await adminApi.approve(userId)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Approve failed')
    }
  }

  const reject = async (userId: number) => {
    setError('')
    try {
      await adminApi.reject(userId, reason)
      setRejectingId(null)
      setReason('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reject failed')
    }
  }

  const list = tab === 'pending' ? pending : rejected
  const unverifiedCount = pending.filter((p) => p.status === 'pending_verification').length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isFullAdmin ? 'Full administrative access.' : 'Moderator access — showing registrations in your scope.'}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Pending review" value={pending.length} />
        <StatCard label="Awaiting verification" value={unverifiedCount} />
        <StatCard label="Rejected" value={rejected.length} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex gap-1 px-2 pt-2 border-b border-slate-100">
          <TabButton active={tab === 'pending'} onClick={() => setTab('pending')} label="Pending" count={pending.length} />
          <TabButton active={tab === 'rejected'} onClick={() => setTab('rejected')} label="Rejected" count={rejected.length} />
        </div>

        <div className="p-4">
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          {loading ? (
            <Loading />
          ) : list.length === 0 ? (
            <EmptyState
              title={tab === 'pending' ? 'No pending registrations' : 'No rejected registrations'}
              description={tab === 'pending' ? "You're all caught up." : undefined}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((p) => (
                <li key={p.userId} className="py-4 first:pt-1 last:pb-1">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials(p.fullName)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-slate-800">{p.fullName}</p>
                          {p.status === 'pending_verification' && <Badge tone="urgent">Unverified</Badge>}
                          {p.status === 'rejected' && <Badge>Rejected</Badge>}
                          <span className="text-xs text-slate-400">{p.roleId === 5 ? 'Student' : 'Alumni'}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <Mail size={13} className="text-slate-400" /> {p.email}
                          </span>
                          {p.phone && (
                            <span className="flex items-center gap-1.5">
                              <Phone size={13} className="text-slate-400" /> {p.phone}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {p.departmentName} · {p.batchLabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button onClick={() => approve(p.userId)}>
                        <UserCheck size={15} className="mr-1.5" /> Approve
                      </Button>
                      {tab === 'pending' && (
                        <Button variant="danger" onClick={() => setRejectingId(p.userId)}>
                          <UserX size={15} className="mr-1.5" /> Reject
                        </Button>
                      )}
                    </div>
                  </div>
                  {rejectingId === p.userId && (
                    <div className="mt-3 ml-[52px] flex gap-2">
                      <input
                        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                        placeholder="Reason (optional)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        autoFocus
                      />
                      <Button variant="danger" onClick={() => reject(p.userId)}>
                        Confirm reject
                      </Button>
                      <Button variant="ghost" onClick={() => setRejectingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="text-center py-5">
      <p className="text-3xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </Card>
  )
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {label} <span className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${active ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
    </button>
  )
}
