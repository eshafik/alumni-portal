export interface User {
  id: number
  institutionId: number
  roleId: number
  fullName: string
  email: string
  phone: string
  status: 'pending_verification' | 'pending_approval' | 'approved' | 'rejected' | 'suspended'
  moderatorScopeDepartmentId?: number
  moderatorScopeBatchId?: number
  createdAt: string
  // False only for approved alumni/students with no avatar set yet — drives the mandatory
  // profile-setup redirect. Always true for Admin/SuperAdmin/Moderator (gate never applies).
  hasAvatar: boolean
}

export const ROLE = {
  SuperAdmin: 1,
  Admin: 2,
  Moderator: 3,
  Alumni: 4,
  Student: 5,
} as const

export interface Institution {
  id: number
  name: string
  shortName: string
  slug: string
  institutionType: string
  description: string
  tagline: string
  address: string
  website: string
  contactEmail: string
  aboutText: string
  missionText: string
  themeColor: string
  socialLinks: string
  logoAttachmentId?: number
  logoUrl?: string
}

export interface GalleryImage {
  id: number
  attachmentId: number
  imageUrl: string
  caption: string
  sortOrder: number
  isActive: boolean
}

export interface Department {
  id: number
  name: string
  code: string
}

export interface Program {
  id: number
  departmentId: number
  name: string
  degreeLevel: string
}

export interface Batch {
  id: number
  programId: number
  startYear: number
  endYear: number
  label: string
}

export interface BloodGroup {
  id: number
  name: string
  isActive: boolean
  sortOrder: number
}

export interface AlumniDirectoryRow {
  userId: number
  fullName: string
  avatarAttachmentId?: number
  avatarUrl?: string
  batchLabel: string
  programName: string
  departmentName: string
  currentDesignation: string
  currentLocation?: string
  companyName?: string
  bloodGroupName: string
}

export interface StudentDirectoryRow {
  userId: number
  fullName: string
  avatarAttachmentId?: number
  avatarUrl?: string
  batchLabel: string
  programName: string
  departmentName: string
  bloodGroupName: string
}

export interface Event {
  id: number
  slug: string
  title: string
  description: string
  coverAttachmentId?: number
  coverUrl?: string
  startAt: string
  endAt?: string
  venue: string
  onlineUrl: string
  registrationDeadline?: string
  capacity?: number
  status: string
  isPublic: boolean
  registrationUrl?: string
  responseUrl?: string
}

export interface Notice {
  id: number
  title: string
  body: string
  importance: 'normal' | 'important' | 'urgent'
  pinned: boolean
  isPublic: boolean
  imageAttachmentId?: number
  imageUrl?: string
  publishedAt: string
}

export interface JobPost {
  id: number
  postedByUserId: number
  title: string
  companyName: string
  location: string
  employmentType: string
  description: string
  salary: string
  applyUrl: string
  applyEmail: string
  imageAttachmentId?: number
  imageUrl?: string
  postedByName?: string
  postedByAvatarUrl?: string
  deadline?: string
  createdAt: string
}

export interface Business {
  id: number
  name: string
  category: string
  description: string
  location: string
  website: string
  contactPhone: string
  contactEmail: string
  logoAttachmentId?: number
}

export interface Committee {
  id: number
  institutionId: number
  termStart: number
  termEnd: number
  isCurrent: boolean
  createdAt: string
}

export interface CommitteeMemberInfo {
  userId: number
  fullName: string
  avatarAttachmentId?: number
  avatarUrl?: string
}

export interface CommitteePositionWithMembers {
  id: number
  committeeId: number
  title: string
  isDefaultAdmin: boolean
  isActive: boolean
  sortOrder: number
  members: CommitteeMemberInfo[]
}

export interface PagedResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}
