import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { authApi } from '../../api/auth'
import { ApiError } from '../../api/client'
import { useCooldown } from '../../hooks/useCooldown'
import { OTP_RESEND_COOLDOWN_SECONDS } from '../../lib/constants'
import { Button, Card, Input } from '../../components/shared/ui'

export default function VerifyOtp() {
  const [params] = useSearchParams()
  const location = useLocation()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const { remaining, start } = useCooldown()
  const navigate = useNavigate()

  // Signup already sent the first code before landing here — start the same cooldown the
  // server just reported (falls back to the known default if arriving without that state,
  // e.g. a bookmarked/direct link).
  useEffect(() => {
    if (params.get('email')) {
      const state = location.state as { cooldownSeconds?: number } | null
      start(state?.cooldownSeconds ?? OTP_RESEND_COOLDOWN_SECONDS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.verifyOtp(email, code)
      setMessage('Verified! Your account is now pending approval. You will be notified once approved.')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    if (remaining > 0) return
    setError('')
    setResending(true)
    try {
      const res = await authApi.resendOtp(email)
      setMessage('A new code has been sent.')
      start(res.cooldownSeconds)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend code')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto py-12">
      <h1 className="text-2xl font-semibold mb-6 text-center">Verify your email</h1>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <fieldset disabled={loading} className="space-y-4">
            <Input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input placeholder="6-digit code" required maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          </fieldset>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 size={15} className="animate-spin mr-1.5" />}
            {loading ? 'Verifying...' : 'Verify'}
          </Button>
        </form>
        <div className="mt-4 text-sm text-center">
          <button onClick={resend} disabled={remaining > 0 || loading || resending} className="text-brand disabled:text-slate-400 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
            {resending && <Loader2 size={13} className="animate-spin" />}
            {remaining > 0 ? `Resend code in ${remaining}s` : resending ? 'Resending...' : 'Resend code'}
          </button>
        </div>
        <p className="mt-2 text-sm text-center text-slate-500">
          <Link to="/login" className="text-brand">
            Back to login
          </Link>
        </p>
      </Card>
    </div>
  )
}
