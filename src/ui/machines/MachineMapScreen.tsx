import { TRAYS, trayOf, trayLabel } from '../../domain/trays'
import { useMachineMap } from '../useMachineMap'
import { distinctLabel } from './machineLabel'
import type { Machine } from '../../domain/types'

export function MachineMapScreen({
  machine, onBack,
}: {
  machine: Machine
  onBack: () => void
}) {
  const { map, items, loading } = useMachineMap(machine.id)

  if (loading) return <div className="p-4">Loading…</div>

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-blue-600">
          ← Back
        </button>
        <span className="text-sm">
          <span className="font-semibold">L{machine.level}</span>
          {distinctLabel(machine) && (
            <span className="ml-2 text-gray-500">{distinctLabel(machine)}</span>
          )}
        </span>
      </div>

      {TRAYS.map((tray) => {
        const slots = map.filter((s) => trayOf(s.slotNumber) === tray)
        if (slots.length === 0) return null
        return (
          <section key={tray} className="mb-4">
            <h3 className="mb-2 text-xs font-bold uppercase text-gray-500">
              {trayLabel(tray)}
            </h3>
            <ul className="flex flex-col gap-1">
              {slots.map((slot) => (
                <li
                  key={slot.slotNumber}
                  className="flex items-center gap-3 rounded-lg border p-2"
                >
                  <span className="w-8 text-sm font-bold text-gray-500">
                    {slot.slotNumber}
                  </span>
                  <span className="flex-1 text-sm">
                    {slot.accepts.map((id) => items.get(id)?.name ?? '?').join(' / ')}
                  </span>
                  <span className="text-xs text-gray-400">cap {slot.capacity}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
