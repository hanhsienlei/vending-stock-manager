import { useEffect, useState } from 'react'
import { listMachines } from '../../data/repositories/machines'
import { getOrCreateRun } from '../../data/repositories/runs'
import type { Id, Machine } from '../../domain/types'

export function MachineListScreen({
  onCount, onViewMap,
}: {
  onCount: (machineId: Id, runId: Id) => void
  onViewMap: (machineId: Id) => void
}) {
  const [machines, setMachines] = useState<Machine[]>([])

  async function reload() {
    setMachines(await listMachines())
  }

  useEffect(() => {
    void reload()
  }, [])

  async function startCount(machineId: Id) {
    const today = new Date().toISOString().slice(0, 10)
    const run = await getOrCreateRun(today)
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
            </button>
            <button
              type="button"
              aria-label={`View map for L${m.level}`}
              onClick={() => onViewMap(m.id)}
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
