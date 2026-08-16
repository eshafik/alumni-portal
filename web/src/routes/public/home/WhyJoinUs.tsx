import { Users2, Briefcase, CalendarHeart, HeartHandshake } from 'lucide-react'
import { Card } from '../../../components/shared/ui'
import { Kicker } from './Kicker'

const ITEMS = [
  { icon: Users2, title: 'Network', body: 'Reconnect with classmates and grow your professional circle.' },
  { icon: Briefcase, title: 'Career', body: 'Discover job posts and mentorship from fellow alumni.' },
  { icon: CalendarHeart, title: 'Events', body: 'Reunions and meetups that keep the bond alive.' },
  { icon: HeartHandshake, title: 'Give Back', body: 'Support current students and the next generation.' },
]

// Static value-prop grid — no backend/admin data dependency, just orients a first-time visitor
// on why the portal is worth joining before they hit the (data-dependent) Community/Events
// sections below.
export function WhyJoinUs() {
  return (
    <>
      <div className="text-center mb-8">
        <Kicker>Why join</Kicker>
        <h2 className="text-2xl font-semibold text-slate-900">Built for your alumni journey</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {ITEMS.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="text-center hover:shadow-md hover:-translate-y-0.5 transition-all">
            <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center mx-auto mb-3">
              <Icon size={20} />
            </div>
            <p className="font-semibold text-slate-900 text-sm">{title}</p>
            <p className="text-xs text-slate-500 mt-1.5">{body}</p>
          </Card>
        ))}
      </div>
    </>
  )
}
