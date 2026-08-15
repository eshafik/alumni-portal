import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { adminApi, auditApi, type AuditLogEntry } from '../../api/admin'
import { ROLE } from '../../types/api'
import type { User } from '../../types/api'
import { Card, Select, Loading, EmptyState, Pagination } from '../../components/shared/ui'
import { formatDateTime } from '../../lib/utils'

function formatAction(action: string) {
  return action.replace(/[._]/g, ' ')
}

function prettyJSON(raw: string) {
  if (!raw || raw === '{}') return null
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export default function AdminAuditLog() {
  const [admins, setAdmins] = useState<User[]>([])
  const [userId, setUserId] = useState('')
  const [page, setPage] = useState(1)
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    // Only Admin/SuperAdmin/Moderator accounts ever perform logged actions, so the filter
    // dropdown only needs to offer those roles.
    Promise.all([
      adminApi.listUsers(1, '', '', String(ROLE.SuperAdmin)),
      adminApi.listUsers(1, '', '', String(ROLE.Admin)),
      adminApi.listUsers(1, '', '', String(ROLE.Moderator)),
    ]).then(([sa, a, m]) => {
      setAdmins([...(sa.items ?? []), ...(a.items ?? []), ...(m.items ?? [])])
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    auditApi
      .list(page, userId)
      .then((res) => {
        setLogs(res.items ?? [])
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }, [page, userId])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Activity Log</h1>
        <p className="text-sm text-slate-500 mt-1">
          Admin actions — institution settings, dropdown management, notices, events, committee, and user approvals/role/status changes.
        </p>
      </div>

      <Select
        value={userId}
        onChange={(e) => {
          setUserId(e.target.value)
          setPage(1)
        }}
        className="w-auto min-w-[220px] mb-4"
      >
        <option value="">All admins/moderators</option>
        {admins.map((a) => (
          <option key={a.id} value={a.id}>
            {a.fullName}
          </option>
        ))}
      </Select>

      {loading ? (
        <Loading />
      ) : logs.length === 0 ? (
        <EmptyState title="No activity recorded" />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const before = prettyJSON(log.beforeJson)
            const after = prettyJSON(log.afterJson)
            const expanded = expandedId === log.id
            const hasDetail = before || after
            return (
              <Card key={log.id} className="p-3">
                <button
                  className="w-full flex items-center justify-between gap-3 text-left"
                  onClick={() => hasDetail && setExpandedId(expanded ? null : log.id)}
                >
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium text-slate-900">{log.actorName || 'System'}</span>{' '}
                      <span className="text-slate-500 capitalize">{formatAction(log.action)}</span>{' '}
                      {log.entityType && <span className="text-slate-400">({log.entityType}{log.entityId ? ` #${log.entityId}` : ''})</span>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(log.createdAt)}</p>
                  </div>
                  {hasDetail && <span className="text-slate-400 shrink-0">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>}
                </button>
                {expanded && hasDetail && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid sm:grid-cols-2 gap-3 text-xs">
                    {before && (
                      <div>
                        <p className="text-slate-400 mb-1">Before</p>
                        <pre className="bg-slate-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">{before}</pre>
                      </div>
                    )}
                    {after && (
                      <div>
                        <p className="text-slate-400 mb-1">After</p>
                        <pre className="bg-slate-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">{after}</pre>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
      <Pagination page={page} total={total} pageSize={20} onChange={setPage} />
    </div>
  )
}
