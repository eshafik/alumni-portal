import { api } from './client'
import type { Institution, Department, Program, Batch, BloodGroup, AlumniDirectoryRow, PagedResult } from '../types/api'

export const institutionApi = {
  get: () => api.get<{ institution: Institution; stats: Record<string, number> }>('/api/institution'),
}

export const configApi = {
  departments: () => api.get<Department[]>('/api/departments'),
  programs: (departmentId?: number) =>
    api.get<Program[]>(`/api/programs${departmentId ? `?departmentId=${departmentId}` : ''}`),
  batches: (programId?: number) =>
    api.get<Batch[]>(`/api/batches${programId ? `?programId=${programId}` : ''}`),
  bloodGroups: () => api.get<BloodGroup[]>('/api/blood-groups'),
}

export interface AlumniSearchParams {
  q?: string
  batchId?: string
  departmentId?: string
  programId?: string
  location?: string
  company?: string
  bloodGroupId?: string
  skill?: string
  page?: number
}

export const alumniApi = {
  list: (params: AlumniSearchParams) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    })
    return api.get<PagedResult<AlumniDirectoryRow>>(`/api/alumni?${qs.toString()}`)
  },
  get: (userId: number) => api.get(`/api/alumni/${userId}`),
  getMe: () => api.get('/api/alumni/me'),
  updateMe: (payload: unknown) => api.put('/api/alumni/me', payload),
}
