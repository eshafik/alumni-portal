import { api } from './client'
import type { User } from '../types/api'

export interface SignupPayload {
  fullName: string
  email: string
  phone: string
  password: string
  departmentId: number
  programId: number
  batchId: number
  bloodGroupId: number
  accountType: 'alumni' | 'student'
  currentDesignation?: string
  companyName?: string
}

// cooldownSeconds is the server's authoritative "seconds until the next resend is allowed" —
// always present, and safe to display even for accounts that may not exist (it reflects OTP
// subsystem timing, not account state). The client-side countdown is seeded from this value
// rather than a hardcoded constant so it never drifts from what the server actually enforces.
export interface OTPResponse {
  message: string
  cooldownSeconds: number
}

export const authApi = {
  me: () => api.get<User>('/api/auth/me'),
  login: (email: string, password: string) => api.post<User>('/api/auth/login', { email, password }),
  logout: () => api.post('/api/auth/logout'),
  signup: (payload: SignupPayload) => api.post<OTPResponse>('/api/auth/signup', payload),
  verifyOtp: (email: string, code: string) =>
    api.post<{ message: string }>('/api/auth/otp/verify', { email, code }),
  resendOtp: (email: string) => api.post<OTPResponse>('/api/auth/otp/resend', { email }),
  forgotPassword: (email: string) => api.post<OTPResponse>('/api/auth/password/forgot', { email }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    api.post<{ message: string }>('/api/auth/password/reset', { email, code, newPassword }),
}
