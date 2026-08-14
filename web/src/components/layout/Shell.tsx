import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { BottomTabBar } from './BottomTabBar'
import { MoreSheet } from './MoreSheet'
import { useAuth } from '../../hooks/useAuth'
import { ROLE } from '../../types/api'

export function Shell() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  // Mandatory first-run gate: an approved alumni/student without a profile picture is sent to
  // /complete-profile from anywhere in the app until they set one. Admin/SuperAdmin/Moderator
  // and non-approved statuses are unaffected (see AuthHandler.Me's hasAvatar computation).
  useEffect(() => {
    const needsSetup =
      user?.status === 'approved' &&
      (user.roleId === ROLE.Alumni || user.roleId === ROLE.Student) &&
      !user.hasAvatar
    if (needsSetup && location.pathname !== '/complete-profile') {
      navigate('/complete-profile', { replace: true })
    }
  }, [user, location.pathname, navigate])

  // Close the More sheet on route changes (e.g. back/forward navigation) so it never lingers
  // open over a different page than the one it was opened from.
  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:pb-6">
        <Outlet />
      </main>
      <Footer />
      <BottomTabBar onMoreClick={() => setMoreOpen((o) => !o)} moreOpen={moreOpen} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  )
}
