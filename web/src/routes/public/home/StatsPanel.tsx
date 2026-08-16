import { useEffect, useState } from 'react'
import { Users, GraduationCap } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useInView } from '../../../hooks/useInView'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

// Counts 0 -> target once `active`, easeOutCubic. Jumps straight to target under reduced-motion.
function useCountUp(target: number, active: boolean, durationMs = 900) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active) return
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      setValue(target)
      return
    }
    let raf: number
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(eased * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, target, durationMs])
  return value
}

interface StatsPanelProps {
  alumniCount: number
  batchCount: number
}

// Floating glass panel meant to be rendered as a sibling right after <HeroSection>, pulled up
// over the hero's bottom edge via negative margin — the panel itself *is* the hero-to-page
// transition, so there's no leftover empty gap to tune. Renders nothing while there's no data
// yet (an empty glass panel would look broken, not just quiet).
export function StatsPanel({ alumniCount: alumniTarget, batchCount: batchTarget }: StatsPanelProps) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const alumniCount = useCountUp(alumniTarget, inView)
  const batchCount = useCountUp(batchTarget, inView)

  if (alumniTarget <= 0) return null

  return (
    <div className="relative z-10 -mt-10 sm:-mt-14 px-4">
      <div
        ref={ref}
        className={cn(
          'reveal mx-auto max-w-3xl grid grid-cols-2 divide-x divide-slate-200/70 rounded-2xl border border-white/60 bg-white/90 backdrop-blur-md shadow-xl shadow-brand/10 overflow-hidden',
          inView && 'reveal-in',
        )}
      >
        <div className="p-6 sm:p-7 text-center">
          <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto mb-2">
            <Users size={18} />
          </div>
          <p className="text-4xl font-bold text-brand tabular-nums">{alumniCount}</p>
          <p className="text-sm text-slate-500 mt-1">Alumni</p>
        </div>
        <div className="p-6 sm:p-7 text-center">
          <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto mb-2">
            <GraduationCap size={18} />
          </div>
          <p className="text-4xl font-bold text-brand tabular-nums">{batchCount}</p>
          <p className="text-sm text-slate-500 mt-1">Batches</p>
        </div>
      </div>
    </div>
  )
}
