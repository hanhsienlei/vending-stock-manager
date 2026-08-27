import { useEffect, useState } from 'react'
import { listMachines } from '../../data/repositories/machines'
import {
  recordAdjustment, recordTransfer, type AdjustmentLocation,
} from '../../data/repositories/adjustments'
import { ADJUSTMENT_REASONS, reasonSpec, type ReasonSpec } from '../../domain/adjustments'
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
  location, itemId, reasons = ADJUSTMENT_REASONS, onSaved, onCancel,
}: {
  location: AdjustmentLocation
  itemId: Id
  /** Which reasons to offer. Defaults to the full table (spec §5.3). The
   * storeroom screen passes a narrower list — a `miscount` recorded there
   * would be excluded from `ledgerBalance` (domain/storeroom.ts, fix round
   * 1, finding 1) and so would silently do nothing; the storeroom's own
   * correction mechanism is the manual count, which resets the ledger
   * anchor directly. */
  reasons?: ReasonSpec[]
  onSaved: () => void
  onCancel: () => void
}) {
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState<AdjustmentReason>('expired')
  // Only meaningful for a reason whose `totalStock` is 'unchanged' and which
  // is not itself a transfer — i.e. `miscount` today, without hard-coding
  // that reason string here (see `needsDirection` below). A miscount has no
  // inherent sign: "totalStock === 'increase'" is false for it, so treating
  // "not increase" as "decrease" (the brief's original rule) always lowered
  // the figure, even when the operator counted MORE than was recorded.
  const [direction, setDirection] = useState<'more' | 'fewer'>('more')
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
  // A reason with `totalStock === 'unchanged'` has no sign of its own — the
  // brief's original rule folded that into "not increase", i.e. always
  // negative, which is wrong for a miscount that corrects the figure
  // upward. `transfer` is also 'unchanged' but is excluded here: its sign
  // comes from source/destination, not from an operator-chosen direction.
  const needsDirection = reasonSpec(reason).totalStock === 'unchanged' && reason !== 'transfer'

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
    // else here removes it — except a miscount, whose sign the operator
    // chooses explicitly via `direction`, since "totalStock === 'unchanged'"
    // says nothing about which way the correction goes. A miscount is
    // excluded from the residual by reason, not by sign (see
    // `entersResidual`).
    const signed = needsDirection
      ? (direction === 'more' ? magnitude : -magnitude)
      : (reasonSpec(reason).totalStock === 'increase' ? magnitude : -magnitude)

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
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 font-semibold">
        {location.kind === 'storeroom'
          ? 'Adjust storeroom stock'
          : `Adjust slot ${location.slotNumber}`}
      </h3>

      <label className="mb-2 flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-gray-500">Quantity</span>
        <input
          aria-label="Quantity"
          type="number"
          inputMode="numeric"
          min={1}
          className="rounded-lg border p-2"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>

      <label className="mb-2 flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-gray-500">Reason</span>
        <select
          aria-label="Reason"
          className="rounded-lg border p-2"
          value={reason}
          onChange={(e) => setReason(e.target.value as AdjustmentReason)}
        >
          {reasons.map((r) => (
            <option key={r.reason} value={r.reason}>{r.label}</option>
          ))}
        </select>
      </label>

      {needsDirection && (
        <label className="mb-2 flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-gray-500">Correction direction</span>
          <select
            aria-label="Correction direction"
            className="rounded-lg border p-2"
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'more' | 'fewer')}
          >
            <option value="more">There are more than recorded</option>
            <option value="fewer">There are fewer than recorded</option>
          </select>
        </label>
      )}

      {reason === 'transfer' && (
        <label className="mb-2 flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-gray-500">Destination</span>
          <select
            aria-label="Destination"
            className="rounded-lg border p-2"
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
        <label className="mb-2 flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-gray-500">Destination slot</span>
          <input
            aria-label="Destination slot"
            type="number"
            inputMode="numeric"
            className="rounded-lg border p-2"
            value={destinationSlot}
            onChange={(e) => setDestinationSlot(e.target.value)}
          />
        </label>
      )}

      {error && (
        <span role="alert" className="mb-2 block text-xs font-semibold text-red-600">
          {error}
        </span>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void record()}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
        >
          Record
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500">
          Cancel
        </button>
      </div>
    </div>
  )
}
