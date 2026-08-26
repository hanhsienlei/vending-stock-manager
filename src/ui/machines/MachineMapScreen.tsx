import { TRAYS, trayOf } from '../../domain/trays'
import { useMachineMap } from '../useMachineMap'
import type { Id } from '../../domain/types'

export function MachineMapScreen({
  machineId, onBack,
}: {
  machineId: Id
  onBack: () => void
}) {
  const { map, items, loading } = useMachineMap(machineId)

  if (loading) return <div className="p-4">Loading…</div>

  return (
    <div className="p-4">
      <button type="button" onClick={onBack} className="mb-3 text-blue-600">
        ← Back
      </button>

      {TRAYS.map((tray) => {
        const slots = map.filter((s) => trayOf(s.slotNumber) === tray)
        if (slots.length === 0) return null
        return (
          <section key={tray} className="mb-4">
            <h3 className="mb-2 text-xs font-bold uppercase text-gray-500">Tray {tray}</h3>
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
