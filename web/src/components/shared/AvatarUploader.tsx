import { useRef, useState } from 'react'
import { Camera, ExternalLink, Loader2, User as UserIcon } from 'lucide-react'
import { api, ApiError } from '../../api/client'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // must match internal/storage/validate.go's ContextAvatar limit
const RESIZER_URL = 'https://www.simpleimageresizer.com/resize-image-to-2-mb'

interface AvatarUploaderProps {
  avatarUrl?: string
  onUploaded: (attachmentId: number, url: string) => void
  size?: 'md' | 'lg'
}

export function AvatarUploader({ avatarUrl, onUploaded, size = 'lg' }: AvatarUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | undefined>(avatarUrl)
  const inputRef = useRef<HTMLInputElement>(null)

  const dimension = size === 'lg' ? 'w-28 h-28' : 'w-16 h-16'

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please choose a JPEG, PNG, or WebP image.')
      e.target.value = ''
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(`That image is ${(file.size / (1024 * 1024)).toFixed(1)}MB — profile pictures must be less than 2MB. Use the resizer link below, then try again.`)
      e.target.value = ''
      return
    }

    setPreview(URL.createObjectURL(file))
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('context', 'avatar')
      const { attachmentId, url } = await api.upload<{ attachmentId: number; url: string }>('/api/uploads', form)
      onUploaded(attachmentId, url)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed — please try again.')
      setPreview(avatarUrl)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center text-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`group relative ${dimension} rounded-full overflow-hidden border-2 border-slate-200 bg-slate-50 flex items-center justify-center hover:border-brand transition-colors disabled:cursor-wait`}
        aria-label={preview ? 'Change profile picture' : 'Upload profile picture'}
      >
        {preview ? (
          <img src={preview} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <UserIcon size={size === 'lg' ? 40 : 24} className="text-slate-300" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
          {uploading ? (
            <Loader2 size={20} className="text-white animate-spin" />
          ) : (
            <Camera size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="hidden" />
      </button>

      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="mt-2.5 text-sm font-medium text-brand hover:underline">
        {preview ? 'Change photo' : 'Upload photo'}
      </button>

      <p className="mt-1 text-xs text-slate-500">JPEG, PNG, or WebP — must be less than 2MB.</p>

      <a
        href={RESIZER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand underline underline-offset-2"
      >
        Need to shrink your photo? Resize it to under 2MB here
        <ExternalLink size={11} />
      </a>

      {error && <p className="mt-2 text-xs text-red-600 max-w-xs">{error}</p>}
    </div>
  )
}
