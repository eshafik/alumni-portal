import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Mail, MessageSquare, Search } from 'lucide-react'
import { outreachApi, type OutreachCampaign, type OutreachRecipientLog } from '../../api/outreach'
import { useDebounce } from '../../hooks/useDebounce'
import { formatCurrency, formatDateTime } from '../../lib/utils'
import { Card, Badge, Loading, Pagination, Input, Select, SectionHeader } from '../../components/shared/ui'

const STATUS_TONE = {
  queued: 'default',
  processing: 'important',
  completed: 'success',
  completed_with_errors: 'urgent',
} as const

const LOG_STATUS_TONE = {
  pending: 'default',
  sent: 'success',
  failed: 'urgent',
} as const

export default function AdminOutreachDetail() {
  const { id } = useParams<{ id: string }>()
  const campaignId = Number(id)

  const [campaign, setCampaign] = useState<OutreachCampaign | null>(null)
  const [loading, setLoading] = useState(true)

  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [page, setPage] = useState(1)
  const [logs, setLogs] = useState<OutreachRecipientLog[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsLoading, setLogsLoading] = useState(true)

  useEffect(() => {
    outreachApi
      .get(campaignId)
      .then(setCampaign)
      .finally(() => setLoading(false))
  }, [campaignId])

  useEffect(() => {
    setLogsLoading(true)
    outreachApi
      .logs(campaignId, page, status, debouncedQ)
      .then((res) => {
        setLogs(res.items ?? [])
        setLogsTotal(res.total)
      })
      .finally(() => setLogsLoading(false))
  }, [campaignId, page, status, debouncedQ])

  if (loading) return <Loading />
  if (!campaign) return <p className="text-sm text-slate-400">Campaign not found.</p>

  return (
    <div>
      <Link to="/admin/outreach" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft size={15} /> Back to Outreach
      </Link>

      <Card className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            {campaign.channel === 'email' ? <Mail size={18} className="text-slate-400" /> : <MessageSquare size={18} className="text-slate-400" />}
            <h1 className="text-lg font-semibold text-slate-900">{campaign.channel === 'email' ? campaign.subject : 'SMS Campaign'}</h1>
          </div>
          <Badge tone={STATUS_TONE[campaign.status] ?? 'default'}>{campaign.status.replace(/_/g, ' ')}</Badge>
        </div>

        <p className="text-sm text-slate-600 whitespace-pre-wrap mb-5 p-3 rounded-md bg-slate-50 border border-slate-100">{campaign.message}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{campaign.recipientCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Recipients</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600 tabular-nums">{campaign.successCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Sent</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600 tabular-nums">{campaign.failedCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Failed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-brand tabular-nums">{formatCurrency(campaign.estimatedCost, campaign.currency)}</p>
            <p className="text-xs text-slate-500 mt-0.5">Estimated cost</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          {campaign.targetAlumni && campaign.targetStudents ? 'Alumni + Students' : campaign.targetAlumni ? 'Alumni' : 'Students'} · Sent {formatDateTime(campaign.createdAt)}
          {campaign.completedAt && <> · Completed {formatDateTime(campaign.completedAt)}</>}
        </p>
      </Card>

      <Card>
        <SectionHeader title="Delivery Log" description="Per-recipient send status." />
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by email or phone..."
              className="pl-9"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            className="w-auto min-w-[140px]"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </Select>
        </div>

        {logsLoading ? (
          <Loading />
        ) : logs.length === 0 ? (
          <p className="text-sm text-slate-400">No log entries match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 pr-4 font-medium">Recipient</th>
                  <th className="pb-2 pr-4 font-medium">Contact</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Code</th>
                  <th className="pb-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="py-2 pr-4 whitespace-nowrap">{l.recipientName}</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-500">{campaign.channel === 'email' ? l.recipientEmail : l.recipientPhone}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={LOG_STATUS_TONE[l.status] ?? 'default'}>{l.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{l.statusCode || '—'}</td>
                    <td className="py-2 text-slate-500 max-w-xs truncate" title={l.errorMessage}>
                      {l.errorMessage || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={logsTotal} pageSize={20} onChange={setPage} />
      </Card>
    </div>
  )
}
