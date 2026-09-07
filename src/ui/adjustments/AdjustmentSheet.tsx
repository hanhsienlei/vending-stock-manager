import { useEffect, useState } from 'react'
import { listMachines } from '../../data/repositories/machines'
import {
  recordAdjustment, recordTransfer, type AdjustmentLocation,
} from '../../data/repositories/adjustments'
import { OFFERED_REASONS, reasonSpec, type ReasonSpec } from '../../domain/adjustments'
import { isSlotNumber } from '../../domain/trays'
import type { AdjustmentReason, Id, Machine } from '../../domain/types'

/** What to show the operator when a write is refused. The repository's own
 * message is the specific one ("a transfer must not start and end at the same
 * location"); anything without a message falls back to a plain sentence
 * rather than "[object Object]". */
function messageFor(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : 'Could not record that. Nothing was saved.'
}

/** One sheet, both locations (design §7.1). Reached from `⋯` on a slot row and
 * from the storeroom screen, with the location already known from where it was
 * opened — nothing is added to the counting flow itself, which stays the
 * latency-critical path.
 *
 * Quantity is entered as a positive magnitude; the sign is decided by the
 * reason, so the operator never types a minus. */
export function AdjustmentSheet({
  location, itemId, itemName,
  reasons = OFFERED_REASONS,
  onSaved, onCancel,
}: {
  location: AdjustmentLocation
  itemId: Id
  /** The product being adjusted, named on screen.
   *
   * The sheet used to say only `Adjust storeroom stock`, and it covers the
   * row that was tapped in a sixty-row list — so nothing on screen said WHICH
   * item was about to be written off. `Adjustment` has no edit or delete path
   * (known-gaps.md), so an adjustment against the wrong product is silent and
   * permanent. Both call sites already hold the item. */
  itemName: string
  /** Which reasons to offer. Defaults to every reason the table still offers
   * — the same list at both locations since `miscount` was retired (design
   * §4.1), so neither call site has to know about it.
   *
   * A caller passes its own list only to withhold something the table cannot
   * know is unsafe *right now*: `SlotEditSheet` withholds `transfer` while
   * that machine's visit is open, because that is the window in which the
   * two after-counts already record the move (design §4.2). */
  reasons?: ReasonSpec[]
  onSaved: () => void
  onCancel: () => void
}) {
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState<AdjustmentReason>('expired')
  // Empty when the source is the storeroom: the storeroom cannot be its own
  // destination, so there is nothing valid to default to until the machine
  // list lands (see the effect below). Starting it at 'storeroom' made the
  // form's *initial* state invalid — Record then threw and, before this
  // sheet caught anything, did so silently.
  const [destination, setDestination] = useState<string>(
    location.kind === 'storeroom' ? '' : 'storeroom',
  )
  // Only meaningful once `destination` names a machine (see the field below).
  // Defaults to the source slot when the source is also a machine — the
  // common case of moving stock to the same slot number in a different
  // machine — and stays empty when the source is the storeroom, which has no
  // slot to default from.
  const [destinationSlot, setDestinationSlot] = useState<string>(
    location.kind === 'machine' ? String(location.slotNumber) : '',
  )
  const [machines, setMachines] = useState<Machine[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const loaded = await listMachines()
      setMachines(loaded)
      // A transfer out of the storeroom has to land at a machine, so the
      // select opens on the first one rather than on nothing.
      setDestination((current) => current || loaded[0]?.id || '')
    })()
  }, [])

  const destinationIsMachine = reason === 'transfer' && destination !== 'storeroom'

  // §7's RESULT cell. Plain terms, both sides, before the commit — a
  // transfer is the one place this sheet can silently do the wrong thing,
  // and `recordTransfer` writes both rows atomically.
  const machineById = new Map(machines.map((m) => [m.id, m]))
  const magnitude = Number(quantity)
  const shownUnits = Number.isInteger(magnitude) && magnitude >= 1 ? magnitude : 0
  const here = location.kind === 'storeroom'
    ? 'Storeroom G'
    : `L${machineById.get(location.machineId)?.level ?? '?'}·${location.slotNumber}`
  const there = destination === 'storeroom'
    ? 'Storeroom G'
    : `L${machineById.get(destination)?.level ?? '?'}·${destinationSlot || '—'}`
  // Every reason still on offer has a sign of its own: a transfer leaves
  // here, a delivery arrives, and the rest are write-offs. The
  // correction-direction control went with `miscount` (design §4.1), which
  // was the only reason whose sign the operator had to choose.
  const sign = reason === 'transfer' || reasonSpec(reason).totalStock !== 'increase'
    ? 'down'
    : 'up'

  // §7: "The commit button names the reason: `Record move`, `Record
  // delivery`. Not `Record`." Derived from the table, so a new reason gets a
  // sensible verb without an edit here.
  const commitLabel =
    reason === 'transfer' ? 'Record move'
      : reason === 'delivery' ? 'Record delivery'
      : 'Record write-off'

  const spanning = reasons.filter((r) => r.reason === 'transfer')
  const tiles = reasons.filter((r) => r.reason !== 'transfer')
  const miscountWithheld = !reasons.some((r) => r.reason === 'miscount')

  async function record() {
    const magnitude = Number(quantity)
    if (!Number.isInteger(magnitude) || magnitude < 1) {
      setError('Enter a whole number of at least one unit.')
      return
    }

    if (reason === 'transfer') {
      let to: AdjustmentLocation
      if (destination === '') {
        setError('Choose where the stock is going.')
        return
      }
      if (destination === 'storeroom') {
        to = { kind: 'storeroom' }
      } else {
        // The destination slot is asked for explicitly rather than reused
        // from the source: the source may be the storeroom, which has no
        // slot number, and a machine-to-machine move is not guaranteed to
        // land in the same physical slot either. Validated against
        // `isSlotNumber` — the app's slots run 10–14, 20–29 … 60–69 — so a
        // typo here can never land a movement at a non-physical slot and
        // poison the sales residual, which pairs on (slot, item).
        const slot = Number(destinationSlot)
        if (!isSlotNumber(slot)) {
          setError('Enter a valid destination slot.')
          return
        }
        to = { kind: 'machine', machineId: destination, slotNumber: slot }
      }
      setError(null)
      // A rejected write must say so. Without this the rejection was
      // discarded by the onClick — the sheet stayed open, the alert stayed
      // empty and nothing was recorded, which from the operator's side is a
      // button that does nothing.
      try {
        await recordTransfer({ itemId, units: magnitude, from: location, to })
      } catch (err) {
        setError(messageFor(err))
        return
      }
      onSaved()
      return
    }

    setError(null)

    // `delivery` is the only reason that adds stock (spec §5.3); everything
    // else still on offer removes it.
    const signed = reasonSpec(reason).totalStock === 'increase' ? magnitude : -magnitude

    try {
      await recordAdjustment({
        itemId,
        ...(location.kind === 'storeroom'
          ? { locationKind: 'storeroom' as const }
          : {
              locationKind: 'machine' as const,
              machineId: location.machineId,
              slotNumber: location.slotNumber,
            }),
        reason,
        units: signed,
      })
    } catch (err) {
      setError(messageFor(err))
      return
    }
    onSaved()
  }

  return (
    <div className="bg-paper">
      <div data-testid="adjustment-header" className="bg-ink px-4 py-2.5 text-ground">
        <h3 className="text-[19px] font-extrabold">
          {location.kind === 'storeroom'
            ? 'Adjust storeroom stock'
            : `Adjust slot ${location.slotNumber}`}
        </h3>
        {/* Same treatment as the slot editor's `L7 · Tray 3` context line. */}
        <p className="truncate text-[13px] font-medium opacity-70">{itemName}</p>
      </div>

      <div className="border-b-2 border-rule-strong px-4 py-3">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          Reason
        </span>
        {/* Reason first, because reason governs which fields exist below and
            which way the number goes. A `<select>` hid that: the destination
            and direction fields rendered below a control the operator had
            already scrolled past. */}
        <div data-testid="reason-grid" className="mt-1.5 grid grid-cols-2 gap-px bg-rule-light">
          {tiles.map((r) => (
            <button
              key={r.reason}
              type="button"
              aria-pressed={reason === r.reason}
              onClick={() => setReason(r.reason)}
              className={`px-3 py-2.5 text-left text-[12.5px] font-bold ${
                reason === r.reason ? 'bg-ink text-ground' : 'bg-paper text-ink'
              }`}
            >
              {r.label}
            </button>
          ))}
          {spanning.map((r) => (
            <button
              key={r.reason}
              type="button"
              aria-pressed={reason === r.reason}
              onClick={() => setReason(r.reason)}
              className={`col-span-2 px-3 py-2.5 text-left text-[12.5px] font-bold ${
                reason === r.reason ? 'bg-ink text-ground' : 'bg-paper text-ink'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b-2 border-rule-strong bg-rule-light">
        <label className="flex flex-col gap-1 bg-paper px-4 py-3">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
            Units
          </span>
          <input
            aria-label="Units"
            type="number"
            inputMode="numeric"
            min={1}
            className="w-full border-b-2 border-ink bg-transparent pb-1 text-[24px] font-extrabold tabular-nums outline-none"
            value={quantity}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>

        <div
          aria-label="Result"
          className="flex flex-col justify-end gap-1 bg-neutral-100 px-4 py-3"
        >
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
            Result
          </span>
          <span className="text-[13px] font-bold tabular-nums">
            {here} {sign} {shownUnits}
          </span>
          <span className="truncate text-[11px] font-medium text-neutral-700">
            {itemName}
          </span>
          {reason === 'transfer' && (
            <span className="text-[13px] font-bold tabular-nums">
              {there} up {shownUnits}
            </span>
          )}
        </div>

        {reason === 'transfer' && (
          <label className="flex flex-col gap-1 bg-paper px-4 py-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
              To machine
            </span>
            <select
              aria-label="To machine"
              className="border-b-2 border-ink bg-transparent pb-1 text-[13.5px] outline-none"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              {/* The storeroom is only a destination when it is not also the
                  source — a transfer that starts and ends in the same place is
                  refused by `recordTransfer`, so it must not be offerable. */}
              {location.kind !== 'storeroom' && (
                <option value="storeroom">Storeroom G</option>
              )}
              {machines
                .filter((m) => location.kind !== 'machine' || m.id !== location.machineId)
                .map((m) => (
                  <option key={m.id} value={m.id}>L{m.level}</option>
                ))}
            </select>
          </label>
        )}

        {destinationIsMachine && (
          <label className="flex flex-col gap-1 bg-paper px-4 py-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
              Into slot
            </span>
            <input
              aria-label="Into slot"
              type="number"
              inputMode="numeric"
              className="w-full border-b-2 border-ink bg-transparent pb-1 text-[24px] font-extrabold tabular-nums outline-none"
              value={destinationSlot}
              onChange={(e) => setDestinationSlot(e.target.value)}
            />
          </label>
        )}
      </div>

      {/* Both known-gaps.md warnings, at the point of the mistake. */}
      {reason === 'transfer' && (
        <p className="bg-accent-200 px-4 py-2.5 text-[11px] font-medium text-accent-800">
          Only for stock moved between visits. If you moved it during this run,
          the two refilled-to counts already record it — logging it here as well
          subtracts it twice.
        </p>
      )}
      {location.kind === 'storeroom' && miscountWithheld && (
        <p className="bg-surface px-4 py-2.5 text-[11px] font-medium text-neutral-700">
          Miscount is not offered here. To correct the storeroom figure, type it
          into <strong>your count</strong> on the storeroom row instead — that
          resets the estimate to the truth.
        </p>
      )}

      {error && (
        <span
          role="alert"
          className="block bg-accent-200 px-4 py-2.5 text-[11px] font-bold text-accent-800"
        >
          {error}
        </span>
      )}

      <div className="flex border-t-2 border-rule-strong">
        <button
          type="button"
          onClick={() => void record()}
          className="flex-1 bg-accent px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-ground"
        >
          {commitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-ground px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-neutral-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
