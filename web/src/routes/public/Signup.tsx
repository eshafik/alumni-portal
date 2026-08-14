import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { configApi } from '../../api/directory'
import { ApiError } from '../../api/client'
import type { Department, Program, Batch, BloodGroup } from '../../types/api'
import { Button, Card, Input } from '../../components/shared/ui'
import { PhoneInput } from '../../components/shared/PhoneInput'

export default function Signup() {
  const [accountType, setAccountType] = useState<'alumni' | 'student'>('alumni')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [programId, setProgramId] = useState('')
  const [batchId, setBatchId] = useState('')
  const [bloodGroupId, setBloodGroupId] = useState('')
  const [currentDesignation, setCurrentDesignation] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [bloodGroups, setBloodGroups] = useState<BloodGroup[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    configApi.departments().then((d) => setDepartments(d ?? []))
    configApi.bloodGroups().then((bg) => setBloodGroups(bg ?? []))
  }, [])
  useEffect(() => {
    if (departmentId) configApi.programs(Number(departmentId)).then((p) => setPrograms(p ?? []))
    else setPrograms([])
    setProgramId('')
  }, [departmentId])
  useEffect(() => {
    if (programId) configApi.batches(Number(programId)).then((b) => setBatches(b ?? []))
    else setBatches([])
    setBatchId('')
  }, [programId])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.signup({
        fullName,
        email,
        phone,
        password,
        accountType,
        departmentId: Number(departmentId),
        programId: Number(programId),
        batchId: Number(batchId),
        bloodGroupId: Number(bloodGroupId),
        ...(accountType === 'alumni' ? { currentDesignation, companyName } : {}),
      })
      setMessage('Account created! Check your email for a verification code.')
      setTimeout(
        () => navigate(`/verify-otp?email=${encodeURIComponent(email)}`, { state: { cooldownSeconds: res.cooldownSeconds } }),
        1200,
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <h1 className="text-2xl font-semibold mb-6 text-center">Join the Alumni Community</h1>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex gap-2">
            {(['alumni', 'student'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setAccountType(t)}
                className={`flex-1 rounded-md border py-2 text-sm font-medium capitalize ${accountType === t ? 'border-brand bg-blue-50 text-brand' : 'border-slate-300 text-slate-600'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <Input placeholder="Full name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <PhoneInput required value={phone} onChange={setPhone} />
          <Input type="password" placeholder="Password (min 8 characters)" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />

          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Select department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required value={programId} onChange={(e) => setProgramId(e.target.value)} disabled={!departmentId}>
            <option value="">Select program</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required value={batchId} onChange={(e) => setBatchId(e.target.value)} disabled={!programId}>
            <option value="">Select batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label || `${b.startYear}-${b.endYear}`}
              </option>
            ))}
          </select>
          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required value={bloodGroupId} onChange={(e) => setBloodGroupId(e.target.value)}>
            <option value="">Select blood group</option>
            {bloodGroups.map((bg) => (
              <option key={bg.id} value={bg.id}>
                {bg.name}
              </option>
            ))}
          </select>

          {accountType === 'alumni' && (
            <>
              <Input placeholder="Current designation (optional)" value={currentDesignation} onChange={(e) => setCurrentDesignation(e.target.value)} />
              <Input placeholder="Current organization (optional)" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
