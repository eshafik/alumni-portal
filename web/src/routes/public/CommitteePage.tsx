import { useEffect, useState } from 'react'
import { committeesApi } from '../../api/content'
import type { Committee, CommitteePositionWithMembers } from '../../types/api'
import { Card, Loading, Select } from '../../components/shared/ui'

export default function CommitteePage() {
  const [committees, setCommittees] = useState<Committee[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [committee, setCommittee] = useState<Committee | null>(null)
  const [positions, setPositions] = useState<CommitteePositionWithMembers[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    committeesApi.list().then((list) => {
      setCommittees(list ?? [])
      const current = list.find((c) => c.isCurrent) ?? list[0]
      if (current) setSelectedId(current.id)
      else setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (selectedId == null) return
    setLoading(true)
    committeesApi
      .get(selectedId)
      .then((res) => {
        setCommittee(res.committee)
        setPositions(res.positions)
      })
      .finally(() => setLoading(false))
  }, [selectedId])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Committee</h1>
          {committee && (
            <p className="text-sm text-slate-500">
              Term {committee.termStart}–{committee.termEnd} {committee.isCurrent && '· Current'}
            </p>
          )}
        </div>
        {committees.length > 1 && (
          <Select value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))} className="max-w-[220px]">
            {committees.map((c) => (
              <option key={c.id} value={c.id}>
                {c.termStart}–{c.termEnd} {c.isCurrent ? '(Current)' : ''}
              </option>
            ))}
          </Select>
        )}
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {positions.map((p) =>
            p.members.length > 0 ? (
              p.members.map((m) => (
                <Card key={`${p.id}-${m.userId}`} className="text-center">
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt={m.fullName} className="w-16 h-16 rounded-full mx-auto mb-2 object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-200 mx-auto mb-2" />
                  )}
                  <p className="font-medium text-sm">{m.fullName}</p>
                  <p className="text-xs text-slate-500">{p.title}</p>
                </Card>
              ))
            ) : (
              <Card key={p.id} className="text-center opacity-50">
                <div className="w-16 h-16 rounded-full bg-slate-100 mx-auto mb-2" />
                <p className="text-xs text-slate-400">{p.title} — vacant</p>
              </Card>
            ),
          )}
        </div>
      )}
    </div>
  )
}
