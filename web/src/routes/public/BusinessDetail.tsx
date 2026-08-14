import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { businessesApi } from '../../api/content'
import type { Business } from '../../types/api'
import { Card, Loading } from '../../components/shared/ui'

export default function BusinessDetail() {
  const { id } = useParams()
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    businessesApi
      .get(Number(id))
      .then(setBusiness)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Loading />
  if (!business) return <p className="text-center py-12 text-slate-500">Business not found.</p>

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <h1 className="text-2xl font-semibold">{business.name}</h1>
        <p className="text-slate-500">{business.category}</p>
        {business.description && <p className="mt-4 text-slate-700 whitespace-pre-wrap">{business.description}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {business.location && (
            <div>
              <dt className="text-slate-400">Location</dt>
              <dd>{business.location}</dd>
            </div>
          )}
          {business.website && (
            <div>
              <dt className="text-slate-400">Website</dt>
              <dd>
                <a href={business.website} className="text-brand" target="_blank" rel="noreferrer">
                  {business.website}
                </a>
              </dd>
            </div>
          )}
          {business.contactPhone && (
            <div>
              <dt className="text-slate-400">Phone</dt>
              <dd>{business.contactPhone}</dd>
            </div>
          )}
          {business.contactEmail && (
            <div>
              <dt className="text-slate-400">Email</dt>
              <dd>{business.contactEmail}</dd>
            </div>
          )}
        </dl>
      </Card>
    </div>
  )
}
