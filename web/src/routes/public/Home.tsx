import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { eventsApi, noticesApi, galleryApi } from '../../api/content'
import { api } from '../../api/client'
import { useInstitution } from '../../hooks/useInstitution'
import type { Event, Notice, GalleryImage } from '../../types/api'
import { Button, Card, Badge, Loading } from '../../components/shared/ui'
import { ImageSlider } from '../../components/shared/ImageSlider'

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
        {gallery.length > 0 && (
          <div className="mb-8">
            <ImageSlider images={gallery} />
          </div>
        )}
        <h1 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
          Connect. Remember. Grow Together.
        </h1>
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
      </section>

      {/* Stats */}
      {(stats.alumniCount ?? 0) > 0 && (
        <section className="grid grid-cols-3 gap-4 text-center">
          <Card>
            <p className="text-2xl font-bold text-brand">{stats.alumniCount}</p>
            <p className="text-sm text-slate-500">Alumni</p>
          </Card>
          <Card>
            <p className="text-2xl font-bold text-brand">{stats.batchCount}</p>
            <p className="text-sm text-slate-500">Batches</p>
          </Card>
          <Card>
            <p className="text-2xl font-bold text-brand">{stats.locationCount}</p>
            <p className="text-sm text-slate-500">Locations</p>
          </Card>
        </section>
      )}

      {/* About */}
      {institution?.aboutText && (
        <section id="about">
          <h2 className="text-xl font-semibold mb-3">About Us</h2>
          <p className="text-slate-700 whitespace-pre-wrap max-w-3xl">{institution.aboutText}</p>
        </section>
      )}

      {/* Mission */}
      {institution?.missionText && (
        <section id="mission">
          <h2 className="text-xl font-semibold mb-3">Our Mission</h2>
          <p className="text-slate-700 whitespace-pre-wrap max-w-3xl">{institution.missionText}</p>
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
                <Card>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-sm text-slate-500 mt-1">{new Date(e.startAt).toLocaleDateString()}</p>
                  <p className="text-sm text-slate-500">{e.venue}</p>
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
