import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { useInView } from '../../hooks/useInView'

export function Button({ className, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-dark',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }
  return (
    <button
      className={cn(
        // min-h-11 (44px) meets the native touch-target guideline on mobile; desktop keeps the
        // tighter py-2 look since mouse pointers don't need the extra hit area.
        'inline-flex items-center justify-center rounded-md px-4 py-2 min-h-11 md:min-h-0 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-md border border-slate-300 px-3 py-2 min-h-11 md:min-h-0 text-sm outline-none focus:ring-2 focus:ring-brand focus:border-brand',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: import('react').TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand focus:border-brand resize-y',
        className,
      )}
      {...props}
    />
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-lg border border-slate-200 bg-white p-4 shadow-sm', className)}>{children}</div>
}

export function Select({ className, children, ...props }: import('react').SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-md border border-slate-300 px-3 py-2 min-h-11 md:min-h-0 text-sm outline-none focus:ring-2 focus:ring-brand focus:border-brand bg-white',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="text-sm font-medium text-slate-700 block mb-1.5">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-400 block mt-1">{hint}</span>}
    </label>
  )
}

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
    </div>
  )
}

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-cyan-100 text-cyan-700',
]

function initialsOf(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('')
}

function paletteFor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[hash]
}

/** Photo if available, else a deterministic color + initials — never a blank gray circle. */
export function Avatar({ name, url, size = 'md' }: { name: string; url?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'w-9 h-9 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-20 h-20 text-xl' }[size]
  if (url) {
    return <img src={url} alt={name} className={cn('rounded-full object-cover shrink-0', dims)} />
  }
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold shrink-0', dims, paletteFor(name || '?'))}>
      {initialsOf(name) || '?'}
    </div>
  )
}

export function CardGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-200 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="text-center py-12 text-slate-500">
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm mt-1">{description}</p>}
    </div>
  )
}

export function Loading() {
  return <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
}

// Scroll-triggered entrance: fades/slides children in once they enter the viewport.
// `tag` lets callers keep semantic elements (e.g. `<Reveal tag="section">`) without an extra wrapper div.
export function Reveal({
  children,
  className,
  delayMs = 0,
  tag = 'div',
}: {
  children: ReactNode
  className?: string
  delayMs?: number
  tag?: keyof HTMLElementTagNameMap
}) {
  const [ref, inView] = useInView<HTMLElement>()
  const Tag = tag as unknown as 'div'
  return (
    <Tag ref={ref as never} className={cn('reveal', inView && 'reveal-in', className)} style={{ transitionDelay: `${delayMs}ms` }}>
      {children}
    </Tag>
  )
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'urgent' | 'important' }) {
  const tones = {
    default: 'bg-slate-100 text-slate-700',
    important: 'bg-amber-100 text-amber-800',
    urgent: 'bg-red-100 text-red-800',
  }
  return <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2 py-6">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span className="text-sm text-slate-600">
        Page {page} of {totalPages}
      </span>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  )
}
