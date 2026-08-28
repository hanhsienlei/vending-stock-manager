import { useState } from 'react'
import { TrayTabs } from '../components/TrayTabs'
import { SlotRow } from './SlotRow'
import { SlotEditSheet } from './SlotEditSheet'
import { parseSlotNumbers, trayOf } from '../../domain/trays'
import { useCounting } from './useCounting'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
import type { Id, Machine } from '../../domain/types'

export function CountScreen({
  runId, machineId, machine, onDone,
}: {
  runId: Id
  machineId: Id
  // Optional, and kept separate from `machineId` rather than replacing it:
  // this screen's own CountScreen.test.tsx suite renders it directly with
  // only `machineId` many times over, and this task is shell-only — it must
  // not ripple into that unrelated test setup. Callers that have the
  // `Machine` object already loaded (App does, from the machine list) pass
  // it through so the header can say `L{level}`.
  machine?: Machine
  onDone: () => void
}) {
  const counting = useCounting(runId, machineId)
  const [tray, setTray] = useState<number | null>(null)
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
  const [newSlot, setNewSlot] = useState('')
  const [newSlotError, setNewSlotError] = useState<string | null>(null)

  // Title-only for now (task 3): this screen's own spec section — back
  // affordance, state word, figure, progress rule — belongs to a later task.
  // See task-3-brief.md decision #1.
  const header = <ScreenHeader title={machine ? `L${machine.level}` : 'Count'} />

  if (counting.loading) {
    return (
      <ScreenLayout header={header}>
        <div className="p-4">Loading…</div>
      </ScreenLayout>
    )
  }

  const present = new Set(counting.map.map((s) => trayOf(s.slotNumber)))
  // No fallback tray: a machine with nothing mapped has no active tray, and
  // pretending it is on tray 10 renders an empty tray list that looks like a
  // machine legitimately holding nothing.
  const activeTray = tray ?? [...present].sort((a, b) => a - b)[0] ?? null
  const slots =
    activeTray === null
      ? []
      : counting.map.filter((s) => trayOf(s.slotNumber) === activeTray)

  function openSlot() {
    const { slots: parsed, invalid } = parseSlotNumbers(newSlot)
    if (invalid.length > 0 || parsed.length !== 1) {
      setNewSlotError(
        `${newSlot.trim() || 'That'} is not a slot number. Slots run 10–14, 20–29, 30–39, 40–49, 50–59, 60–69.`,
      )
      return
    }
    setNewSlotError(null)
    setEditingSlot(parsed[0])
  }

  return (
    <ScreenLayout header={header}>
      <div>
        {activeTray !== null && (
          <TrayTabs active={activeTray} onSelect={setTray} present={present} />
        )}

        {counting.map.length === 0 && editingSlot === null && (
          <div className="flex flex-col gap-2 p-4">
            <p className="font-semibold">No slots are mapped for this machine.</p>
            <p className="text-sm text-gray-500">
              Set an item&apos;s slots on the Items screen to map every machine at
              once, or open one slot here and fill it in at the machine.
            </p>
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs font-bold uppercase text-gray-500">
                  Slot number
                </span>
                <input
                  aria-label="Slot number"
                  inputMode="numeric"
                  placeholder="58"
                  className="rounded-lg border p-2"
                  value={newSlot}
                  onChange={(e) => setNewSlot(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={openSlot}
                className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white"
              >
                Open slot
              </button>
            </div>
            {newSlotError && (
              <span role="alert" className="text-xs font-semibold text-red-600">
                {newSlotError}
              </span>
            )}
          </div>
        )}

        <ul className="flex flex-col gap-2 p-2">
          {slots.map((slot) => (
            <SlotRow
              key={slot.slotNumber}
              slot={slot}
              items={counting.items}
              before={counting.before}
              after={counting.after}
              touched={counting.touched}
              ranDry={counting.ranDry(slot)}
              onSetBefore={(slotNumber, itemId, qty) => {
                // useCounting has already rolled local state back to the
                // pre-change values on a rejected write — writing to a
                // finalized visit is not one of the ways this fails any more
                // (spec §7, amended 2026-08-27: finalizedAt is a marker, not a
                // lock); a genuine rejection (the visit was deleted, IndexedDB
                // unavailable) still can, so swallow here rather than leaving
                // an unhandled rejection. No UI error surface is in scope for
                // this task.
                counting.setBefore(slotNumber, itemId, qty).catch(() => {})
              }}
              onSetAfter={(slotNumber, itemId, qty) => {
                counting.setAfter(slotNumber, itemId, qty).catch(() => {})
              }}
              onEdit={setEditingSlot}
            />
          ))}
        </ul>

        {editingSlot !== null && (
          <SlotEditSheet
            machineId={machineId}
            slotNumber={editingSlot}
            items={[...counting.items.values()]}
            currentItemIds={
              counting.map.find((s) => s.slotNumber === editingSlot)?.accepts ?? []
            }
            capacity={counting.map.find((s) => s.slotNumber === editingSlot)?.capacity ?? 0}
            onSaved={() => {
              setEditingSlot(null)
              setNewSlot('')
              void counting.reload()
            }}
            onCancel={() => setEditingSlot(null)}
          />
        )}

        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              // Same shape as the stepper handlers: finalize is not a no-op on
              // an already-finalized visit — it always re-runs the whole-
              // machine batch and re-stamps updatedAt/finalizedAt (spec §7,
              // amended 2026-08-27), including when re-finishing a machine
              // that was already done. A rejected write must still not
              // surface as an unhandled rejection, and must still leave the
              // machine either way.
              void counting.finalize().catch(() => {}).then(onDone)
            }}
            className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white"
          >
            Finish machine
          </button>
        </div>
      </div>
    </ScreenLayout>
  )
}
