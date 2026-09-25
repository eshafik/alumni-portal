import { useEffect, useState } from 'react'
import { Crown } from 'lucide-react'
import { alumniApi } from '../../api/directory'
import type { CommitteeMemberInfo } from '../../types/api'
import { Avatar, Card, CardGridSkeleton, EmptyState, LIFE_MEMBER_RING } from '../../components/shared/ui'

// Public page — name and photo only, by design (see AlumniHandler.LifeMembers).
export default function LifeMembersPage() {
  const [members, setMembers] = useState<CommitteeMemberInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    alumniApi
      .lifeMembers()
      .then((list) => setMembers(list ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2">
          <Crown size={22} className="text-amber-500" aria-hidden /> Life Members
        </h1>
        <p className="text-sm text-slate-500">
          {loading ? 'Honouring the members who have committed to the association for life.' : `${members.length} life ${members.length === 1 ? 'member' : 'members'} of our association.`}
        </p>
      </div>

      {loading ? (
        <CardGridSkeleton count={8} />
      ) : members.length === 0 ? (
        <EmptyState title="No life members yet" description="Life members will appear here once added." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {members.map((m) => (
            <Card
              key={m.userId}
              className="relative overflow-hidden text-center py-5 border-amber-200 bg-gradient-to-b from-amber-50/70 to-white"
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />
              <div className="flex justify-center mb-3">
                <Avatar name={m.fullName} url={m.avatarUrl} size="lg" className={LIFE_MEMBER_RING} />
              </div>
              <p className="font-medium text-sm text-slate-900 line-clamp-2 break-words">{m.fullName}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
