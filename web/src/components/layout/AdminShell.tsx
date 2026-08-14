import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Settings, ListTree, Megaphone, CalendarDays, Users2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { ROLE } from '../../types/api'

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, fullAdminOnly: false },
  { to: '/admin/settings', label: 'Institution Settings', icon: Settings, end: false, fullAdminOnly: true },
  { to: '/admin/taxonomy', label: 'Manage Dropdowns', icon: ListTree, end: false, fullAdminOnly: true },
  { to: '/admin/notices', label: 'Notices', icon: Megaphone, end: false, fullAdminOnly: true },
  { to: '/admin/events', label: 'Events', icon: CalendarDays, end: false, fullAdminOnly: true },
  { to: '/admin/committee', label: 'Committee', icon: Users2, end: false, fullAdminOnly: true },
]

export function AdminShell() {
  const { user } = useAuth()
  const isFullAdmin = user?.roleId === ROLE.SuperAdmin || user?.roleId === ROLE.Admin

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 md:gap-8">
      <aside className="md:sticky md:top-20 md:self-start">
        <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Administration</p>
        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
          {navItems
            .filter((item) => isFullAdmin || !item.fullAdminOnly)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
