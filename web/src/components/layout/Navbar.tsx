import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X, ChevronLeft } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useInstitution } from '../../hooks/useInstitution'
import { ROLE } from '../../types/api'
import { Avatar, Button } from '../shared/ui'

// Public/anonymous visitors see only institutional content links; Alumni/Jobs/Business
// Directory/Students are member-only features (gated behind approved membership on the backend
// too) and only appear once logged in as an approved member. Order matches the requested nav
// order: Alumni, Jobs, Notices, Events, Business Directory, Students, Committee, (Admin below).
const navLinks = [
  { to: '/directory', label: 'Alumni', memberOnly: true },
  { to: '/jobs', label: 'Jobs', memberOnly: true },
  { to: '/notices', label: 'Notices', memberOnly: false },
  { to: '/events', label: 'Events', memberOnly: false },
  { to: '/businesses', label: 'Business Directory', memberOnly: true },
  { to: '/students', label: 'Students', memberOnly: true },
  { to: '/committee', label: 'Committee', memberOnly: false },
]

export function Navbar() {
  const { user, logout } = useAuth()
  const { institution } = useInstitution()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isApprovedMember = user?.status === 'approved'
  const isAdmin = user && (user.roleId === ROLE.SuperAdmin || user.roleId === ROLE.Admin || user.roleId === ROLE.Moderator)
  const links = navLinks.filter((l) => !l.memberOnly || isApprovedMember)
  const isTopLevel = location.pathname === '/'

  return (
    <>
      {/* Desktop navbar — unchanged from before the mobile app-shell work. */}
      <header className="hidden md:block sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold text-brand text-lg">
            {institution?.logoUrl ? (
              <img src={institution.logoUrl} alt={institution.name} className="h-8 w-8 rounded object-contain" />
            ) : null}
            {institution?.shortName || institution?.name || 'Alumni Portal'}
          </Link>

          <nav className="flex items-center gap-5 text-sm">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'text-brand font-medium' : 'text-slate-600 hover:text-slate-900')}>
                {l.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? 'text-brand font-medium' : 'text-slate-600 hover:text-slate-900')}>
                Admin
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link to="/profile" className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 pl-1 pr-2 py-1 rounded-full hover:bg-slate-50">
                  <Avatar name={user.fullName} url={user.avatarUrl} size="sm" />
                  <span className="max-w-[140px] truncate">{user.fullName}</span>
                </Link>
                <Button variant="secondary" onClick={logout}>
                  Log out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="secondary">Log in</Button>
                </Link>
                <Link to="/signup">
                  <Button>Join Alumni Community</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile app bar — slim, no text links/auth buttons; the bottom tab bar + More sheet
          own navigation on mobile now. A back chevron replaces the logo on non-home screens,
          matching how native apps show contextual back navigation instead of a persistent
          home link. */}
      <header
        className="md:hidden sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/95 backdrop-blur px-4"
        style={{ paddingTop: 'var(--safe-top)', height: `calc(52px + var(--safe-top))` }}
      >
        {isTopLevel ? (
          <Link to="/" className="flex items-center gap-2 font-semibold text-brand">
            {institution?.logoUrl ? (
              <img src={institution.logoUrl} alt={institution.name} className="h-7 w-7 rounded object-contain" />
            ) : null}
            <span className="truncate">{institution?.shortName || institution?.name || 'Alumni Portal'}</span>
          </Link>
        ) : (
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 -ml-1 p-1 text-slate-700" aria-label="Back">
            <ChevronLeft size={22} />
          </button>
        )}

        <div className="flex-1" />

        {user ? (
          <Link to="/profile" aria-label="My profile">
            <Avatar name={user.fullName} url={user.avatarUrl} size="sm" />
          </Link>
        ) : (
          <button onClick={() => setOpen(!open)} className="p-1 text-slate-700" aria-label="Toggle menu">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        )}
      </header>

      {/* Minimal fallback panel for the one case the tab bar/More sheet don't cover: an
          anonymous visitor wanting Login/Signup without opening the full More sheet. Logged-in
          users get everything via the bottom tab bar's More button instead. */}
      {open && !user && (
        <div className="md:hidden fixed inset-x-0 top-[calc(52px+var(--safe-top))] z-40 border-b border-slate-200 bg-white px-4 py-3 flex flex-col gap-2 shadow-sm">
          <Link to="/login" onClick={() => setOpen(false)}>
            <Button variant="secondary" className="w-full">
              Log in
            </Button>
          </Link>
          <Link to="/signup" onClick={() => setOpen(false)}>
            <Button className="w-full">Join Alumni Community</Button>
          </Link>
        </div>
      )}
    </>
  )
}
