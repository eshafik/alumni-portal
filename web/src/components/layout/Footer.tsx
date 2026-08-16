import { Link } from 'react-router-dom'
import { Link as LinkIcon, Globe } from 'lucide-react'

// Visible on every breakpoint (including installed-PWA standalone mode, which has no browser
// chrome to fall back on) — the mobile bottom padding mirrors <main>'s own pb-24 clearance for
// the fixed BottomTabBar (see Shell.tsx) so the credit band never sits underneath it.
export function Footer() {
  return (
    <footer className="border-t border-slate-200 mt-16 pt-6 pb-[calc(6rem+var(--safe-bottom))] md:pb-8 text-sm text-slate-500">
      <div className="mx-auto max-w-6xl px-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-400">
        <Link to="/login" className="hover:text-slate-600">
          Login
        </Link>
        <Link to="/privacy" className="hover:text-slate-600">
          Privacy
        </Link>
        <Link to="/terms" className="hover:text-slate-600">
          Terms
        </Link>
      </div>

      <div className="mx-auto max-w-6xl px-4 mt-6 pt-6 border-t border-slate-100 flex flex-col items-center gap-2.5">
        <p className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">Powered by</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://www.linkedin.com/in/shafikte/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:border-brand hover:bg-brand hover:text-white transition-colors"
          >
            <LinkIcon size={13} />
            MSI Shafik
          </a>
          <a
            href="https://technurah.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:border-brand hover:bg-brand hover:text-white transition-colors"
          >
            <Globe size={13} />
            Technurah
          </a>
        </div>
      </div>
    </footer>
  )
}
