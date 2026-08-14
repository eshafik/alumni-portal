import { useRef, useState } from 'react'
import { ImagePlus, X, Loader2, ExternalLink } from 'lucide-react'
import { api, ApiError } from '../../api/client'

interface ImageUploadFieldProps {
  label: string
  context: 'job' | 'notice' | 'event' | 'business' | 'gallery'
  maxSizeMB: number
  imageUrl?: string
  onChange: (attachmentId: number | null, url: string | undefined) => void
  hint?: string
}

// Rectangular counterpart to AvatarUploader (which is circular/avatar-specific): click-to-
// upload with preview, remove button, and client-side validation matching the real per-context
// server-side limit (internal/storage/validate.go) so the error message is never a guess.
export function ImageUploadField({ label, context, maxSizeMB, imageUrl, onChange, hint }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | undefined>(imageUrl)
  const inputRef = useRef<HTMLInputElement>(null)
  const maxBytes = maxSizeMB * 1024 * 1024

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please choose a JPEG, PNG, or WebP image.')
      e.target.value = ''
      return
    }
    if (file.size > maxBytes) {
      setError(`That image is ${(file.size / (1024 * 1024)).toFixed(1)}MB — this must be less than ${maxSizeMB}MB.`)
      e.target.value = ''
      return
    }

    setPreview(URL.createObjectURL(file))
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('context', context)
      const { attachmentId, url } = await api.upload<{ attachmentId: number; url: string }>('/api/uploads', form)
      onChange(attachmentId, url)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed — please try again.')
      setPreview(imageUrl)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const remove = () => {
    setPreview(undefined)
    onChange(null, undefined)
  }

  return (
    <div>
      <span className="text-sm font-medium text-slate-700 block mb-1.5">{label}</span>

      {preview ? (
        <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 max-w-sm">
          <img src={preview} alt="" className="w-full aspect-video object-cover" />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 size={22} className="text-white animate-spin" />
            </div>
          )}
          <button
            type="button"
            onClick={remove}
            className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-red-600"
            aria-label="Remove image"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-200 py-6 max-w-sm text-center cursor-pointer hover:border-brand hover:bg-blue-50/40 transition-colors">
          <ImagePlus size={20} className="text-slate-400" />
          <span className="text-sm text-slate-500">{uploading ? 'Uploading...' : 'Click to add an image (optional)'}</span>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} disabled={uploading} className="hidden" />
        </label>
      )}

      <p className="mt-1.5 text-xs text-slate-400">
        JPEG, PNG, or WebP — must be less than {maxSizeMB}MB.{' '}
        {maxSizeMB <= 2 && (
          <a
            href="https://www.simpleimageresizer.com/resize-image-to-2-mb"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-slate-500 hover:text-brand underline underline-offset-2"
          >
            Resize an image here
            <ExternalLink size={10} />
          </a>
        )}
        {hint && <span className="block">{hint}</span>}
      </p>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
