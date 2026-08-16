import { useEffect, useState } from 'react'
import { Search, ShieldBan, ShieldCheck, Pencil, X, Check } from 'lucide-react'
import { adminApi } from '../../api/admin'
import { configApi } from '../../api/directory'
import { ApiError } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { ROLE } from '../../types/api'
import type { User, Department, Batch } from '../../types/api'
import { Avatar, Button, Card, Input, Select, Badge, Loading, Pagination } from '../../components/shared/ui'
import { useDebounce } from '../../hooks/useDebounce'
import { useConfirm } from '../../hooks/useConfirm'

const ROLE_LABELS: Record<number, string> = {
  [ROLE.SuperAdmin]: 'SuperAdmin',
  [ROLE.Admin]: 'Admin',
  [ROLE.Moderator]: 'Moderator',
  [ROLE.Alumni]: 'Alumni',
  [ROLE.Student]: 'Student',
}

// SuperAdmin is hidden — never offered as a filter or an assignable role, even to a SuperAdmin
// actor. Grant/view it stays badge-only (ROLE_LABELS above), for the rare account that has it.
const SELECTABLE_ROLES = Object.entries(ROLE_LABELS).filter(([id]) => Number(id) !== ROLE.SuperAdmin)

const STATUS_TONE: Record<string, 'default' | 'important' | 'urgent'> = {
  approved: 'default',
  suspended: 'urgent',
  pending_approval: 'important',
  pending_verification: 'important',
  rejected: 'urgent',
}

export default function AdminUsers() {
  const { user: me } = useAuth()
  const confirm = useConfirm()

  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [status, setStatus] = useState('')
  const [roleId, setRoleId] = useState('')
  const [page, setPage] = useState(1)
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [departments, setDepartments] = useState<Department[]>([])
  const [batches, setBatches] = useState<Batch[]>([])

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRole, setEditRole] = useState('')
  const [editDept, setEditDept] = useState('')
  const [editBatch, setEditBatch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    configApi.departments().then((d) => setDepartments(d ?? []))
    configApi.batches().then((b) => setBatches(b ?? []))
  }, [])

  const reload = () => {
    setLoading(true)
    adminApi
      .listUsers(page, debouncedQ, status, roleId)
      .then((res) => {
        setUsers(res.items ?? [])
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }
  useEffect(reload, [page, debouncedQ, status, roleId])

  const startEdit = (u: User) => {
    setEditingId(u.id)
    setEditRole(String(u.roleId))
    setEditDept(u.moderatorScopeDepartmentId ? String(u.moderatorScopeDepartmentId) : '')
    setEditBatch(u.moderatorScopeBatchId ? String(u.moderatorScopeBatchId) : '')
    setError('')
  }

  const saveRole = async (u: User) => {
    setError('')
    setSaving(true)
    try {
      await adminApi.updateUserRole(
        u.id,
        Number(editRole),
        editDept ? Number(editDept) : null,
        editBatch ? Number(editBatch) : null,
      )
      setEditingId(null)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update role')
    } finally {
      setSaving(false)
    }
  }

  const toggleSuspend = async (u: User) => {
    const suspending = u.status !== 'suspended'
    const ok = await confirm({
      title: suspending ? 'Suspend user?' : 'Unsuspend user?',
      description: suspending
        ? `${u.fullName} will be logged out immediately and unable to log back in until unsuspended.`
        : `${u.fullName} will be able to log in again.`,
      confirmLabel: suspending ? 'Suspend' : 'Unsuspend',
      danger: suspending,
    })
    if (!ok) return
    setError('')
    try {
      await adminApi.updateUserStatus(u.id, suspending ? 'suspended' : 'approved')
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update status')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Manage Users</h1>
        <p className="text-sm text-slate-500 mt-1">Change roles, scope moderators to a department or batch, and suspend accounts.</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name or email..."
            className="pl-9"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="w-auto min-w-[160px]"
        >
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
          <option value="pending_approval">Pending approval</option>
          <option value="pending_verification">Pending verification</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Select
          value={roleId}
          onChange={(e) => {
            setRoleId(e.target.value)
            setPage(1)
          }}
          className="w-auto min-w-[140px]"
        >
          <option value="">All roles</option>
          {SELECTABLE_ROLES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-2">
          {users.length === 0 && <p className="text-sm text-slate-400">No users found.</p>}
          {users.map((u) => (
            <Card key={u.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={u.fullName} url={u.avatarUrl} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900">{u.fullName}</p>
                      <Badge>{ROLE_LABELS[u.roleId] ?? u.roleId}</Badge>
                      <Badge tone={STATUS_TONE[u.status] ?? 'default'}>{u.status.replace('_', ' ')}</Badge>
                      {u.roleId === ROLE.Moderator && (u.moderatorScopeDepartmentId || u.moderatorScopeBatchId) && (
                        <span className="text-xs text-slate-400">
                          scoped to{' '}
                          {u.moderatorScopeDepartmentId && departments.find((d) => d.id === u.moderatorScopeDepartmentId)?.name}
                          {u.moderatorScopeDepartmentId && u.moderatorScopeBatchId && ' · '}
                          {u.moderatorScopeBatchId && (batches.find((b) => b.id === u.moderatorScopeBatchId)?.label || 'batch')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">{u.email}</p>
                  </div>
                </div>
                {u.id !== me?.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(u)} className="p-1.5 rounded-md text-slate-400 hover:text-brand hover:bg-blue-50" aria-label="Edit role">
                      <Pencil size={15} />
                    </button>
                    {u.status === 'suspended' ? (
                      <button onClick={() => toggleSuspend(u)} className="p-1.5 rounded-md text-slate-400 hover:text-green-600 hover:bg-green-50" aria-label="Unsuspend" title="Unsuspend">
                        <ShieldCheck size={15} />
                      </button>
                    ) : (
                      u.status === 'approved' && (
                        <button onClick={() => toggleSuspend(u)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Suspend" title="Suspend">
                          <ShieldBan size={15} />
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>

              {editingId === u.id && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-end gap-2">
                  <div>
                    <span className="text-xs text-slate-500 block mb-1">Role</span>
                    <Select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="min-w-[140px]">
                      {SELECTABLE_ROLES.map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {Number(editRole) === ROLE.Moderator && (
                    <>
                      <div>
                        <span className="text-xs text-slate-500 block mb-1">Department scope (optional)</span>
                        <Select value={editDept} onChange={(e) => setEditDept(e.target.value)} className="min-w-[160px]">
                          <option value="">Any department</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block mb-1">Batch scope (optional)</span>
                        <Select value={editBatch} onChange={(e) => setEditBatch(e.target.value)} className="min-w-[160px]">
                          <option value="">Any batch</option>
                          {batches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.label || `${b.startYear}-${b.endYear}`}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </>
                  )}
                  <Button onClick={() => saveRole(u)} disabled={saving}>
                    <Check size={15} className="mr-1" /> Save
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingId(null)}>
                    <X size={15} className="mr-1" /> Cancel
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} pageSize={20} onChange={setPage} />
    </div>
  )
}
