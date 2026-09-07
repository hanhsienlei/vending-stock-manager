import { useEffect, useMemo, useState } from 'react'
import { listPlacements, setPlacement } from '../../data/repositories/placements'
import { pinSlotCapacities, setSlotConfig } from '../../data/repositories/slotConfigs'
import { effectivePlacement } from '../../domain/placement'
import { trayOf, trayLabel } from '../../domain/trays'
import { AdjustmentSheet } from '../adjustments/AdjustmentSheet'
import { OFFERED_REASONS } from '../../domain/adjustments'
import type { Id, Item, ItemPlacement, Machine } from '../../domain/types'

/** What a slot may be adjusted for while its machine's visit is open: every
 * reason still on offer except `transfer`, which the two after-counts are
 * already recording for the length of that window (design §4.2). Named here
 * rather than inline so it is one array, not one per render. */
const WITH_VISIT_OPEN = OFFERED_REASONS.filter((r) => r.reason !== 'transfer')

export function SlotEditSheet({
  machine, slotNumber, items, currentItemIds, capacity, onSaved, onCancel,
  isFilled, onToggleFill, slotInMap, visitOpen,
}: {
  /** The machine this slot belongs to. Was `machineId`; the whole object is
   * passed so the sheet's title bar can say `L7 · Tray 3` without a lookup.
   * Both call sites already hold a `Machine`. */
  machine: Machine
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
  /** Whether this machine's visit in today's run is still open — i.e. the
   * operator is counting it right now. While it is, the slot's adjustment
   * sheet withholds `transfer`: stock moved between machines mid-run is
   * already recorded by the source's lower after-count and the destination's
   * higher one, so a transfer logged as well subtracts the move twice
   * (design §4.2, D9). The source's residual then clamps at zero, losing
   * genuine sales, and Phase 3's demand rate learns from both ends of it.
   *
   * Outside that window — between visits, or once the machine is finished —
   * `transfer` stays on offer, because that is the case it exists for.
   * Defaults to false, which is what the machine map screen (no visit in
   * hand) wants. */
  visitOpen?: boolean
}) {
  const machineId = machine.id

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

  // The item's BASE slot, shown beside each addable item (§6). Loaded once
  // here rather than per row: `listPlacements` is a single table read and the
  // sheet already calls it on every add and remove.
  const [basePlacements, setBasePlacements] = useState<ItemPlacement[]>([])
  useEffect(() => {
    void (async () => {
      const all = await listPlacements()
      setBasePlacements(all.filter((p) => p.scope.kind === 'base'))
    })()
  }, [])

  const baseSlotByItem = useMemo(() => {
    const map = new Map<Id, number>()
    for (const p of basePlacements) {
      const first = [...p.slots].sort((a, b) => a - b)[0]
      if (first !== undefined) map.set(p.itemId, first)
    }
    return map
  }, [basePlacements])

  const [addSearch, setAddSearch] = useState('')

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

  /** Move one item to the front of `accepts`, leaving the rest in the order
   * they were already in (D10, design §3.8).
   *
   * `accepts[0]` is not a label: `fillToCapacity` tops it up, and the order
   * suggestion attributes the whole slot's demand to it — the alternative,
   * spec §6.4's "Σ over slots accepting this item", double-counts every mixed
   * slot. So through a Coke → Coke + Fanta → Fanta changeover the outgoing
   * item is forecast demand it will never take and the incoming one gets
   * none, and until now the only way to change the order was to remove an
   * item and add it back. This is the same root cause as known-gaps.md's
   * "Fill fights a product changeover": one control, two costs.
   *
   * Pins the slot's capacity first, exactly as `add` and `remove` do —
   * `setSlotConfig` refuses to create a config without one, and resolving
   * capacity from the first accepted item's basePar is what the pin exists to
   * stop moving underneath an edit. */
  async function makeFirst(itemId: Id) {
    await pinSlot()
    await setSlotConfig(machineId, slotNumber, {
      accepts: [itemId, ...currentItemIds.filter((id) => id !== itemId)],
    })
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

  // In preference order, not catalogue order: `currentItemIds` IS the order,
  // and a list that showed it any other way would make `MAKE FIRST` read as a
  // no-op on a row that already looked first.
  const present = currentItemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => i !== undefined)
  const absent = items
    .filter((i) => !currentItemIds.includes(i.id))
    .filter((i) => i.name.toLowerCase().includes(addSearch.trim().toLowerCase()))

  return (
    <div className="bg-paper">
      <div className="flex items-baseline justify-between bg-ink px-4 py-2.5 text-ground">
        <h3 className="text-[19px] font-extrabold">
          Slot {slotNumber}
          <span className="ml-2 text-[13px] font-medium opacity-70">
            L{machine.level} · {trayLabel(trayOf(slotNumber))}
          </span>
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
        >
          Close
        </button>
      </div>

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

      <div className="border-b-2 border-rule-strong px-4 py-3">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          Capacity · this machine only
        </span>
        <div className="mt-1 flex items-end gap-3">
          <input
            aria-label="Capacity"
            type="number"
            inputMode="numeric"
            min={1}
            className="w-20 border-b-2 border-ink bg-transparent pb-1 text-[24px] font-extrabold tabular-nums outline-none"
            value={capacityInput}
            onChange={(e) => setCapacityInput(e.target.value)}
          />
          <button
            type="button"
            disabled={!canSaveCapacity}
            onClick={() => void saveCapacity()}
            className="border-2 border-ink px-3 py-1.5 text-[12.5px] font-extrabold uppercase tracking-[0.04em] disabled:opacity-45"
          >
            Save
          </button>
        </div>
        <p className="mt-2 text-[11px] font-medium text-neutral-700">
          Overrides the item&rsquo;s par level here. Leave it if the whole estate
          is the same depth.
        </p>
      </div>

      <div className="border-b-2 border-rule-strong">
        <div className="bg-surface px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          In this slot
        </div>
        {present.length === 0 ? (
          <p className="px-4 py-2.5 text-[13px] text-neutral-500">Not stocked.</p>
        ) : (
          <ul>
            {present.map((item, index) => (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-rule-light px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                  {item.name}
                </span>
                {/* D10. Only on the rows that are not already first — on the
                    first row it would be a control that visibly does nothing.
                    Neutral, not accent: reordering is housekeeping, and the
                    accent on this row belongs to REMOVE. */}
                {index > 0 && (
                  <button
                    type="button"
                    aria-label={`Make ${item.name} first`}
                    onClick={() => void makeFirst(item.id)}
                    className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.12em] text-neutral-700"
                  >
                    MAKE FIRST
                  </button>
                )}
                {/* §6: the row is the subject, the button is the verb. The
                    full string stays as the accessible name. */}
                <button
                  type="button"
                  aria-label={`Adjust ${item.name}`}
                  onClick={() => setAdjusting(item.id)}
                  className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.12em] text-neutral-700"
                >
                  ADJUST
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => void remove(item.id)}
                  className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent-700"
                >
                  REMOVE
                </button>
              </li>
            ))}
          </ul>
        )}
        {present.length > 1 && (
          <p className="bg-accent-200 px-4 py-2 text-[11px] font-medium text-accent-800">
            Two items means a changeover. Fill tops up whichever is first, and
            the order suggestion counts this slot towards it. Make the incoming
            line first.
          </p>
        )}
      </div>

      <div>
        <div className="bg-surface px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          Add an item
        </div>
        <div className="border-b border-rule-light px-4 py-2">
          <input
            type="search"
            aria-label="Search items to add"
            placeholder="Search items"
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            className="w-full border-b-2 border-ink bg-transparent pb-1 text-[13.5px] outline-none"
          />
        </div>
        <ul className="max-h-48 overflow-y-auto">
          {absent.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 border-b border-rule-light px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-neutral-700">
                {item.name}
                {baseSlotByItem.has(item.id) && (
                  <span className="ml-1.5 text-[11px] text-neutral-500">
                    {`· usually ${baseSlotByItem.get(item.id)}`}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label={`Add ${item.name}`}
                onClick={() => void add(item.id)}
                className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent-700"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      </div>

      {adjusting !== null && (
        <AdjustmentSheet
          location={{ kind: 'machine', machineId, slotNumber }}
          itemId={adjusting}
          itemName={items.find((i) => i.id === adjusting)?.name ?? ''}
          reasons={visitOpen ? WITH_VISIT_OPEN : undefined}
          onSaved={() => {
            setAdjusting(null)
            onSaved()
          }}
          onCancel={() => setAdjusting(null)}
        />
      )}
    </div>
  )
}
