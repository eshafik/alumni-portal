import { api } from './client'
import type { User, PagedResult, Institution, GalleryImage } from '../types/api'

export interface PendingRegistration {
  userId: number
  fullName: string
  email: string
  phone: string
  roleId: number
  status: 'pending_verification' | 'pending_approval' | 'rejected'
  batchLabel: string
  departmentName: string
  createdAt: string
}

export const adminApi = {
  pendingRegistrations: (page = 1) =>
    api.get<PagedResult<PendingRegistration>>(`/api/moderator/pending-registrations?page=${page}`),
  rejectedRegistrations: (page = 1) =>
    api.get<PagedResult<PendingRegistration>>(`/api/moderator/rejected-registrations?page=${page}`),
  approve: (userId: number) => api.post(`/api/moderator/pending-registrations/${userId}/approve`),
  reject: (userId: number, reason: string) =>
    api.post(`/api/moderator/pending-registrations/${userId}/reject`, { reason }),
  listUsers: (page = 1, q = '', status = '', roleId = '') =>
    api.get<PagedResult<User>>(`/api/admin/users?page=${page}&q=${encodeURIComponent(q)}&status=${status}&roleId=${roleId}`),
  updateUserRole: (userId: number, roleId: number, moderatorScopeDepartmentId?: number | null, moderatorScopeBatchId?: number | null) =>
    api.put(`/api/admin/users/${userId}/role`, { roleId, moderatorScopeDepartmentId: moderatorScopeDepartmentId ?? null, moderatorScopeBatchId: moderatorScopeBatchId ?? null }),
  updateUserStatus: (userId: number, status: string, reason = '') =>
    api.put(`/api/admin/users/${userId}/status`, { status, reason }),
  convertBatchToAlumni: (batchId: number) => api.post<{ message: string; count: number }>(`/api/admin/batches/${batchId}/convert-to-alumni`),
  revertBatchConversion: (batchId: number) => api.post(`/api/admin/batches/${batchId}/revert-conversion`),
  updateInstitution: (payload: Partial<Institution>) => api.put('/api/admin/institution', payload),
  createGalleryImage: (attachmentId: number, caption: string, sortOrder: number) =>
    api.post<GalleryImage>('/api/admin/home-gallery', { attachmentId, caption, sortOrder }),
  updateGalleryImage: (id: number, payload: { caption: string; sortOrder: number; isActive: boolean }) =>
    api.put(`/api/admin/home-gallery/${id}`, payload),
  deleteGalleryImage: (id: number) => api.delete(`/api/admin/home-gallery/${id}`),
}

export interface AuditLogEntry {
  id: number
  actorUserId?: number
  actorName?: string
  action: string
  entityType: string
  entityId?: number
  beforeJson: string
  afterJson: string
  createdAt: string
}

export const auditApi = {
  list: (page = 1, userId = '') => api.get<PagedResult<AuditLogEntry>>(`/api/admin/audit-logs?page=${page}&userId=${userId}`),
}
