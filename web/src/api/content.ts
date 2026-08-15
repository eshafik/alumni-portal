import { api } from './client'
import type { Event, Notice, JobPost, Business, GalleryImage, PagedResult, Committee, CommitteePositionWithMembers } from '../types/api'

export const committeesApi = {
  list: () => api.get<Committee[]>('/api/committees'),
  current: () => api.get<{ committee: Committee; positions: CommitteePositionWithMembers[] }>('/api/committees/current'),
  get: (id: number) => api.get<{ committee: Committee; positions: CommitteePositionWithMembers[] }>(`/api/committees/${id}`),
}

export interface CreateCommitteePayload {
  termStart: number
  termEnd: number
}

export const adminCommitteesApi = {
  create: (payload: CreateCommitteePayload) => api.post<{ committeeId: number }>('/api/admin/committees', payload),
  createPosition: (committeeId: number, title: string, sortOrder: number) =>
    api.post<{ id: number }>(`/api/admin/committees/${committeeId}/positions`, { title, sortOrder }),
  addMember: (positionId: number, userId: number) =>
    api.post<{ message: string }>(`/api/admin/committee-positions/${positionId}/members`, { userId }),
  removeMember: (positionId: number, userId: number) =>
    api.delete(`/api/admin/committee-positions/${positionId}/members/${userId}`),
}

export const eventsApi = {
  list: (page = 1, q = '') => api.get<PagedResult<Event>>(`/api/events?page=${page}&q=${encodeURIComponent(q)}`),
  get: (slug: string) => api.get<{ event: Event; registeredCount: number }>(`/api/events/${slug}`),
  register: (slug: string) => api.post<{ status: string }>(`/api/events/${slug}/register`),
  cancelRegistration: (slug: string) => api.delete(`/api/events/${slug}/register`),
}

export interface UpsertEventPayload {
  title: string
  description: string
  coverAttachmentId: number | null
  startAt: string
  endAt: string | null
  venue: string
  onlineUrl: string
  registrationDeadline: string | null
  capacity: number | null
  isPublic: boolean
  registrationUrl: string | null
  responseUrl: string | null
}

export interface AdminEventDetail extends Event {
  responseUrl?: string
}

export interface EventRegistrationRow {
  userId: number
  fullName: string
  email: string
  status: 'registered' | 'waitlisted' | 'cancelled'
  registeredAt: string
}

export const adminEventsApi = {
  create: (payload: UpsertEventPayload) => api.post<Event>('/api/admin/events', payload),
  update: (id: number, payload: UpsertEventPayload) => api.put<{ message: string }>(`/api/admin/events/${id}`, payload),
  delete: (id: number) => api.delete(`/api/admin/events/${id}`),
  getById: (id: number) => api.get<AdminEventDetail>(`/api/admin/events/${id}`),
  listRegistrations: (id: number) => api.get<EventRegistrationRow[]>(`/api/admin/events/${id}/registrations`),
  registrationsCsvUrl: (id: number) => `/api/admin/events/${id}/registrations.csv`,
}

export const noticesApi = {
  list: (page = 1, q = '') => api.get<PagedResult<Notice>>(`/api/notices?page=${page}&q=${encodeURIComponent(q)}`),
  get: (id: number) => api.get<Notice>(`/api/notices/${id}`),
}

export interface UpsertNoticePayload {
  title: string
  body: string
  importance: 'normal' | 'important' | 'urgent'
  pinned: boolean
  isPublic: boolean
  imageAttachmentId: number | null
}

export const adminNoticesApi = {
  create: (payload: UpsertNoticePayload) => api.post<Notice>('/api/notices', payload),
  update: (id: number, payload: UpsertNoticePayload) => api.put<{ message: string }>(`/api/notices/${id}`, payload),
  delete: (id: number) => api.delete(`/api/notices/${id}`),
}

export interface CreateJobPayload {
  title: string
  companyName: string
  location: string
  employmentType: string
  description: string
  salary: string
  applyUrl: string
  applyEmail: string
  imageAttachmentId: number | null
  deadline: string | null
}

export const jobsApi = {
  list: (page = 1, q = '') => api.get<PagedResult<JobPost>>(`/api/jobs?page=${page}&q=${encodeURIComponent(q)}`),
  get: (id: number) => api.get<JobPost>(`/api/jobs/${id}`),
  create: (payload: CreateJobPayload) => api.post<JobPost>('/api/jobs', payload),
  update: (id: number, payload: CreateJobPayload) => api.put<JobPost>(`/api/jobs/${id}`, payload),
  delete: (id: number) => api.delete(`/api/jobs/${id}`),
}

export const galleryApi = {
  list: () => api.get<GalleryImage[]>('/api/home-gallery'),
}

export interface CreateBusinessPayload {
  name: string
  category: string
  description: string
  location: string
  website: string
  contactPhone: string
  contactEmail: string
  logoAttachmentId: number | null
}

export const businessesApi = {
  list: (q = '', page = 1) => api.get<PagedResult<Business>>(`/api/businesses?q=${encodeURIComponent(q)}&page=${page}`),
  get: (id: number) => api.get<Business>(`/api/businesses/${id}`),
  create: (payload: CreateBusinessPayload) => api.post<Business>('/api/businesses', payload),
  update: (id: number, payload: CreateBusinessPayload) => api.put<Business>(`/api/businesses/${id}`, payload),
  delete: (id: number) => api.delete(`/api/businesses/${id}`),
}
