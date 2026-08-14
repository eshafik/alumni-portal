import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="hidden md:block border-t border-slate-200 mt-16 py-8 text-sm text-slate-500">
      <div className="mx-auto max-w-6xl px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} Alumni Portal. All rights reserved.</p>
        <div className="flex gap-4">
          <Link to="/login" className="hover:text-slate-700">
            Login
          </Link>
          <Link to="/privacy" className="hover:text-slate-700">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-slate-700">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  )
}
