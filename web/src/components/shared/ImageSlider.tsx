import { useEffect, useRef, useState } from 'react'
import type { GalleryImage } from '../../types/api'

// Minimal auto-advancing carousel — plain CSS transform + setInterval, no library, per the
// spec's "no heavy carousels" guidance. This is the one deliberate exception (admin-managed
// homepage hero slider), kept as small as possible.
export function ImageSlider({ images }: { images: GalleryImage[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (images.length <= 1 || paused) return
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % images.length), 5000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [images.length, paused])

  if (images.length === 0) return null

  return (
    <div
      className="relative w-full aspect-16/7 overflow-hidden rounded-xl bg-slate-100"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex h-full transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {images.map((img) => (
          <div key={img.id} className="relative w-full h-full shrink-0">
            <img src={img.imageUrl} alt={img.caption || ''} className="w-full h-full object-cover" />
            {img.caption && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent text-white text-sm px-4 py-3">
                {img.caption}
              </div>
            )}
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-3 right-3 flex gap-1.5">
          {images.map((img, i) => (
            <button
              key={img.id}
              aria-label={`Slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-2 bg-white/60'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
