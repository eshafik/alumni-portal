import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { InstitutionProvider } from './hooks/useInstitution'
import { ConfirmProvider } from './hooks/useConfirm'
import { Shell } from './components/layout/Shell'
import { AdminShell } from './components/layout/AdminShell'
import { RequireApproved, RequireRole } from './components/shared/RoleGate'
import { ROLE } from './types/api'

import Home from './routes/public/Home'
import Login from './routes/public/Login'
import Signup from './routes/public/Signup'
import VerifyOtp from './routes/public/VerifyOtp'
import ForgotPassword from './routes/public/ForgotPassword'
import Directory from './routes/public/Directory'
import AlumniProfile from './routes/public/AlumniProfile'
import StudentsList from './routes/public/StudentsList'
import EventsList from './routes/public/EventsList'
import EventDetail from './routes/public/EventDetail'
import NoticesList from './routes/public/NoticesList'
import NoticeDetail from './routes/public/NoticeDetail'
import JobsList from './routes/public/JobsList'
import JobDetail from './routes/public/JobDetail'
import BusinessesList from './routes/public/BusinessesList'
import BusinessDetail from './routes/public/BusinessDetail'
import CommitteePage from './routes/public/CommitteePage'
import { Privacy, Terms, NotFound } from './routes/public/Static'
import PendingApproval from './routes/protected/PendingApproval'
import Profile from './routes/protected/Profile'
import CompleteProfile from './routes/protected/CompleteProfile'
import JobCreate from './routes/protected/JobCreate'
import BusinessCreate from './routes/protected/BusinessCreate'
import AdminDashboard from './routes/admin/AdminDashboard'
import AdminInstitutionSettings from './routes/admin/AdminInstitutionSettings'
import AdminTaxonomy from './routes/admin/AdminTaxonomy'
import AdminNotices from './routes/admin/AdminNotices'
import AdminEvents from './routes/admin/AdminEvents'
import AdminCommittee from './routes/admin/AdminCommittee'
import AdminUsers from './routes/admin/AdminUsers'
import AdminAuditLog from './routes/admin/AdminAuditLog'
import AdminOutreach from './routes/admin/AdminOutreach'
import AdminOutreachDetail from './routes/admin/AdminOutreachDetail'

export default function App() {
  return (
    <BrowserRouter>
      <InstitutionProvider>
        <AuthProvider>
        <ConfirmProvider>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Home />} />
              <Route path="login" element={<Login />} />
              <Route path="signup" element={<Signup />} />
              <Route path="verify-otp" element={<VerifyOtp />} />
              <Route path="forgot-password" element={<ForgotPassword />} />
              <Route path="directory" element={<Directory />} />
              <Route path="directory/:id" element={<AlumniProfile />} />
              <Route path="students" element={<StudentsList />} />
              <Route path="events" element={<EventsList />} />
              <Route path="events/:slug" element={<EventDetail />} />
              <Route path="notices" element={<NoticesList />} />
              <Route path="notices/:id" element={<NoticeDetail />} />
              <Route path="jobs" element={<JobsList />} />
              <Route path="jobs/:id" element={<JobDetail />} />
              <Route path="businesses" element={<BusinessesList />} />
              <Route path="businesses/:id" element={<BusinessDetail />} />
              <Route path="committee" element={<CommitteePage />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
              <Route path="pending-approval" element={<PendingApproval />} />

              <Route element={<RequireApproved />}>
                <Route path="profile" element={<Profile />} />
                <Route path="complete-profile" element={<CompleteProfile />} />
                <Route path="jobs/new" element={<JobCreate />} />
                <Route path="jobs/:id/edit" element={<JobCreate />} />
                <Route path="businesses/new" element={<BusinessCreate />} />
              </Route>

              <Route element={<RequireRole roles={[ROLE.SuperAdmin, ROLE.Admin, ROLE.Moderator]} />}>
                <Route element={<AdminShell />}>
                  <Route path="admin" element={<AdminDashboard />} />
                  <Route element={<RequireRole roles={[ROLE.SuperAdmin, ROLE.Admin]} />}>
                    <Route path="admin/settings" element={<AdminInstitutionSettings />} />
                    <Route path="admin/taxonomy" element={<AdminTaxonomy />} />
                    <Route path="admin/notices" element={<AdminNotices />} />
                    <Route path="admin/events" element={<AdminEvents />} />
                    <Route path="admin/committee" element={<AdminCommittee />} />
                    <Route path="admin/users" element={<AdminUsers />} />
                    <Route path="admin/outreach" element={<AdminOutreach />} />
                    <Route path="admin/outreach/:id" element={<AdminOutreachDetail />} />
                    <Route path="admin/activity" element={<AdminAuditLog />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ConfirmProvider>
        </AuthProvider>
      </InstitutionProvider>
    </BrowserRouter>
  )
}
