import { useEffect, useState } from 'react'
import { Plus, X, UserPlus } from 'lucide-react'
import { committeesApi, adminCommitteesApi } from '../../api/content'
import { adminApi } from '../../api/admin'
import type { Committee, CommitteePositionWithMembers, User } from '../../types/api'
import { Button, Card, Input, Select, Loading } from '../../components/shared/ui'
import { useDebounce } from '../../hooks/useDebounce'

export default function AdminCommittee() {
  const [committees, setCommittees] = useState<Committee[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [committee, setCommittee] = useState<Committee | null>(null)
  const [positions, setPositions] = useState<CommitteePositionWithMembers[]>([])
  const [loading, setLoading] = useState(true)

  const [newTitle, setNewTitle] = useState('')
  const [newTermStart, setNewTermStart] = useState('')
  const [newTermEnd, setNewTermEnd] = useState('')
  const [creatingTerm, setCreatingTerm] = useState(false)

  const reloadList = () => {
    committeesApi.list().then((list) => {
      setCommittees(list ?? [])
      const current = list.find((c) => c.isCurrent) ?? list[0]
      if (current) setSelectedId(current.id)
      else setLoading(false)
    })
  }
  useEffect(reloadList, [])

  const reloadCommittee = () => {
    if (selectedId == null) return
    setLoading(true)
    committeesApi
      .get(selectedId)
      .then((res) => {
        setCommittee(res.committee)
        setPositions(res.positions)
      })
      .finally(() => setLoading(false))
  }
  useEffect(reloadCommittee, [selectedId])

  const isCurrent = committee?.isCurrent ?? false

  const addPosition = async () => {
    if (!newTitle.trim() || !committee) return
    await adminCommitteesApi.createPosition(committee.id, newTitle.trim(), positions.length + 1)
    setNewTitle('')
    reloadCommittee()
  }

  const startNewTerm = async () => {
    const start = Number(newTermStart)
    const end = Number(newTermEnd || start + 2)
    if (!start) return
    if (!window.confirm(`Start a new term (${start}–${end})? This retires the current committee — its members and positions are preserved as history, but it will no longer show as "Current".`)) return
    await adminCommitteesApi.create({ termStart: start, termEnd: end })
    setNewTermStart('')
    setNewTermEnd('')
    setCreatingTerm(false)
    reloadList()
  }

  const removeMember = async (positionId: number, userId: number) => {
    if (!window.confirm('Remove this member from the position?')) return
    await adminCommitteesApi.removeMember(positionId, userId)
    reloadCommittee()
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Committee</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage committee terms, positions, and members. Assigning a member to President, Secretary, or
            Organizing Secretary automatically grants them Admin access.
          </p>
        </div>
        <Button onClick={() => setCreatingTerm((v) => !v)}>
          <Plus size={15} className="mr-1" /> Start new term
        </Button>
      </div>

      {creatingTerm && (
        <Card className="mb-6">
          <h2 className="text-sm font-medium mb-3">Start a new committee term</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <span className="text-xs text-slate-500 block mb-1">Term start year</span>
              <Input type="number" value={newTermStart} onChange={(e) => setNewTermStart(e.target.value)} className="max-w-[120px]" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-1">Term end year (optional)</span>
              <Input type="number" value={newTermEnd} onChange={(e) => setNewTermEnd(e.target.value)} className="max-w-[120px]" />
            </div>
            <Button onClick={startNewTerm} disabled={!newTermStart}>
              Confirm
            </Button>
          </div>
        </Card>
      )}

      {committees.length > 1 && (
        <Select value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))} className="max-w-[220px] mb-6">
          {committees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.termStart}–{c.termEnd} {c.isCurrent ? '(Current)' : ''}
            </option>
          ))}
        </Select>
      )}

      {loading ? (
        <Loading />
      ) : (
        committee && (
          <div className="space-y-4">
            {!isCurrent && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                This is a past term — read only. Select the current term to make changes.
              </p>
            )}

            {positions.map((p) => (
              <Card key={p.id}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium text-sm">
                    {p.title}
                    {p.isDefaultAdmin && <span className="ml-2 text-xs text-brand">(auto-admin)</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {p.members.length === 0 && <span className="text-xs text-slate-400">Vacant</span>}
                  {p.members.map((m) => (
                    <span key={m.userId} className="flex items-center gap-1.5 rounded-full bg-slate-100 pl-1 pr-2 py-1 text-xs">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-slate-300" />
                      )}
                      {m.fullName}
                      {isCurrent && (
                        <button onClick={() => removeMember(p.id, m.userId)} className="text-slate-400 hover:text-red-600" aria-label="Remove">
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {isCurrent && <MemberPicker positionId={p.id} onAdded={reloadCommittee} />}
              </Card>
            ))}

            {isCurrent && (
              <Card>
                <p className="text-sm font-medium mb-2">Add a custom position</p>
                <div className="flex gap-2">
                  <Input placeholder="Position title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="max-w-xs" />
                  <Button onClick={addPosition} disabled={!newTitle.trim()}>
                    <Plus size={15} className="mr-1" /> Add
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )
      )}
    </div>
  )
}

function MemberPicker({ positionId, onAdded }: { positionId: number; onAdded: () => void }) {
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [results, setResults] = useState<User[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!debouncedQ.trim()) {
      setResults([])
      return
    }
    adminApi.listUsers(1, debouncedQ).then((res) => setResults(res.items ?? []))
  }, [debouncedQ])

  const add = async (userId: number) => {
    await adminCommitteesApi.addMember(positionId, userId)
    setQ('')
    setResults([])
    setOpen(false)
    onAdded()
  }

  return (
    <div className="relative max-w-xs">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search member by name or email"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
        />
        <UserPlus size={16} className="text-slate-400 shrink-0" />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-md max-h-56 overflow-y-auto">
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => add(u.id)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex flex-col"
            >
              <span className="font-medium">{u.fullName}</span>
              <span className="text-xs text-slate-400">{u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
