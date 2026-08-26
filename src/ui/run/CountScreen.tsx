import { useState } from 'react'
import { TrayTabs } from '../components/TrayTabs'
import { SlotRow } from './SlotRow'
import { trayOf } from '../../domain/trays'
import { useCounting } from './useCounting'
import type { Id } from '../../domain/types'

export function CountScreen({
  runId, machineId, onDone,
}: {
  runId: Id
  machineId: Id
  onDone: () => void
}) {
  const counting = useCounting(runId, machineId)
  const [tray, setTray] = useState<number | null>(null)

  if (counting.loading) return <div className="p-4">Loading…</div>

  const present = new Set(counting.map.map((s) => trayOf(s.slotNumber)))
  const activeTray = tray ?? [...present].sort((a, b) => a - b)[0] ?? 10
  const slots = counting.map.filter((s) => trayOf(s.slotNumber) === activeTray)

  return (
    <div>
      <TrayTabs active={activeTray} onSelect={setTray} present={present} />

      <ul className="flex flex-col gap-2 p-2">
        {slots.map((slot) => (
          <SlotRow
            key={slot.slotNumber}
            slot={slot}
            items={counting.items}
            before={counting.before}
            isFilled={counting.filled.has(slot.slotNumber)}
            ranDry={counting.ranDry(slot)}
            onSetBefore={(slotNumber, itemId, qty) => {
              // useCounting has already rolled local state back to the
              // pre-change values on a rejected write (e.g. a finalized
              // visit); swallow here so it isn't an unhandled rejection.
              // No UI error surface is in scope for this task.
              counting.setBefore(slotNumber, itemId, qty).catch(() => {})
            }}
            onToggleFill={(slotNumber) => {
              counting.toggleFill(slotNumber).catch(() => {})
            }}
          />
        ))}
      </ul>

      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            void counting.finalize().then(onDone)
          }}
          className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white"
        >
          Finish machine
        </button>
      </div>
    </div>
  )
}
