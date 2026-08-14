import { useEffect, useRef, useState } from 'react'
import type { PagedResult } from '../types/api'

/** Backend-paginated infinite scroll: fetches page 1 whenever `deps` change (resetting the
 *  list), then fetches subsequent pages as the sentinel element scrolls into view. The fetch
 *  itself stays server-side paginated (20/page) — this only changes how the client requests
 *  and appends pages, never loads the whole dataset at once. */
export function useInfiniteList<T>(fetchPage: (page: number) => Promise<PagedResult<T>>, deps: unknown[]) {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true) // initial load for the current filters
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const requestIdRef = useRef(0)

  const hasMore = items.length < total

  // Reset and (re)fetch page 1 whenever filters change.
  useEffect(() => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setPage(1)
    fetchPage(1).then((res) => {
      if (requestId !== requestIdRef.current) return // a newer filter change superseded this
      setItems(res.items ?? [])
      setTotal(res.total)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // Fetch the next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading && !loadingMore) {
          const requestId = requestIdRef.current
          const nextPage = page + 1
          setLoadingMore(true)
          fetchPage(nextPage).then((res) => {
            if (requestId !== requestIdRef.current) return
            setItems((prev) => [...prev, ...(res.items ?? [])])
            setTotal(res.total)
            setPage(nextPage)
            setLoadingMore(false)
          })
        }
      },
      { rootMargin: '400px' }, // start fetching before the sentinel is actually on-screen
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, hasMore, loading, loadingMore])

  return { items, total, loading, loadingMore, hasMore, sentinelRef }
}
