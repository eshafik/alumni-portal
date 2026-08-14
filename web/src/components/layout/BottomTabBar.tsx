import { NavLink } from 'react-router-dom'
import { Home, Users, Calendar, Bell, MoreHorizontal } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

interface BottomTabBarProps {
  onMoreClick: () => void
  moreOpen: boolean
}

// Native-style bottom tab bar, mobile only (md:hidden). The second tab is context-aware:
// approved members get Directory (their most-used screen), everyone else gets Events. This
// keeps the bar at a clean 4 items regardless of auth state instead of growing/shrinking.
export function BottomTabBar({ onMoreClick, moreOpen }: BottomTabBarProps) {
  const { user } = useAuth()
  const isApprovedMember = user?.status === 'approved'

  const secondTab = isApprovedMember
    ? { to: '/directory', label: 'Directory', icon: Users }
    : { to: '/events', label: 'Events', icon: Calendar }

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] font-medium transition-colors ${
      isActive ? 'text-brand' : 'text-slate-500'
    }`

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch bg-white border-t border-slate-200"
      style={{ paddingBottom: 'var(--safe-bottom)', height: `calc(56px + var(--safe-bottom))` }}
      aria-label="Primary"
    >
      <NavLink to="/" end className={tabClass}>
        <Home size={22} strokeWidth={2.25} />
        Home
      </NavLink>
      <NavLink to={secondTab.to} className={tabClass}>
        <secondTab.icon size={22} strokeWidth={2.25} />
        {secondTab.label}
      </NavLink>
      <NavLink to="/notices" className={tabClass}>
        <Bell size={22} strokeWidth={2.25} />
        Notices
      </NavLink>
      <button
        onClick={onMoreClick}
        className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] font-medium transition-colors ${
          moreOpen ? 'text-brand' : 'text-slate-500'
        }`}
        aria-expanded={moreOpen}
        aria-label="More"
      >
        <MoreHorizontal size={22} strokeWidth={2.25} />
        More
      </button>
    </nav>
  )
}
