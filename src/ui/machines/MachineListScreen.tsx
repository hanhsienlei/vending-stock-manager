import { useEffect, useState } from 'react'
import { listMachines } from '../../data/repositories/machines'
import { getOrCreateRun, getRunForDate } from '../../data/repositories/runs'
import { listVisitsForRun } from '../../data/repositories/visits'
import type { Id, Machine } from '../../domain/types'

const today = () => new Date().toISOString().slice(0, 10)

export function MachineListScreen({
  onCount, onViewMap,
}: {
  onCount: (machineId: Id, runId: Id) => void
  onViewMap: (machine: Machine) => void
}) {
  const [machines, setMachines] = useState<Machine[]>([])
  // Status indicator only, never a gate — the amended spec §7 makes a
  // finished machine editable again, so this set only decides what a row
  // shows, never whether `startCount` below is allowed to run.
  const [finishedMachineIds, setFinishedMachineIds] = useState<Set<Id>>(new Set())

  async function reload() {
    setMachines(await listMachines())

    // A read-only lookup — never getOrCreateRun — so merely viewing this
    // screen can't mint an empty run before the operator starts counting.
    const run = await getRunForDate(today())
    if (!run) {
      setFinishedMachineIds(new Set())
      return
    }
    const visits = await listVisitsForRun(run.id)
    setFinishedMachineIds(
      new Set(visits.filter((v) => v.status === 'finalized').map((v) => v.machineId)),
    )
  }

  useEffect(() => {
    void reload()
  }, [])

  async function startCount(machineId: Id) {
    const run = await getOrCreateRun(today())
    onCount(machineId, run.id)
  }

  return (
    <div className="p-4">
      <h2 className="mb-3 text-lg font-semibold">Machines</h2>

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
              {finishedMachineIds.has(m.id) && (
                <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold uppercase text-green-700">
                  Finished
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label={`View map for L${m.level}`}
              onClick={() => onViewMap(m)}
              className="text-xs font-bold text-blue-600"
            >
              Map
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
