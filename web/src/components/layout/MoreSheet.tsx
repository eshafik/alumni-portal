import { Link } from 'react-router-dom'
import { Calendar, Users, GraduationCap, Bell, Store, ShieldCheck, LogOut, LogIn, UserPlus, FileText, ChevronRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { ROLE } from '../../types/api'
import { Avatar } from '../shared/ui'

interface MoreSheetProps {
  open: boolean
  onClose: () => void
}

interface Row {
  to: string
  label: string
  icon: typeof Calendar
}

// Native-style bottom sheet (slide-up panel + backdrop, drag-handle affordance) rather than a
// dropdown — holds whatever the bottom tab bar's 4 fixed slots didn't have room for. Contents
// are role-aware: it only ever lists items not already reachable from a tab, so nothing is
// duplicated between the tab bar and this sheet.
export function MoreSheet({ open, onClose }: MoreSheetProps) {
  const { user, logout } = useAuth()
  const isApprovedMember = user?.status === 'approved'
  const isAdmin = user && (user.roleId === ROLE.SuperAdmin || user.roleId === ROLE.Admin || user.roleId === ROLE.Moderator)

  // The tab bar always shows Jobs as tab 3, and either Directory/Alumni (members) or Events
  // (everyone else) as tab 2 — so this list is exactly "everything else" for each case, in the
  // same relative order as the desktop nav: Alumni, Jobs, Notices, Events, Business Directory,
  // Students, Committee.
  const browseRows: Row[] = isApprovedMember
    ? [
        { to: '/notices', label: 'Notices', icon: Bell },
        { to: '/events', label: 'Events', icon: Calendar },
        { to: '/businesses', label: 'Business Directory', icon: Store },
        { to: '/students', label: 'Students', icon: GraduationCap },
        { to: '/committee', label: 'Committee', icon: Users },
      ]
    : [
        { to: '/notices', label: 'Notices', icon: Bell },
        { to: '/committee', label: 'Committee', icon: Users },
      ]

  const handleNavigate = () => onClose()

  return (
    <>
      {open && <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden="true" />}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl transition-transform duration-200 ${
          open ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
        style={{ paddingBottom: 'calc(16px + var(--safe-bottom))' }}
        role="dialog"
        aria-modal="true"
        aria-label="More options"
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-slate-300" />
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-2 pt-2">
          {browseRows.map((row) => (
            <SheetRow key={row.to} {...row} onClick={handleNavigate} />
          ))}

          <div className="my-2 border-t border-slate-100" />

          {user ? (
            <>
              <Link
                to="/profile"
                onClick={handleNavigate}
                className="flex items-center gap-3 px-3 py-3.5 rounded-lg text-slate-700 active:bg-slate-50"
              >
                <Avatar name={user.fullName} url={user.avatarUrl} size="sm" />
                <span className="flex-1 text-[15px] font-medium truncate">{user.fullName}</span>
                <ChevronRight size={16} className="text-slate-300" />
              </Link>
              {isAdmin && <SheetRow to="/admin" label="Admin Dashboard" icon={ShieldCheck} onClick={handleNavigate} />}
              <button
                onClick={() => {
                  onClose()
                  logout()
                }}
                className="w-full flex items-center gap-3 px-3 py-3.5 text-left text-red-600 active:bg-slate-50 rounded-lg"
              >
                <LogOut size={19} />
                <span className="flex-1 text-[15px] font-medium">Log out</span>
              </button>
            </>
          ) : (
            <>
              <SheetRow to="/login" label="Log in" icon={LogIn} onClick={handleNavigate} />
              <SheetRow to="/signup" label="Join Alumni Community" icon={UserPlus} onClick={handleNavigate} />
            </>
          )}

          <div className="my-2 border-t border-slate-100" />
          <SheetRow to="/privacy" label="Privacy Policy" icon={FileText} onClick={handleNavigate} />
          <SheetRow to="/terms" label="Terms of Use" icon={FileText} onClick={handleNavigate} />
        </div>
      </div>
    </>
  )
}

function SheetRow({ to, label, icon: Icon, onClick, className = '' }: Row & { onClick: () => void; className?: string }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-3.5 rounded-lg text-slate-700 active:bg-slate-50 ${className}`}
    >
      <Icon size={19} className="text-slate-400" />
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      <ChevronRight size={16} className="text-slate-300" />
    </Link>
  )
}
