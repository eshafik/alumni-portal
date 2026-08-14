import { api } from './client'
import type { Department, Program, Batch, BloodGroup } from '../types/api'

export const taxonomyApi = {
  createDepartment: (name: string, code: string) => api.post<Department>('/api/admin/departments', { name, code }),
  updateDepartment: (id: number, name: string, code: string) =>
    api.put<Department>(`/api/admin/departments/${id}`, { name, code }),
  deleteDepartment: (id: number) => api.delete(`/api/admin/departments/${id}`),

  createProgram: (departmentId: number, name: string, degreeLevel: string) =>
    api.post<Program>('/api/admin/programs', { departmentId, name, degreeLevel }),
  updateProgram: (id: number, name: string, degreeLevel: string) =>
    api.put<Program>(`/api/admin/programs/${id}`, { name, degreeLevel }),
  deleteProgram: (id: number) => api.delete(`/api/admin/programs/${id}`),

  createBatch: (programId: number, startYear: number, endYear: number, label: string) =>
    api.post<Batch>('/api/admin/batches', { programId, startYear, endYear, label }),
  updateBatch: (id: number, startYear: number, endYear: number, label: string) =>
    api.put<Batch>(`/api/admin/batches/${id}`, { startYear, endYear, label }),
  deleteBatch: (id: number) => api.delete(`/api/admin/batches/${id}`),

  createBloodGroup: (name: string, sortOrder: number) =>
    api.post<BloodGroup>('/api/admin/blood-groups', { name, sortOrder }),
  updateBloodGroup: (id: number, name: string, sortOrder: number) =>
    api.put<BloodGroup>(`/api/admin/blood-groups/${id}`, { name, sortOrder }),
  deleteBloodGroup: (id: number) => api.delete(`/api/admin/blood-groups/${id}`),
}
