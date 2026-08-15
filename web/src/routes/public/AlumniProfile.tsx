import { useParams } from 'react-router-dom'
import { AlumniDetailCard } from '../../components/shared/AlumniDetailCard'

export default function AlumniProfile() {
  const { id } = useParams()
  if (!id) return null

  return (
    <div className="max-w-2xl mx-auto">
      <AlumniDetailCard userId={id} />
    </div>
  )
}
