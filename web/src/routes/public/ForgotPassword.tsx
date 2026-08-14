import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { ApiError } from '../../api/client'
import { useCooldown } from '../../hooks/useCooldown'
import { Button, Card, Input } from '../../components/shared/ui'

export default function ForgotPassword() {
  const [step, setStep] = useState<'request' | 'reset'>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const { remaining, start } = useCooldown()

  const requestCode = async (e: FormEvent) => {
    e.preventDefault()
    if (remaining > 0) return
    setError('')
    const res = await authApi.forgotPassword(email)
    setMessage('If that email exists, a reset code has been sent.')
    setStep('reset')
    start(res.cooldownSeconds)
  }

  const resendCode = async () => {
    if (remaining > 0) return
    setError('')
    const res = await authApi.forgotPassword(email)
    setMessage('A new code has been sent.')
    start(res.cooldownSeconds)
  }

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await authApi.resetPassword(email, code, newPassword)
      setMessage('Password updated. You can now log in.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed')
    }
  }

  return (
    <div className="max-w-sm mx-auto py-12">
      <h1 className="text-2xl font-semibold mb-6 text-center">Reset password</h1>
      <Card>
        {step === 'request' ? (
          <form onSubmit={requestCode} className="space-y-4">
            <Input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" className="w-full" disabled={remaining > 0}>
              {remaining > 0 ? `Send reset code (${remaining}s)` : 'Send reset code'}
            </Button>
          </form>
        ) : (
          <>
            <form onSubmit={resetPassword} className="space-y-4">
              <Input placeholder="6-digit code" required value={code} onChange={(e) => setCode(e.target.value)} />
              <Input type="password" placeholder="New password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <Button type="submit" className="w-full">
                Update password
              </Button>
            </form>
            <div className="mt-3 text-sm text-center">
              <button onClick={resendCode} disabled={remaining > 0} className="text-brand disabled:text-slate-400 disabled:cursor-not-allowed">
                {remaining > 0 ? `Resend code in ${remaining}s` : 'Resend code'}
              </button>
            </div>
          </>
        )}
        {message && <p className="text-sm text-green-600 mt-3">{message}</p>}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <p className="mt-4 text-sm text-center">
          <Link to="/login" className="text-brand">
            Back to login
          </Link>
        </p>
      </Card>
    </div>
  )
}
