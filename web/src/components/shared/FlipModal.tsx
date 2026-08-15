import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

// A centered modal that flips in (3D rotateY) instead of the page navigating away — used for
// alumni/student "quick view" cards so browsing the directory never leaves the grid/scroll
// position behind. Closes on backdrop click or Escape.
export function FlipModal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-backdrop-in"
      style={{ perspective: '1200px' }}
      onClick={onClose}
    >
      <div className="animate-flip-in w-full max-w-lg max-h-[85vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/90 text-slate-500 hover:text-slate-900 shadow-sm"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  )
}
