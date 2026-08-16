import type { StudentDirectoryRow } from '../../types/api'
import { Avatar, Card } from './ui'

export function StudentDetailCard({ student }: { student: StudentDirectoryRow }) {
  return (
    <Card>
      <div className="flex items-center gap-4">
        <Avatar name={student.fullName} url={student.avatarUrl} size="lg" />
        <div>
          <h1 className="text-xl font-semibold">{student.fullName}</h1>
          <p className="text-slate-500 text-sm">
            {student.programName} · {student.departmentName}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-400">Batch</dt>
          <dd>{student.batchLabel}</dd>
        </div>
        {student.bloodGroupName && (
          <div>
            <dt className="text-slate-400">Blood Group</dt>
            <dd>{student.bloodGroupName}</dd>
          </div>
        )}
        {student.studentId && (
          <div>
            <dt className="text-slate-400">Student ID</dt>
            <dd>{student.studentId}</dd>
          </div>
        )}
      </dl>
      <p className="text-xs text-slate-400 mt-4">Student directory is view-only.</p>
    </Card>
  )
}
