import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass, Target, CalendarDays, MapPin } from 'lucide-react'
import { eventsApi, noticesApi, galleryApi } from '../../api/content'
import { api } from '../../api/client'
import { useInstitution } from '../../hooks/useInstitution'
import type { Event, Notice, GalleryImage } from '../../types/api'
import { Button, Card, Badge, Loading } from '../../components/shared/ui'
import { ImageSlider } from '../../components/shared/ImageSlider'

const DEFAULT_TAGLINE = 'Connect. Remember. Grow Together.'

interface CommitteeMember {
  userId: number
  fullName: string
  avatarUrl?: string
}
interface CommitteePosition {
  title: string
  members: CommitteeMember[]
}

export default function Home() {
  const { institution, stats, loading: institutionLoading } = useInstitution()
  const [gallery, setGallery] = useState<GalleryImage[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [committee, setCommittee] = useState<CommitteePosition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      galleryApi.list(),
      eventsApi.list(1),
      noticesApi.list(1),
      api.get<{ positions: CommitteePosition[] }>('/api/committees/current').catch(() => null),
    ])
      .then(([gal, ev, nt, committeeRes]) => {
        setGallery(gal)
        setEvents((ev.items ?? []).slice(0, 3))
        setNotices((nt.items ?? []).slice(0, 3))
        if (committeeRes?.positions) {
          setCommittee(committeeRes.positions.filter((p) => p.members.length > 0))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading || institutionLoading) return <Loading />

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center pt-4">
        {gallery.length > 0 ? (
          <div className="mb-8">
            <ImageSlider images={gallery} />
          </div>
        ) : (
          <div className="mb-8 -mx-4 sm:mx-0 sm:rounded-2xl bg-gradient-to-br from-brand via-brand to-indigo-800 py-16 px-6 text-white">
            <h1 className="text-3xl md:text-5xl font-bold mb-4">{institution?.tagline || DEFAULT_TAGLINE}</h1>
            <p className="text-white/80 max-w-xl mx-auto mb-8">
              {institution?.description ||
                `The digital home for ${institution?.name ?? 'our'} alumni community — find classmates, discover opportunities, and stay connected.`}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/signup">
                <Button className="px-6 py-3 text-base bg-white text-brand hover:bg-white/90">Join Alumni Community</Button>
              </Link>
              <Link to="/directory">
                <Button variant="secondary" className="px-6 py-3 text-base bg-white/10 text-white border border-white/30 hover:bg-white/20">
                  Explore Alumni
                </Button>
              </Link>
            </div>
          </div>
        )}
        {gallery.length > 0 && (
          <>
            <h1 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">{institution?.tagline || DEFAULT_TAGLINE}</h1>
            <p className="text-slate-600 max-w-xl mx-auto mb-8">
              {institution?.description ||
                `The digital home for ${institution?.name ?? 'our'} alumni community — find classmates, discover opportunities, and stay connected.`}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/signup">
                <Button className="px-6 py-3 text-base">Join Alumni Community</Button>
              </Link>
              <Link to="/directory">
                <Button variant="secondary" className="px-6 py-3 text-base">
                  Explore Alumni
                </Button>
              </Link>
            </div>
          </>
        )}
      </section>

      {/* Stats */}
      {(stats.alumniCount ?? 0) > 0 && (
        <section className="grid grid-cols-2 gap-4 text-center">
          <Card className="py-6">
            <p className="text-3xl font-bold text-brand">{stats.alumniCount}</p>
            <p className="text-sm text-slate-500 mt-1">Alumni</p>
          </Card>
          <Card className="py-6">
            <p className="text-3xl font-bold text-brand">{stats.batchCount}</p>
            <p className="text-sm text-slate-500 mt-1">Batches</p>
          </Card>
        </section>
      )}

      {/* About + Mission */}
      {(institution?.aboutText || institution?.missionText) && (
        <section className="rounded-2xl bg-slate-50 border border-slate-100 p-6 sm:p-10">
          <div className="grid sm:grid-cols-2 gap-8">
            {institution?.aboutText && (
              <div>
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand/10 text-brand shrink-0">
                    <Compass size={18} />
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900">About Us</h2>
                </div>
                <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{institution.aboutText}</p>
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
                <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{institution.missionText}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Committee — name, photo, position only */}
      {committee.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Current Committee</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {committee.map((p) =>
              p.members.map((m) => (
                <Card key={m.userId} className="text-center">
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt={m.fullName} className="w-16 h-16 rounded-full mx-auto mb-2 object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-200 mx-auto mb-2" />
                  )}
                  <p className="font-medium text-sm">{m.fullName}</p>
                  <p className="text-xs text-slate-500">{p.title}</p>
                </Card>
              )),
            )}
          </div>
        </section>
      )}

      {/* Upcoming events */}
      {events.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Upcoming Events</h2>
            <Link to="/events" className="text-sm text-brand">
              View all
            </Link>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {events.map((e) => (
              <Link key={e.id} to={`/events/${e.slug}`}>
                <Card className="hover:shadow-md hover:border-brand/30 transition-all h-full">
                  <p className="font-medium text-slate-900">{e.title}</p>
                  <div className="mt-2 space-y-1 text-sm text-slate-500">
                    <p className="flex items-center gap-1.5">
                      <CalendarDays size={13} /> {new Date(e.startAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    {e.venue && (
                      <p className="flex items-center gap-1.5">
                        <MapPin size={13} /> {e.venue}
                      </p>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent notices */}
      {notices.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Recent Notices</h2>
            <Link to="/notices" className="text-sm text-brand">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {notices.map((n) => (
              <Card key={n.id} className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{n.body}</p>
                </div>
                {n.importance !== 'normal' && <Badge tone={n.importance as 'important' | 'urgent'}>{n.importance}</Badge>}
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
