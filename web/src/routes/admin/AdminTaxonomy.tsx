import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, Check, X, Plus, Loader2, GraduationCap, Undo2 } from 'lucide-react'
import { configApi } from '../../api/directory'
import { taxonomyApi } from '../../api/taxonomy'
import { adminApi } from '../../api/admin'
import { api, ApiError } from '../../api/client'
import type { Department, Program, Batch, BloodGroup, PagedResult } from '../../types/api'
import { Button, Card, Input, Select, Loading } from '../../components/shared/ui'
import { useConfirm } from '../../hooks/useConfirm'

type SectionKey = 'departments' | 'programs' | 'batches' | 'bloodGroups'

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 70 }, (_, i) => CURRENT_YEAR + 5 - i) // descending, near-future first

export default function AdminTaxonomy() {
  const [section, setSection] = useState<SectionKey>('departments')
  const [departments, setDepartments] = useState<Department[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [bloodGroups, setBloodGroups] = useState<BloodGroup[]>([])
  const [loading, setLoading] = useState(true)

  const reload = () => {
    setLoading(true)
    Promise.all([configApi.departments(), configApi.programs(), configApi.batches(), configApi.bloodGroups()])
      .then(([d, p, b, bg]) => {
        setDepartments(d ?? [])
        setPrograms(p ?? [])
        setBatches(b ?? [])
        setBloodGroups(bg ?? [])
      })
      .finally(() => setLoading(false))
  }
  useEffect(reload, [])

  const sections: { key: SectionKey; label: string; count: number }[] = [
    { key: 'departments', label: 'Departments', count: departments.length },
    { key: 'programs', label: 'Programs', count: programs.length },
    { key: 'batches', label: 'Batches', count: batches.length },
    { key: 'bloodGroups', label: 'Blood Groups', count: bloodGroups.length },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Manage Dropdowns</h1>
        <p className="text-sm text-slate-500 mt-1">
          Departments, programs, batches, and blood groups used at signup and in the alumni directory. Removing an
          entry deactivates it rather than deleting it — existing members keep working.
        </p>
      </div>

      <div className="flex gap-1 mb-5 border-b border-slate-200 overflow-x-auto">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px shrink-0 transition-colors ${
              section === s.key ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {s.label} <span className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${section === s.key ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-500'}`}>{s.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : (
        <>
          {section === 'departments' && <DepartmentPanel departments={departments} onChange={reload} />}
          {section === 'programs' && <ProgramPanel departments={departments} programs={programs} onChange={reload} />}
          {section === 'batches' && <BatchPanel programs={programs} batches={batches} onChange={reload} />}
          {section === 'bloodGroups' && <BloodGroupPanel bloodGroups={bloodGroups} onChange={reload} />}
        </>
      )}
    </div>
  )
}

// --- shared table chrome ---

function PanelShell({ title, description, toolbar, children }: { title: string; description: string; toolbar: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{description}</p>
      </div>
      <div className="p-4 border-b border-slate-100 bg-slate-50/60">{toolbar}</div>
      {children}
    </Card>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left text-xs font-semibold uppercase tracking-wide text-slate-500 px-4 py-2.5 ${className ?? ''}`}>{children}</th>
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button onClick={onEdit} className="p-1.5 rounded-md text-slate-400 hover:text-brand hover:bg-blue-50" title="Edit" aria-label="Edit">
        <Pencil size={15} />
      </button>
      <button onClick={onDelete} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" title="Deactivate" aria-label="Deactivate">
        <Trash2 size={15} />
      </button>
    </div>
  )
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-slate-400">
        {label}
      </td>
    </tr>
  )
}

// --- Departments ---

function DepartmentPanel({ departments, onChange }: { departments: Department[]; onChange: () => void }) {
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [saving, setSaving] = useState(false)

  const create = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await taxonomyApi.createDepartment(name.trim(), code.trim())
      setName('')
      setCode('')
      onChange()
    } finally {
      setSaving(false)
    }
  }
  const startEdit = (d: Department) => {
    setEditingId(d.id)
    setEditName(d.name)
    setEditCode(d.code)
  }
  const saveEdit = async () => {
    if (editingId === null || !editName.trim()) return
    await taxonomyApi.updateDepartment(editingId, editName.trim(), editCode.trim())
    setEditingId(null)
    onChange()
  }
  const remove = async (d: Department) => {
    const ok = await confirm({ description: `Deactivate "${d.name}"? It will no longer appear in signup or filters.`, confirmLabel: 'Deactivate', danger: true })
    if (!ok) return
    await taxonomyApi.deleteDepartment(d.id)
    onChange()
  }

  return (
    <PanelShell
      title="Departments"
      description="Top-level academic units, e.g. Computer Science."
      toolbar={
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Department name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Input placeholder="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} className="max-w-[120px]" />
          <Button onClick={create} disabled={!name.trim() || saving}>
            {saving ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Plus size={15} className="mr-1" />} Add
          </Button>
        </div>
      }
    >
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <Th>Name</Th>
            <Th className="w-32">Code</Th>
            <Th className="w-24 text-right pr-4">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {departments.length === 0 && <EmptyRow colSpan={3} label="No departments yet — add one above." />}
          {departments.map((d) =>
            editingId === d.id ? (
              <tr key={d.id} className="bg-blue-50/40">
                <td className="px-4 py-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                </td>
                <td className="px-4 py-2">
                  <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button onClick={saveEdit} className="p-1.5 rounded-md text-green-600 hover:bg-green-50" aria-label="Save">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100" aria-label="Cancel">
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{d.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{d.code || '—'}</td>
                <td className="px-4 py-2.5">
                  <RowActions onEdit={() => startEdit(d)} onDelete={() => remove(d)} />
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </PanelShell>
  )
}

// --- Programs ---

function ProgramPanel({ departments, programs, onChange }: { departments: Department[]; programs: Program[]; onChange: () => void }) {
  const confirm = useConfirm()
  const [departmentId, setDepartmentId] = useState('')
  const [name, setName] = useState('')
  const [degreeLevel, setDegreeLevel] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDegree, setEditDegree] = useState('')
  const [saving, setSaving] = useState(false)

  const deptName = useMemo(() => {
    const map = new Map(departments.map((d) => [d.id, d.name]))
    return (id: number) => map.get(id) ?? '—'
  }, [departments])

  const create = async () => {
    if (!name.trim() || !departmentId) return
    setSaving(true)
    try {
      await taxonomyApi.createProgram(Number(departmentId), name.trim(), degreeLevel.trim())
      setName('')
      setDegreeLevel('')
      onChange()
    } finally {
      setSaving(false)
    }
  }
  const startEdit = (p: Program) => {
    setEditingId(p.id)
    setEditName(p.name)
    setEditDegree(p.degreeLevel)
  }
  const saveEdit = async () => {
    if (editingId === null || !editName.trim()) return
    await taxonomyApi.updateProgram(editingId, editName.trim(), editDegree.trim())
    setEditingId(null)
    onChange()
  }
  const remove = async (p: Program) => {
    const ok = await confirm({ description: `Deactivate "${p.name}"?`, confirmLabel: 'Deactivate', danger: true })
    if (!ok) return
    await taxonomyApi.deleteProgram(p.id)
    onChange()
  }

  return (
    <PanelShell
      title="Programs"
      description="Degree programs offered within a department, e.g. B.Sc. Computer Science."
      toolbar={
        <div className="flex flex-wrap gap-2">
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="max-w-[180px]">
            <option value="">Department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Input placeholder="Program name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Input placeholder="Degree level" value={degreeLevel} onChange={(e) => setDegreeLevel(e.target.value)} className="max-w-[140px]" />
          <Button onClick={create} disabled={!name.trim() || !departmentId || saving}>
            {saving ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Plus size={15} className="mr-1" />} Add
          </Button>
        </div>
      }
    >
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <Th>Name</Th>
            <Th>Department</Th>
            <Th className="w-32">Degree Level</Th>
            <Th className="w-24 text-right pr-4">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {programs.length === 0 && <EmptyRow colSpan={4} label="No programs yet — add one above." />}
          {programs.map((p) =>
            editingId === p.id ? (
              <tr key={p.id} className="bg-blue-50/40">
                <td className="px-4 py-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                </td>
                <td className="px-4 py-2 text-slate-500">{deptName(p.departmentId)}</td>
                <td className="px-4 py-2">
                  <Input value={editDegree} onChange={(e) => setEditDegree(e.target.value)} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button onClick={saveEdit} className="p-1.5 rounded-md text-green-600 hover:bg-green-50" aria-label="Save">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100" aria-label="Cancel">
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{deptName(p.departmentId)}</td>
                <td className="px-4 py-2.5 text-slate-500">{p.degreeLevel || '—'}</td>
                <td className="px-4 py-2.5">
                  <RowActions onEdit={() => startEdit(p)} onDelete={() => remove(p)} />
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </PanelShell>
  )
}

// --- Batches ---

function BatchPanel({ programs, batches, onChange }: { programs: Program[]; batches: Batch[]; onChange: () => void }) {
  const confirm = useConfirm()
  const [programId, setProgramId] = useState('')
  const [startYear, setStartYear] = useState('')
  const [endYear, setEndYear] = useState('')
  const [label, setLabel] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [convertingId, setConvertingId] = useState<number | null>(null)
  const [batchMessage, setBatchMessage] = useState<{ id: number; text: string; error?: boolean } | null>(null)

  const programName = useMemo(() => {
    const map = new Map(programs.map((p) => [p.id, p.name]))
    return (id: number) => map.get(id) ?? '—'
  }, [programs])

  const create = async () => {
    if (!programId || !startYear) return
    setSaving(true)
    try {
      await taxonomyApi.createBatch(Number(programId), Number(startYear), Number(endYear || startYear), label.trim())
      setStartYear('')
      setEndYear('')
      setLabel('')
      onChange()
    } finally {
      setSaving(false)
    }
  }
  const startEdit = (b: Batch) => {
    setEditingId(b.id)
    setEditStart(String(b.startYear))
    setEditEnd(String(b.endYear))
    setEditLabel(b.label)
  }
  const saveEdit = async () => {
    if (editingId === null || !editStart) return
    await taxonomyApi.updateBatch(editingId, Number(editStart), Number(editEnd || editStart), editLabel.trim())
    setEditingId(null)
    onChange()
  }
  const remove = async (b: Batch) => {
    const ok = await confirm({ description: `Deactivate batch "${b.label || b.startYear}"?`, confirmLabel: 'Deactivate', danger: true })
    if (!ok) return
    await taxonomyApi.deleteBatch(b.id)
    onChange()
  }

  const convertToAlumni = async (b: Batch) => {
    setBatchMessage(null)
    let activeCount = 0
    try {
      const res = await api.get<PagedResult<unknown>>(`/api/students?batchId=${b.id}&page=1`)
      activeCount = res.total
    } catch {
      // Count is best-effort context for the confirm dialog — proceed without it if it fails.
    }
    const ok = await confirm({
      description:
        activeCount > 0
          ? `Convert ${activeCount} active student(s) in "${b.label || b.startYear}" to alumni? They gain full alumni access (directory, job posting, etc.) immediately. This can be reverted.`
          : `Convert batch "${b.label || b.startYear}" to alumni? This can be reverted.`,
      confirmLabel: 'Convert to alumni',
    })
    if (!ok) return
    setConvertingId(b.id)
    try {
      const res = await adminApi.convertBatchToAlumni(b.id)
      setBatchMessage({ id: b.id, text: `Converted ${res.count} student(s) to alumni.` })
      onChange()
    } catch (err) {
      setBatchMessage({ id: b.id, text: err instanceof ApiError ? err.message : 'Conversion failed', error: true })
    } finally {
      setConvertingId(null)
    }
  }

  const revertConversion = async (b: Batch) => {
    setBatchMessage(null)
    const ok = await confirm({
      description: `Revert the most recent alumni conversion for "${b.label || b.startYear}"? Converted members go back to student status and lose alumni access.`,
      confirmLabel: 'Revert',
      danger: true,
    })
    if (!ok) return
    setConvertingId(b.id)
    try {
      await adminApi.revertBatchConversion(b.id)
      setBatchMessage({ id: b.id, text: 'Batch conversion reverted.' })
      onChange()
    } catch (err) {
      setBatchMessage({ id: b.id, text: err instanceof ApiError ? err.message : 'Revert failed', error: true })
    } finally {
      setConvertingId(null)
    }
  }

  return (
    <PanelShell
      title="Batches"
      description="Year ranges within a program, e.g. 2018–2022. Use the cap icon to convert a graduating batch's active students to alumni membership; the undo icon reverts the most recent conversion."
      toolbar={
        <div className="flex flex-wrap gap-2">
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)} className="max-w-[180px]">
            <option value="">Program</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <YearSelect value={startYear} onChange={setStartYear} placeholder="Start year" />
          <YearSelect value={endYear} onChange={setEndYear} placeholder="End year" />
          <Input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} className="max-w-[160px]" />
          <Button onClick={create} disabled={!programId || !startYear || saving}>
            {saving ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Plus size={15} className="mr-1" />} Add
          </Button>
        </div>
      }
    >
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <Th>Batch</Th>
            <Th>Program</Th>
            <Th className="w-24 text-right pr-4">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {batches.length === 0 && <EmptyRow colSpan={3} label="No batches yet — add one above." />}
          {batches.map((b) =>
            editingId === b.id ? (
              <tr key={b.id} className="bg-blue-50/40">
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <YearSelect value={editStart} onChange={setEditStart} placeholder="Start" />
                    <YearSelect value={editEnd} onChange={setEditEnd} placeholder="End" />
                    <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Label" className="max-w-[140px]" />
                  </div>
                </td>
                <td className="px-4 py-2 text-slate-500">{programName(b.programId)}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button onClick={saveEdit} className="p-1.5 rounded-md text-green-600 hover:bg-green-50" aria-label="Save">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100" aria-label="Cancel">
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">
                  <div className="flex items-center gap-2">
                    <span>{b.label || `${b.startYear}–${b.endYear}`}</span>
                    <BatchStatusBadge batch={b} />
                  </div>
                  {batchMessage?.id === b.id && (
                    <p className={`text-xs mt-0.5 ${batchMessage.error ? 'text-red-600' : 'text-green-600'}`}>{batchMessage.text}</p>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-500">{programName(b.programId)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => convertToAlumni(b)}
                      disabled={convertingId === b.id || b.activeStudentCount === 0}
                      className="p-1.5 rounded-md text-slate-400 hover:text-brand hover:bg-blue-50 disabled:opacity-30"
                      title={b.activeStudentCount === 0 ? 'No active students left to convert' : 'Convert batch to alumni'}
                      aria-label="Convert batch to alumni"
                    >
                      {convertingId === b.id ? <Loader2 size={15} className="animate-spin" /> : <GraduationCap size={15} />}
                    </button>
                    <button
                      onClick={() => revertConversion(b)}
                      disabled={convertingId === b.id || !b.convertedStudentCount}
                      className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-30"
                      title={!b.convertedStudentCount ? 'Nothing converted yet' : 'Revert last alumni conversion'}
                      aria-label="Revert last alumni conversion"
                    >
                      <Undo2 size={15} />
                    </button>
                    <RowActions onEdit={() => startEdit(b)} onDelete={() => remove(b)} />
                  </div>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </PanelShell>
  )
}

// Reflects each batch's conversion state so admins can tell a currently-running batch apart
// from one already converted to alumni without opening the student directory.
function BatchStatusBadge({ batch }: { batch: Batch }) {
  const active = batch.activeStudentCount ?? 0
  const converted = batch.convertedStudentCount ?? 0
  if (converted > 0 && active === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800">
        <GraduationCap size={11} /> Alumni
      </span>
    )
  }
  if (converted > 0 && active > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
        Partially converted
      </span>
    )
  }
  if (active > 0) {
    return <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600">Running</span>
  }
  return null
}

function YearSelect({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-[110px]">
      <option value="">{placeholder}</option>
      {YEAR_OPTIONS.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </Select>
  )
}

// --- Blood Groups ---

function BloodGroupPanel({ bloodGroups, onChange }: { bloodGroups: BloodGroup[]; onChange: () => void }) {
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  const create = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await taxonomyApi.createBloodGroup(name.trim(), bloodGroups.length)
      setName('')
      onChange()
    } finally {
      setSaving(false)
    }
  }
  const startEdit = (bg: BloodGroup) => {
    setEditingId(bg.id)
    setEditName(bg.name)
  }
  const saveEdit = async () => {
    if (editingId === null || !editName.trim()) return
    const current = bloodGroups.find((b) => b.id === editingId)
    await taxonomyApi.updateBloodGroup(editingId, editName.trim(), current?.sortOrder ?? 0)
    setEditingId(null)
    onChange()
  }
  const remove = async (bg: BloodGroup) => {
    const ok = await confirm({ description: `Deactivate "${bg.name}"?`, confirmLabel: 'Deactivate', danger: true })
    if (!ok) return
    await taxonomyApi.deleteBloodGroup(bg.id)
    onChange()
  }

  return (
    <PanelShell
      title="Blood Groups"
      description="Shown as a required field at signup."
      toolbar={
        <div className="flex flex-wrap gap-2">
          <Input placeholder="e.g. A+" value={name} onChange={(e) => setName(e.target.value)} className="max-w-[140px]" />
          <Button onClick={create} disabled={!name.trim() || saving}>
            {saving ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Plus size={15} className="mr-1" />} Add
          </Button>
        </div>
      }
    >
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <Th>Name</Th>
            <Th className="w-24 text-right pr-4">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {bloodGroups.length === 0 && <EmptyRow colSpan={2} label="No blood groups yet — add one above." />}
          {bloodGroups.map((bg) =>
            editingId === bg.id ? (
              <tr key={bg.id} className="bg-blue-50/40">
                <td className="px-4 py-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus className="max-w-[140px]" />
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button onClick={saveEdit} className="p-1.5 rounded-md text-green-600 hover:bg-green-50" aria-label="Save">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100" aria-label="Cancel">
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={bg.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{bg.name}</td>
                <td className="px-4 py-2.5">
                  <RowActions onEdit={() => startEdit(bg)} onDelete={() => remove(bg)} />
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </PanelShell>
  )
}
