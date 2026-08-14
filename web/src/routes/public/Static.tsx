export function Privacy() {
  return (
    <div className="max-w-2xl mx-auto prose prose-sm">
      <h1 className="text-2xl font-semibold mb-4">Privacy Policy</h1>
      <p className="text-slate-600">
        We collect the information you provide during registration and profile management to
        operate the alumni directory. You control the visibility of sensitive fields (email,
        phone, WhatsApp, location, company) from your profile settings. We never sell your data.
      </p>
    </div>
  )
}

export function Terms() {
  return (
    <div className="max-w-2xl mx-auto prose prose-sm">
      <h1 className="text-2xl font-semibold mb-4">Terms of Use</h1>
      <p className="text-slate-600">
        This portal is provided for the exclusive use of verified alumni, students, and staff of
        the institution. Membership is subject to approval. Misuse of the platform may result in
        suspension.
      </p>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="text-center py-24">
      <h1 className="text-3xl font-semibold mb-2">404</h1>
      <p className="text-slate-500">Page not found.</p>
    </div>
  )
}
