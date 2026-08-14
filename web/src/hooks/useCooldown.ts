import { useEffect, useRef, useState } from 'react'

/** Tracks a countdown in seconds. `start(seconds)` (re)starts it. `remaining > 0` means
 *  active — callers disable their action button and show the countdown while it's ticking.
 *  Takes no default duration: callers should always pass the server's authoritative
 *  cooldownSeconds from the API response, not a hardcoded guess. */
export function useCooldown() {
  const [remaining, setRemaining] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const start = (seconds: number) => {
    if (seconds <= 0) return
    setRemaining(seconds)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          return 0
        }
        return r - 1
      })
    }, 1000)
  }

  return { remaining, start }
}
