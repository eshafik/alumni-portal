import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Mail, MessageSquare, Lock, Users, GraduationCap, Search, X, UserPlus } from 'lucide-react'
import { outreachApi, type OutreachConfig, type OutreachEstimate, type OutreachCampaign, type OutreachUserSearchResult } from '../../api/outreach'
import { configApi } from '../../api/directory'
import { ApiError } from '../../api/client'
import { useConfirm } from '../../hooks/useConfirm'
import { useDebounce } from '../../hooks/useDebounce'
import { formatCurrency, formatDateTime, cn } from '../../lib/utils'
import { countSmsSegments } from '../../lib/smsSegments'
import type { Department, Program, Batch, BloodGroup } from '../../types/api'
import { Button, Card, Textarea, Input, Select, Field, SectionHeader, Badge, Loading, Pagination } from '../../components/shared/ui'

type Channel = 'email' | 'sms'

const STATUS_TONE: Record<string, 'default' | 'important' | 'urgent' | 'success'> = {
  queued: 'default',
  processing: 'important',
  completed: 'success',
  completed_with_errors: 'urgent',
}

export default function AdminOutreach() {
  const confirm = useConfirm()

  const [config, setConfig] = useState<OutreachConfig | null>(null)
  const [channel, setChannel] = useState<Channel>('email')
  const [targetAlumni, setTargetAlumni] = useState(true)
  const [targetStudents, setTargetStudents] = useState(false)
  const [departmentId, setDepartmentId] = useState('')
  const [programId, setProgramId] = useState('')
  const [batchId, setBatchId] = useState('')
  const [bloodGroupId, setBloodGroupId] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const [departments, setDepartments] = useState<Department[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [bloodGroups, setBloodGroups] = useState<BloodGroup[]>([])

  const [estimate, setEstimate] = useState<OutreachEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const [extraRecipients, setExtraRecipients] = useState<OutreachUserSearchResult[]>([])
  const [peopleQuery, setPeopleQuery] = useState('')
  const [peopleResults, setPeopleResults] = useState<OutreachUserSearchResult[]>([])
  const [peopleSearching, setPeopleSearching] = useState(false)
  const debouncedPeopleQuery = useDebounce(peopleQuery, 300)

  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([])
  const [campaignsTotal, setCampaignsTotal] = useState(0)
  const [campaignsPage, setCampaignsPage] = useState(1)
  const [campaignsLoading, setCampaignsLoading] = useState(true)

  const showFilters = targetAlumni !== targetStudents // exactly one group selected

  useEffect(() => {
    outreachApi.config().then(setConfig)
    configApi.departments().then((d) => setDepartments(d ?? []))
    configApi.bloodGroups().then((bg) => setBloodGroups(bg ?? []))
  }, [])

  // Auto-select whichever channel is actually usable — the channel toggle defaults to 'email'
  // before config loads, so if only SMS is enabled (or only email), land on that one instead of
  // showing email-only fields (Subject) while email is disabled. Only one channel enabled is the
  // common real-world case (each needs its own provider set up), so this is the useful default;
  // when both or neither are enabled there's a genuine choice, so leave the toggle as-is.
  useEffect(() => {
    if (!config) return
    if (config.emailEnabled && !config.smsEnabled) setChannel('email')
    else if (!config.emailEnabled && config.smsEnabled) setChannel('sms')
  }, [config])

  // Department/program are optional narrowing filters, not a required cascade — always show
  // every program (and every batch) by default, only narrowing when the admin actually picks a
  // department/program. Nothing here is ever disabled: a rigid pick-department-then-program
  // requirement read as "not clickable" when there's only a handful of departments/programs.
  useEffect(() => {
    configApi.programs(departmentId ? Number(departmentId) : undefined).then((p) => setPrograms(p ?? []))
    setProgramId('')
  }, [departmentId])

  useEffect(() => {
    // Alumni batches can be scoped by program; students have no program filter in this form —
    // list every batch for them (and for alumni until a program is actually chosen).
    if (targetAlumni && !targetStudents && programId) {
      configApi.batches(Number(programId)).then((b) => setBatches(b ?? []))
    } else {
      configApi.batches().then((b) => setBatches(b ?? []))
    }
    setBatchId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, targetAlumni, targetStudents])

  useEffect(() => {
    const q = debouncedPeopleQuery.trim()
    if (q.length < 2) {
      setPeopleResults([])
      return
    }
    setPeopleSearching(true)
    outreachApi
      .searchRecipients(q)
      .then((res) => setPeopleResults(res ?? []))
      .finally(() => setPeopleSearching(false))
  }, [debouncedPeopleQuery])

  // "Add specific people" and group targeting (Alumni/Students + filters) are mutually
  // exclusive, not additive — adding someone by name means "only them", not "them plus every
  // alumni/student the filters already match". Adding a person clears the group selection;
  // re-checking a group clears the picked people.
  const specificMode = extraRecipients.length > 0

  const addRecipient = (person: OutreachUserSearchResult) => {
    setExtraRecipients((prev) => (prev.some((p) => p.userId === person.userId) ? prev : [...prev, person]))
    setPeopleQuery('')
    setPeopleResults([])
    setTargetAlumni(false)
    setTargetStudents(false)
  }
  const removeRecipient = (userId: number) => setExtraRecipients((prev) => prev.filter((p) => p.userId !== userId))

  const setGroupTarget = (group: 'alumni' | 'students', checked: boolean) => {
    if (checked) setExtraRecipients([])
    if (group === 'alumni') setTargetAlumni(checked)
    else setTargetStudents(checked)
  }

  const reloadCampaigns = () => {
    setCampaignsLoading(true)
    outreachApi
      .list(campaignsPage)
      .then((res) => {
        setCampaigns(res.items ?? [])
        setCampaignsTotal(res.total)
      })
      .finally(() => setCampaignsLoading(false))
  }
  useEffect(reloadCampaigns, [campaignsPage])

  const filters = showFilters ? { departmentId, programId, batchId, bloodGroupId } : {}
  const extraUserIds = extraRecipients.map((p) => p.userId)
  const debouncedKey = useDebounce(JSON.stringify({ channel, targetAlumni, targetStudents, filters, message, extraUserIds }), 400)

  useEffect(() => {
    if (!targetAlumni && !targetStudents && extraUserIds.length === 0) {
      setEstimate(null)
      return
    }
    setEstimating(true)
    outreachApi
      .estimate({ channel, targetAlumni, targetStudents, filters, message, extraUserIds })
      .then(setEstimate)
      .catch(() => setEstimate(null))
      .finally(() => setEstimating(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey])

  const channelEnabled = (c: Channel) => (c === 'email' ? config?.emailEnabled : config?.smsEnabled)
  const smsCount = channel === 'sms' ? countSmsSegments(message) : null

  const canSend =
    !!config &&
    channelEnabled(channel) &&
    (targetAlumni || targetStudents || extraRecipients.length > 0) &&
    message.trim() !== '' &&
    (channel === 'email' ? subject.trim() !== '' : true) &&
    (estimate?.recipientCount ?? 0) > 0

  const onSend = async () => {
    setError('')
    if (!estimate) return
    const ok = await confirm({
      title: 'Send outreach campaign?',
      description: `This will send to ${estimate.recipientCount} recipient${estimate.recipientCount === 1 ? '' : 's'} at an estimated cost of ${formatCurrency(estimate.estimatedCost, estimate.currency)}. This cannot be undone.`,
      confirmLabel: 'Send',
      danger: true,
    })
    if (!ok) return
    setSending(true)
    try {
      await outreachApi.send({ channel, subject, message, targetAlumni, targetStudents, filters, extraUserIds })
      setSubject('')
      setMessage('')
      setExtraRecipients([])
      setCampaignsPage(1)
      reloadCampaigns()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send outreach')
    } finally {
      setSending(false)
    }
  }

  if (!config) return <Loading />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Outreach</h1>
        <p className="text-sm text-slate-500 mt-1">Send a bulk email or SMS to alumni and/or students.</p>
      </div>

      <Card className="mb-6">
        <SectionHeader title="Compose" description="Pick a channel, an audience, and write your message." />

        <div className="flex gap-3 mb-5">
          {(['email', 'sms'] as const).map((c) => {
            const enabled = channelEnabled(c)
            const Icon = c === 'email' ? Mail : MessageSquare
            return (
              <button
                key={c}
                type="button"
                disabled={!enabled}
                onClick={() => enabled && setChannel(c)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-md border py-2.5 text-sm font-medium capitalize transition-colors',
                  !enabled && 'opacity-50 cursor-not-allowed border-slate-200 text-slate-400',
                  enabled && channel === c && 'border-brand bg-blue-50 text-brand',
                  enabled && channel !== c && 'border-slate-300 text-slate-600 hover:bg-slate-50',
                )}
              >
                <Icon size={15} />
                {c}
                {!enabled && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 ml-1">
                    <Lock size={10} /> Enable Outreach
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className={cn('grid sm:grid-cols-2 gap-3', specificMode ? 'mb-2 opacity-50' : 'mb-5')}>
          <label
            className={cn(
              'flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm',
              specificMode ? 'cursor-not-allowed border-slate-200' : 'cursor-pointer',
              targetAlumni ? 'border-brand bg-blue-50/50' : 'border-slate-300',
            )}
          >
            <input type="checkbox" checked={targetAlumni} disabled={specificMode} onChange={(e) => setGroupTarget('alumni', e.target.checked)} />
            <Users size={15} className="text-slate-400" /> Alumni
          </label>
          <label
            className={cn(
              'flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm',
              specificMode ? 'cursor-not-allowed border-slate-200' : 'cursor-pointer',
              targetStudents ? 'border-brand bg-blue-50/50' : 'border-slate-300',
            )}
          >
            <input type="checkbox" checked={targetStudents} disabled={specificMode} onChange={(e) => setGroupTarget('students', e.target.checked)} />
            <GraduationCap size={15} className="text-slate-400" /> Students
          </label>
        </div>
        {specificMode && (
          <p className="text-xs text-slate-400 mb-5">
            Targeting {extraRecipients.length} specific {extraRecipients.length === 1 ? 'person' : 'people'} only — clear the list below to target a group instead.
          </p>
        )}

        {showFilters && (
          <div className="grid sm:grid-cols-2 gap-3 mb-5 p-3 rounded-md bg-slate-50 border border-slate-100">
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            {targetAlumni && (
              <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">All programs</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
            <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label || `${b.startYear}-${b.endYear}`}
                </option>
              ))}
            </Select>
            <Select value={bloodGroupId} onChange={(e) => setBloodGroupId(e.target.value)}>
              <option value="">All blood groups</option>
              {bloodGroups.map((bg) => (
                <option key={bg.id} value={bg.id}>
                  {bg.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <Field label="Add specific people" hint="Reach only these people instead of a group — adding someone here clears the group selection above." className="mb-5">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name, email, or phone..."
              className="pl-9"
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
            />
            {peopleQuery.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
                {peopleSearching ? (
                  <p className="px-3 py-2 text-sm text-slate-400">Searching...</p>
                ) : peopleResults.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-400">No matches.</p>
                ) : (
                  peopleResults.map((p) => (
                    <button
                      key={p.userId}
                      type="button"
                      onClick={() => addRecipient(p)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-slate-900">{p.fullName}</span>{' '}
                        <span className="text-slate-400">{p.email || p.phone}</span>
                      </span>
                      <UserPlus size={14} className="text-brand shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {extraRecipients.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {extraRecipients.map((p) => (
                <span key={p.userId} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 pl-3 pr-1.5 py-1 text-xs font-medium text-slate-700">
                  {p.fullName}
                  <button type="button" onClick={() => removeRecipient(p.userId)} className="rounded-full p-0.5 hover:bg-slate-200" aria-label={`Remove ${p.fullName}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              <button type="button" onClick={() => setExtraRecipients([])} className="text-xs font-medium text-slate-400 hover:text-slate-600 underline">
                Clear all
              </button>
            </div>
          )}
        </Field>

        {channel === 'email' && (
          <Field label="Subject" className="mb-4">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Upcoming reunion — save the date" />
          </Field>
        )}

        <Field label="Message" className="mb-2">
          <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={channel === 'email' ? 'Write your email...' : 'Write your SMS...'} />
        </Field>
        {channel === 'sms' && smsCount && (
          <p className="text-xs text-slate-400 mb-4">
            {smsCount.length} char{smsCount.length === 1 ? '' : 's'} · {smsCount.isUnicode ? 'Unicode' : 'GSM-7'} · {smsCount.charsPerSegment}/segment ·{' '}
            <span className="font-medium text-slate-600">
              {smsCount.segments} segment{smsCount.segments === 1 ? '' : 's'}
            </span>
          </p>
        )}

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 mb-4">
          {estimating ? (
            <p className="text-sm text-slate-400">Calculating...</p>
          ) : estimate ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{estimate.recipientCount}</span> recipient{estimate.recipientCount === 1 ? '' : 's'}
                {channel === 'sms' && estimate.segments > 1 && <> · {estimate.segments} segments each</>}
              </p>
              <p className="text-lg font-bold text-brand">{formatCurrency(estimate.estimatedCost, estimate.currency)}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Select a target audience or add specific people to see the estimated cost.</p>
          )}
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <Button onClick={onSend} disabled={!canSend || sending}>
          <Send size={15} className="mr-1.5" />
          {sending ? 'Sending...' : 'Send Outreach'}
        </Button>
      </Card>

      <Card>
        <SectionHeader title="Recent Outreach" />
        {campaignsLoading ? (
          <Loading />
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-slate-400">No outreach campaigns sent yet.</p>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <Link key={c.id} to={`/admin/outreach/${c.id}`} className="block">
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md border border-slate-200 hover:border-brand/30 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {c.channel === 'email' ? <Mail size={14} className="text-slate-400" /> : <MessageSquare size={14} className="text-slate-400" />}
                      <p className="font-medium text-sm truncate">{c.channel === 'email' ? c.subject : c.message.slice(0, 60)}</p>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {c.targetAlumni && c.targetStudents ? 'Alumni + Students' : c.targetAlumni ? 'Alumni' : 'Students'} · {c.recipientCount} recipients · {formatDateTime(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-medium text-slate-700">{formatCurrency(c.estimatedCost, c.currency)}</span>
                    <Badge tone={STATUS_TONE[c.status] ?? 'default'}>{c.status.replace(/_/g, ' ')}</Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        <Pagination page={campaignsPage} total={campaignsTotal} pageSize={20} onChange={setCampaignsPage} />
      </Card>
    </div>
  )
}
