import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Loading } from './ui'

export function RequireApproved() {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (user.status !== 'approved') return <Navigate to="/pending-approval" replace />
  return <Outlet />
}

export function RequireRole({ roles }: { roles: number[] }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.roleId)) return <Navigate to="/" replace />
  return <Outlet />
}
