import { useAuth } from '../../hooks/useAuth'
import { Card, Button } from '../../components/shared/ui'

export default function PendingApproval() {
  const { user, logout } = useAuth()

  if (user?.status === 'rejected') {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <Card>
          <h1 className="text-xl font-semibold mb-2">Application not approved</h1>
          <p className="text-slate-600 text-sm">
            Your membership application was not approved. Contact the institution for details.
          </p>
          <Button variant="secondary" className="mt-4" onClick={logout}>
            Log out
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-16 text-center">
      <Card>
        <h1 className="text-xl font-semibold mb-2">Pending Approval</h1>
        <p className="text-slate-600 text-sm">
          Your account is under review by an administrator or moderator. You'll be notified by email once approved.
        </p>
        <Button variant="secondary" className="mt-4" onClick={logout}>
          Log out
        </Button>
      </Card>
    </div>
  )
}
