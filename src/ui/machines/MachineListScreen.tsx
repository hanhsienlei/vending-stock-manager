import { useEffect, useState } from 'react'
import { listMachines, saveMachine } from '../../data/repositories/machines'
import type { Id, Machine } from '../../domain/types'

export function MachineListScreen({ onSelect }: { onSelect: (id: Id) => void }) {
  const [machines, setMachines] = useState<Machine[]>([])
  const [level, setLevel] = useState('')
  const [label, setLabel] = useState('')

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
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m.id)}
              className="w-full rounded-lg border p-3 text-left"
            >
              <span className="font-semibold">L{m.level}</span>
              <span className="ml-2 text-gray-500">{m.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
