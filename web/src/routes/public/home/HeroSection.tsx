import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Sparkles } from 'lucide-react'
import { Button, Reveal } from '../../../components/shared/ui'
import { ImageSlider } from '../../../components/shared/ImageSlider'
import type { GalleryImage, Institution } from '../../../types/api'

const DEFAULT_TAGLINE = 'Connect. Remember. Grow Together.'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

// Subtle rAF-throttled parallax shift for the hero's decorative blurred blobs. No-op under reduced-motion.
function useParallax(maxShift = 20) {
  const ref = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)

  useEffect(() => {
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = ref.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const progress = Math.max(-1, Math.min(1, rect.top / (window.innerHeight || 1)))
        setShift(progress * maxShift)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [maxShift])

  return [ref, shift] as const
}

interface HeroSectionProps {
  institution: Institution | null
  gallery: GalleryImage[]
  description: string
  showExploreButton: boolean
}

// Layered mesh-gradient hero: every decorative color is derived from --color-brand (white
// overlays + the --color-brand-dark token, both admin-theme-agnostic — see
// AdminInstitutionSettings.tsx's brand color picker and useInstitution.tsx's runtime override)
// so this never clashes regardless of an institution's chosen brand color.
export function HeroSection({ institution, gallery, description, showExploreButton }: HeroSectionProps) {
  const [heroRef, heroShift] = useParallax()

  return (
    <Reveal tag="section" className="text-center pt-4">
      <div className="relative -mx-4 sm:mx-0 sm:rounded-2xl bg-gradient-to-br from-brand via-brand to-brand-dark py-20 sm:py-24 px-6 text-white overflow-hidden">
        <div
          ref={heroRef}
          className="pointer-events-none absolute -top-24 -left-16 w-72 h-72 rounded-full bg-white/10 blur-3xl"
          style={{ transform: `translateY(${heroShift}px)` }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-brand-dark/50 blur-3xl"
          style={{ transform: `translateY(${-heroShift}px)` }}
        />
        <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-white/5 blur-[100px]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />

        <div className="relative">
          {institution?.name && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm px-3 py-1 text-xs font-medium text-white/90 mb-5">
              <Sparkles size={12} /> {institution.name}
            </span>
          )}

          {gallery.length > 0 && (
            <div className="max-w-3xl mx-auto mb-8 rounded-xl overflow-hidden shadow-lg shadow-black/20 ring-1 ring-white/10">
              <ImageSlider images={gallery} />
            </div>
          )}

          <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight text-balance">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              {institution?.tagline || DEFAULT_TAGLINE}
            </span>
          </h1>
          <p className="text-white/80 max-w-xl mx-auto mb-8">{description}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/signup">
              <Button className="px-6 py-3 text-base rounded-full bg-white text-brand hover:bg-white/90 shadow-lg shadow-black/10">Join Alumni Community</Button>
            </Link>
            {showExploreButton && (
              <Link to="/directory">
                <Button variant="secondary" className="px-6 py-3 text-base rounded-full bg-white/10 text-white border border-white/30 hover:bg-white/20">
                  Explore Alumni
                </Button>
              </Link>
            )}
          </div>

          <div className="mt-10 flex justify-center motion-safe:animate-bounce motion-reduce:opacity-40">
            <ChevronDown size={20} className="text-white/50" />
          </div>
        </div>
      </div>
    </Reveal>
  )
}
