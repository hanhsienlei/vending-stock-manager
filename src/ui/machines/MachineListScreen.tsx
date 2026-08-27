import { useEffect, useState } from 'react'
import { listMachines, saveMachine, deleteMachine } from '../../data/repositories/machines'
import { getOrCreateRun } from '../../data/repositories/runs'
import type { Id, Machine } from '../../domain/types'

export function MachineListScreen({
  onCount, onViewMap,
}: {
  onCount: (machineId: Id, runId: Id) => void
  onViewMap: (machineId: Id) => void
}) {
  const [machines, setMachines] = useState<Machine[]>([])
  const [level, setLevel] = useState('')
  const [label, setLabel] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<Id | null>(null)

  async function reload() {
    setMachines(await listMachines())
  }

  useEffect(() => {
    void reload()
  }, [])

  async function add() {
    if (level.trim() === '' || label.trim() === '') return
    await saveMachine({ level: Number(level), label: label.trim() })
    setLevel('')
    setLabel('')
    await reload()
  }

  async function startCount(machineId: Id) {
    const today = new Date().toISOString().slice(0, 10)
    const run = await getOrCreateRun(today)
    onCount(machineId, run.id)
  }

  async function remove(machineId: Id) {
    await deleteMachine(machineId)
    setConfirmingDeleteId(null)
    await reload()
  }

  return (
    <div className="p-4">
      <h2 className="mb-3 text-lg font-semibold">Machines</h2>

      <div className="mb-4 flex gap-2">
        <input
          aria-label="Level"
          type="number"
          placeholder="Level"
          className="w-24 rounded-lg border p-2"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        />
        <input
          aria-label="Location"
          placeholder="Location"
          className="flex-1 rounded-lg border p-2"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="button" onClick={add} className="font-semibold text-blue-600">
          Add
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {machines.map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded-lg border p-3">
            <button
              type="button"
              onClick={() => void startCount(m.id)}
              className="flex-1 text-left"
            >
              <span className="font-semibold">L{m.level}</span>
              <span className="ml-2 text-gray-500">{m.label}</span>
            </button>
            <button
              type="button"
              aria-label={`View map for L${m.level}`}
              onClick={() => onViewMap(m.id)}
              className="text-xs font-bold text-blue-600"
            >
              Map
            </button>
            {/* Destructive, so it sits last in the row — furthest from the
                flex-1 "start count" tap target — and needs a second tap. */}
            {confirmingDeleteId === m.id ? (
              <>
                <button
                  type="button"
                  aria-label={`Confirm delete L${m.level}`}
                  onClick={() => void remove(m.id)}
                  className="text-xs font-bold text-red-600"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(null)}
                  className="text-xs text-gray-500"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                aria-label={`Delete L${m.level}`}
                onClick={() => setConfirmingDeleteId(m.id)}
                className="text-xs font-bold text-red-600"
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
