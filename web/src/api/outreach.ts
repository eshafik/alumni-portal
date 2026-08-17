import { api } from './client'
import type { PagedResult } from '../types/api'

export interface OutreachConfig {
  emailEnabled: boolean
  smsEnabled: boolean
  emailCostPerUnit: number
  emailCostCurrency: string
  smsCostPerUnit: number
  smsCostCurrency: string
}

export interface OutreachFilters {
  batchId?: string
  departmentId?: string
  programId?: string
  bloodGroupId?: string
}

export interface OutreachEstimate {
  recipientCount: number
  segments: number
  unitCost: number
  estimatedCost: number
  currency: string
}

export interface OutreachCampaign {
  id: number
  channel: 'email' | 'sms'
  subject: string
  message: string
  targetAlumni: boolean
  targetStudents: boolean
  filtersJson: string
  smsSegments: number
  recipientCount: number
  estimatedCost: number
  currency: string
  status: 'queued' | 'processing' | 'completed' | 'completed_with_errors'
  successCount: number
  failedCount: number
  createdByUserId?: number
  createdAt: string
  completedAt?: string
}

export interface OutreachRecipientLog {
  id: number
  campaignId: number
  userId?: number
  recipientName: string
  recipientEmail: string
  recipientPhone: string
  status: 'pending' | 'sent' | 'failed'
  statusCode: string
  errorMessage: string
  attempts: number
  sentAt?: string
}

export interface OutreachRequestPayload {
  channel: 'email' | 'sms'
  subject?: string
  message: string
  targetAlumni: boolean
  targetStudents: boolean
  filters: OutreachFilters
  extraUserIds?: number[]
}

export interface OutreachUserSearchResult {
  userId: number
  fullName: string
  email: string
  phone: string
  roleId: number
}

export const outreachApi = {
  config: () => api.get<OutreachConfig>('/api/admin/outreach/config'),
  estimate: (payload: OutreachRequestPayload) => api.post<OutreachEstimate>('/api/admin/outreach/estimate', payload),
  send: (payload: OutreachRequestPayload) => api.post<OutreachCampaign>('/api/admin/outreach/campaigns', payload),
  list: (page = 1) => api.get<PagedResult<OutreachCampaign>>(`/api/admin/outreach/campaigns?page=${page}`),
  get: (id: number) => api.get<OutreachCampaign>(`/api/admin/outreach/campaigns/${id}`),
  logs: (id: number, page = 1, status = '', q = '') =>
    api.get<PagedResult<OutreachRecipientLog>>(
      `/api/admin/outreach/campaigns/${id}/logs?page=${page}&status=${status}&q=${encodeURIComponent(q)}`,
    ),
  searchRecipients: (q: string) => api.get<OutreachUserSearchResult[]>(`/api/admin/outreach/search-recipients?q=${encodeURIComponent(q)}`),
}
