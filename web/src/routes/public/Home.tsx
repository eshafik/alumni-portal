import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass, Target, CalendarDays, MapPin, Sparkles, Users, GraduationCap, Clock, ImageIcon, ExternalLink, Megaphone } from 'lucide-react'
import { eventsApi, noticesApi, galleryApi } from '../../api/content'
import { api } from '../../api/client'
import { useInstitution } from '../../hooks/useInstitution'
import { useAuth } from '../../hooks/useAuth'
import { useInView } from '../../hooks/useInView'
import type { Event, Notice, GalleryImage } from '../../types/api'
import { Button, Card, Badge, Loading, Reveal } from '../../components/shared/ui'
import { ImageSlider } from '../../components/shared/ImageSlider'
import { cn } from '../../lib/utils'

const DEFAULT_TAGLINE = 'Connect. Remember. Grow Together.'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

interface CommitteeMember {
  userId: number
  fullName: string
  avatarUrl?: string
}
interface CommitteePosition {
  title: string
  members: CommitteeMember[]
}

function Kicker({ children }: { children: string }) {
  return <p className="text-xs font-semibold tracking-wider text-brand uppercase mb-1.5">{children}</p>
}

const DESCRIPTION_LIMIT = 160

function ExpandableText({ text, limit = DESCRIPTION_LIMIT, className = 'text-sm text-slate-600 mt-2' }: { text: string; limit?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  if (text.length <= limit) {
    return <p className={cn(className, 'whitespace-pre-wrap')}>{text}</p>
  }
  return (
    <p className={cn(className, 'whitespace-pre-wrap')}>
      {expanded ? text : text.slice(0, limit).trimEnd() + '…'}{' '}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setExpanded((v) => !v)
        }}
        className="text-brand text-xs font-medium hover:underline"
      >
        {expanded ? 'See less' : 'See more'}
      </button>
    </p>
  )
}

// Like ExpandableText, but the initial reveal fades in word by word once scrolled into view
// (once only — re-expanding via "See more" just appends the rest instantly, no re-stream).
const STREAM_WORD_DELAY_MS = 35
const STREAM_WORD_CAP = 40

function StreamingText({ text, limit = 280, className = 'text-slate-600 leading-relaxed' }: { text: string; limit?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLParagraphElement>()
  const [expanded, setExpanded] = useState(false)
  const truncated = text.length > limit
  const display = expanded ? text : truncated ? text.slice(0, limit).trimEnd() + '…' : text

  let wordIndex = -1
  const content = display.split(/(\s+)/).map((token, i) => {
    if (/^\s*$/.test(token)) return token
    wordIndex += 1
    const delay = Math.min(wordIndex, STREAM_WORD_CAP) * STREAM_WORD_DELAY_MS
    return (
      <span key={i} className={cn('stream-word', inView && 'stream-word-in')} style={{ transitionDelay: `${delay}ms` }}>
        {token}
      </span>
    )
  })

  return (
    <p ref={ref} className={cn(className, 'whitespace-pre-wrap')}>
      {content}
      {truncated && (
        <>
          {' '}
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            className="text-brand text-xs font-medium hover:underline"
          >
            {expanded ? 'See less' : 'See more'}
          </button>
        </>
      )}
    </p>
  )
}

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

// Subtle rAF-throttled parallax shift for the hero's decorative blurred circles. No-op under reduced-motion.
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

export default function Home() {
  const { institution, stats, loading: institutionLoading } = useInstitution()
  const { user } = useAuth()
  const [gallery, setGallery] = useState<GalleryImage[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [committee, setCommittee] = useState<CommitteePosition[]>([])
  const [loading, setLoading] = useState(true)
  const [heroRef, heroShift] = useParallax()
  const [statsRef, statsInView] = useInView<HTMLElement>()
  const alumniCount = useCountUp(stats.alumniCount ?? 0, statsInView)
  const batchCount = useCountUp(stats.batchCount ?? 0, statsInView)

  useEffect(() => {
    Promise.all([
      galleryApi.list(),
      eventsApi.list(1),
      noticesApi.list(1),
      api.get<{ positions: CommitteePosition[] }>('/api/committees/current').catch(() => null),
    ])
      .then(([gal, ev, nt, committeeRes]) => {
        setGallery(gal)
        setEvents((ev.items ?? []).slice(0, 2))
        setNotices((nt.items ?? []).slice(0, 3))
        if (committeeRes?.positions) {
          setCommittee(committeeRes.positions.filter((p) => p.members.length > 0))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading || institutionLoading) return <Loading />

  const description =
    institution?.description ||
    `The digital home for ${institution?.name ?? 'our'} alumni community — find classmates, discover opportunities, and stay connected.`

  let committeeIndex = -1

  return (
    <div className="space-y-16 pb-8">
      {/* Hero — single code path for gallery / no-gallery, always white-on-gradient */}
      <Reveal tag="section" className="text-center pt-4">
        <div className="relative mb-8 -mx-4 sm:mx-0 sm:rounded-2xl bg-gradient-to-br from-brand via-brand to-indigo-950 py-16 sm:py-20 px-6 text-white overflow-hidden">
          <div
            ref={heroRef}
            className="pointer-events-none absolute -top-24 -left-16 w-72 h-72 rounded-full bg-white/10 blur-3xl"
            style={{ transform: `translateY(${heroShift}px)` }}
          />
          <div
            className="pointer-events-none absolute -bottom-24 -right-16 w-72 h-72 rounded-full bg-indigo-400/20 blur-3xl"
            style={{ transform: `translateY(${-heroShift}px)` }}
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

            <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight text-balance">{institution?.tagline || DEFAULT_TAGLINE}</h1>
            <p className="text-white/80 max-w-xl mx-auto mb-8">{description}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/signup">
                <Button className="px-6 py-3 text-base rounded-full bg-white text-brand hover:bg-white/90 shadow-lg shadow-black/10">Join Alumni Community</Button>
              </Link>
              {user && (
                <Link to="/directory">
                  <Button variant="secondary" className="px-6 py-3 text-base rounded-full bg-white/10 text-white border border-white/30 hover:bg-white/20">
                    Explore Alumni
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      {/* Stats */}
      {(stats.alumniCount ?? 0) > 0 && (
        <section ref={statsRef as never} className={cn('reveal grid grid-cols-2 gap-4 text-center', statsInView && 'reveal-in')}>
          <Card className="py-7 bg-gradient-to-br from-brand/5 to-transparent border-brand/10">
            <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto mb-2">
              <Users size={18} />
            </div>
            <p className="text-4xl font-bold text-brand tabular-nums">{alumniCount}</p>
            <p className="text-sm text-slate-500 mt-1">Alumni</p>
          </Card>
          <Card className="py-7 bg-gradient-to-br from-brand/5 to-transparent border-brand/10">
            <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto mb-2">
              <GraduationCap size={18} />
            </div>
            <p className="text-4xl font-bold text-brand tabular-nums">{batchCount}</p>
            <p className="text-sm text-slate-500 mt-1">Batches</p>
          </Card>
        </section>
      )}

      {/* About + Mission */}
      {(institution?.aboutText || institution?.missionText) && (
        <Reveal tag="section" className="rounded-2xl bg-slate-50 border border-slate-100 p-6 sm:p-10">
          <div className="grid sm:grid-cols-2 gap-8">
            {institution?.aboutText && (
              <div>
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand/10 text-brand shrink-0">
                    <Compass size={18} />
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900">About Us</h2>
                </div>
                <StreamingText text={institution.aboutText} limit={280} className="text-slate-600 leading-relaxed" />
              </div>
            )}
            {institution?.missionText && (
              <div>
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand/10 text-brand shrink-0">
                    <Target size={18} />
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900">Our Mission</h2>
                </div>
                <StreamingText text={institution.missionText} limit={280} className="text-slate-600 leading-relaxed" />
              </div>
            )}
          </div>
        </Reveal>
      )}

      {/* Committee — name, photo, position only */}
      {committee.length > 0 && (
        <Reveal tag="section">
          <Kicker>Leadership</Kicker>
          <h2 className="text-xl font-semibold mb-4">Current Committee</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {committee.map((p) =>
              p.members.map((m) => {
                committeeIndex += 1
                return (
                  <Reveal key={m.userId} delayMs={Math.min(committeeIndex, 6) * 60}>
                    <Card className="text-center hover:shadow-md hover:-translate-y-0.5 hover:ring-1 hover:ring-brand/20 transition-all">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.fullName} className="w-16 h-16 rounded-full mx-auto mb-2 object-cover ring-2 ring-brand/10" />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-slate-200 mx-auto mb-2" />
                      )}
                      <p className="font-medium text-sm">{m.fullName}</p>
                      <p className="text-xs text-slate-500">{p.title}</p>
                    </Card>
                  </Reveal>
                )
              }),
            )}
          </div>
        </Reveal>
      )}

      {/* Upcoming events */}
      <Reveal tag="section">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Kicker>What's happening</Kicker>
            <h2 className="text-xl font-semibold">Upcoming Events</h2>
          </div>
          <Link to="/events" className="text-sm text-brand font-medium hover:underline">
            View all
          </Link>
        </div>
        {events.length === 0 ? (
          <Card className="text-center py-12">
            <CalendarDays size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-600">No upcoming events right now</p>
            <p className="text-xs text-slate-400 mt-1">Check back soon, or browse past events.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {events.map((e, i) => (
              <Reveal key={e.id} delayMs={Math.min(i, 6) * 80}>
                <Card className="p-0 overflow-hidden hover:shadow-md hover:border-brand/30 transition-all">
                  <div className="flex flex-col sm:flex-row">
                    <Link to={`/events/${e.slug}`} className="sm:w-56 shrink-0">
                      {e.coverUrl ? (
                        <img src={e.coverUrl} alt="" className="w-full h-40 sm:h-full object-cover bg-slate-100" />
                      ) : (
                        <div className="w-full h-40 sm:h-full bg-slate-50 border-b sm:border-b-0 sm:border-r border-slate-100 flex items-center justify-center">
                          <ImageIcon size={28} className="text-slate-300" />
                        </div>
                      )}
                    </Link>
                    <div className="p-4 flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <Link to={`/events/${e.slug}`}>
                          <p className="font-semibold text-slate-900 hover:text-brand">{e.title}</p>
                        </Link>
                        {e.registrationUrl ? (
                          <a href={e.registrationUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                            <Button className="text-sm px-3 py-1.5">
                              Register <ExternalLink size={12} className="ml-1" />
                            </Button>
                          </a>
                        ) : (
                          <Link to={`/events/${e.slug}`} className="shrink-0">
                            <Button variant="secondary" className="text-sm px-3 py-1.5">
                              View &amp; Register
                            </Button>
                          </Link>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <CalendarDays size={12} /> {new Date(e.startAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                        </span>
                        {(e.venue || e.onlineUrl) && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} /> {e.venue || 'Online'}
                          </span>
                        )}
                        {e.registrationDeadline && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} /> Register by {new Date(e.registrationDeadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>

                      {e.description && <ExpandableText text={e.description} />}
                    </div>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        )}
      </Reveal>

      {/* Recent notices */}
      <Reveal tag="section">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Kicker>Stay in the loop</Kicker>
            <h2 className="text-xl font-semibold">Recent Notices</h2>
          </div>
          <Link to="/notices" className="text-sm text-brand font-medium hover:underline">
            View all
          </Link>
        </div>
        {notices.length === 0 ? (
          <Card className="text-center py-12">
            <Megaphone size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-600">No notices posted yet</p>
            <p className="text-xs text-slate-400 mt-1">Announcements will show up here.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {notices.map((n, i) => (
              <Reveal key={n.id} delayMs={Math.min(i, 6) * 50}>
                <Card className="flex items-start justify-between gap-4 hover:shadow-sm transition-shadow">
                  <div>
                    <p className="font-medium">{n.title}</p>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{n.body}</p>
                  </div>
                  {n.importance !== 'normal' && <Badge tone={n.importance as 'important' | 'urgent'}>{n.importance}</Badge>}
                </Card>
              </Reveal>
            ))}
          </div>
        )}
      </Reveal>
    </div>
  )
}
