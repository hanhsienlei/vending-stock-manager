import { useState } from 'react'
import { listPlacements, setPlacement } from '../../data/repositories/placements'
import { pinSlotCapacities, setSlotConfig } from '../../data/repositories/slotConfigs'
import { effectivePlacement } from '../../domain/placement'
import { AdjustmentSheet } from '../adjustments/AdjustmentSheet'
import type { Id, Item } from '../../domain/types'

export function SlotEditSheet({
  machineId, slotNumber, items, currentItemIds, capacity, onSaved, onCancel,
  isFilled, onToggleFill, slotInMap,
}: {
  machineId: Id
  slotNumber: number
  items: Item[]
  currentItemIds: Id[]
  /** The slot's current effective capacity — from SlotConfig if one exists,
   * else derived from the preferred item's basePar (spec §4.3) — shown as
   * the field's starting value. */
  capacity: number
  onSaved: () => void
  onCancel: () => void
  /** Whether this slot is currently set to fill to capacity this visit.
   * Optional: `MachineMapScreen` opens this same sheet outside any count,
   * where there is no visit to fill into, so it passes neither this nor
   * `onToggleFill` and the control does not render (§3.6). */
  isFilled?: boolean
  onToggleFill?: () => void
  /** Whether `slotNumber` is actually in the machine's map. The count
   * screen's "Open slot" flow (an unmapped slot the operator typed a number
   * for) opens this sheet before the slot has any `ResolvedSlot` — `Fill to
   * capacity` would render but `toggleFill` returns immediately at its own
   * `map.find` guard, so the button could never do anything. The caller
   * knows whether the slot is mapped; the sheet must not infer it (fix 3b,
   * 2026-08-28 whole-branch review). Defaults to false so a caller that
   * omits it (none currently do) fails closed rather than showing a dead
   * button. */
  slotInMap?: boolean
}) {
  // Fix 4, 2026-08-28 whole-branch review: an unmapped map slot is fabricated
  // with capacity 0 (MachineMapScreen). Pre-filling "0" here let the
  // operator tap `⋯` on a "Not stocked" row and tap Save on a field that was
  // never going to do anything — `saveCapacity`'s `< 1` guard (unchanged,
  // correct) silently no-ops on it, forever, with no message. Starting the
  // field empty for that case, plus disabling Save while it reads empty or
  // below 1, turns the always-inert tap into a control the operator can see
  // is not ready yet.
  const [capacityInput, setCapacityInput] = useState(capacity === 0 ? '' : String(capacity))
  const capacityValue = Number(capacityInput)
  const canSaveCapacity = capacityInput.trim() !== '' && Number.isFinite(capacityValue) && capacityValue >= 1
  const [adjusting, setAdjusting] = useState<Id | null>(null)
  async function slotsFor(itemId: Id): Promise<number[]> {
    const placements = await listPlacements()
    return effectivePlacement(itemId, machineId, placements)?.slots ?? []
  }

  /** This edit changes what one slot on one machine holds, so pin that slot's
   * physical capacity first. The same helper serves the base-placement editor,
   * which pins the same slot across every machine. */
  async function pinSlot() {
    await pinSlotCapacities([machineId], [slotNumber])
  }

  async function add(itemId: Id) {
    const slots = await slotsFor(itemId)
    if (!slots.includes(slotNumber)) {
      await pinSlot()
      await setPlacement(itemId, { kind: 'machine', machineId }, [...slots, slotNumber])
    }
    onSaved()
  }

  /** An explicit capacity override always wins, replacing (not merging with)
   * whatever SlotConfig this slot already has, or creating one if it has
   * none. Passing the current `accepts` through keeps preference order
   * intact — an override touches capacity only.
   *
   * This writes to the same table `pinSlotCapacities` protects: once this
   * runs, the slot has a SlotConfig, so `pinSlotCapacities`'s create-only
   * `ensureSlotConfig` will see it on the next add/remove and leave the
   * override alone rather than re-deriving from basePar. No separate pin
   * call is needed here. */
  async function saveCapacity() {
    const value = Number(capacityInput)
    // Capacity 0 (item 8, fix-plan 2026-08-27) would fill the slot to
    // nothing and can never be legitimate — a slot that genuinely holds
    // nothing is "not stocked" (empty `accepts`), not a zero-deep one.
    if (!Number.isFinite(value) || value < 1) return
    await setSlotConfig(machineId, slotNumber, { capacity: value, accepts: currentItemIds })
    onSaved()
  }

  async function remove(itemId: Id) {
    const slots = await slotsFor(itemId)
    await pinSlot()
    await setPlacement(
      itemId,
      { kind: 'machine', machineId },
      slots.filter((s) => s !== slotNumber),
    )
    onSaved()
  }

  const present = items.filter((i) => currentItemIds.includes(i.id))
  const absent = items.filter((i) => !currentItemIds.includes(i.id))

  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 font-semibold">Slot {slotNumber}</h3>

      {onToggleFill && slotInMap && (
        <button
          type="button"
          aria-label={`Fill slot ${slotNumber}`}
          aria-pressed={isFilled}
          onClick={onToggleFill}
          className={`w-full border-b border-rule-light px-4 py-3 text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] ${
            isFilled ? 'bg-ink text-ground' : 'bg-ground text-ink'
          }`}
        >
          Fill to capacity
        </button>
      )}

      <label className="mb-3 flex items-end gap-2">
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase text-gray-500">Capacity</span>
          <input
            aria-label="Capacity"
            type="number"
            inputMode="numeric"
            min={1}
            className="rounded-lg border p-2"
            value={capacityInput}
            onChange={(e) => setCapacityInput(e.target.value)}
          />
        </span>
        <button
          type="button"
          disabled={!canSaveCapacity}
          onClick={() => void saveCapacity()}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save capacity
        </button>
      </label>

      <ul className="mb-3 flex flex-col gap-1">
        {present.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{item.name}</span>
            <button
              type="button"
              onClick={() => setAdjusting(item.id)}
              className="text-xs font-bold text-blue-600"
            >
              {`Adjust ${item.name}`}
            </button>
            <button
              type="button"
              onClick={() => void remove(item.id)}
              className="text-xs font-bold text-red-600"
            >
              {`Remove ${item.name}`}
            </button>
          </li>
        ))}
      </ul>

      <ul className="mb-3 flex max-h-48 flex-col gap-1 overflow-y-auto">
        {absent.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="flex-1 text-sm text-gray-500">{item.name}</span>
            <button
              type="button"
              onClick={() => void add(item.id)}
              className="text-xs font-bold text-blue-600"
            >
              {`Add ${item.name}`}
            </button>
          </li>
        ))}
      </ul>

      {adjusting !== null && (
        <AdjustmentSheet
          location={{ kind: 'machine', machineId, slotNumber }}
          itemId={adjusting}
          onSaved={() => {
            setAdjusting(null)
            onSaved()
          }}
          onCancel={() => setAdjusting(null)}
        />
      )}

      <button type="button" onClick={onCancel} className="text-sm text-gray-500">
        Close
      </button>
    </div>
  )
}
