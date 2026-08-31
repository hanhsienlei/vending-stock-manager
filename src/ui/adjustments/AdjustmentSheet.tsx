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

/** A slot correction is written and read by nothing: `entersResidual` already
 * excludes it from the sales residual (correctly — it is a data fix, not a
 * stock movement), it touches no `CountLine`, and no screen reads it back
 * (docs/known-gaps.md). Withheld at a machine slot by operator decision,
 * 2026-08-28 (design §7) — matching the storeroom, which withheld it first.
 * Derived with the same predicate the storeroom uses, so this is not a
 * second hard-coded list: a future row in `ADJUSTMENT_REASONS` reaches both
 * call sites without an edit here. */
const SLOT_ADJUSTMENT_REASONS = ADJUSTMENT_REASONS.filter((r) => r.entersResidual)

/** One sheet, both locations (design §7.1). Reached from `⋯` on a slot row and
 * from the storeroom screen, with the location already known from where it was
 * opened — nothing is added to the counting flow itself, which stays the
 * latency-critical path.
 *
 * Quantity is entered as a positive magnitude; the sign is decided by the
 * reason, so the operator never types a minus. */
export function AdjustmentSheet({
  location, itemId,
  reasons = location.kind === 'machine' ? SLOT_ADJUSTMENT_REASONS : ADJUSTMENT_REASONS,
  onSaved, onCancel,
}: {
  location: AdjustmentLocation
  itemId: Id
  /** Which reasons to offer. Defaults to the full table at the storeroom, and
   * to `SLOT_ADJUSTMENT_REASONS` (above) at a machine slot, where `miscount`
   * is withheld. The storeroom screen additionally passes its own narrower
   * list explicitly, for the same underlying reason — a `miscount` recorded
   * there would be excluded from `ledgerBalance` (domain/storeroom.ts, fix
   * round 1, finding 1) and so would silently do nothing; the storeroom's own
   * correction mechanism is the manual count, which resets the ledger anchor
   * directly. */
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
  // `miscount` is the only reason this is true for today, and it is also the
  // only reason `SLOT_ADJUSTMENT_REASONS` withholds — so with the default
  // `reasons` list at a machine slot, `reason` can never settle on it and
  // this stays false there. Left as a general predicate rather than special-
  // cased on the reason list actually in effect, so it keeps working if a
  // caller passes a wider list, or a future reason is added upstream.
  const needsDirection = reasonSpec(reason).totalStock === 'unchanged' && reason !== 'transfer'

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
  const sign = reason === 'transfer'
    ? 'down'
    : needsDirection
      ? (direction === 'more' ? 'up' : 'down')
      : (reasonSpec(reason).totalStock === 'increase' ? 'up' : 'down')

  // §7: "The commit button names the reason: `Record move`, `Record
  // delivery`. Not `Record`." Derived from the table, so a new reason gets a
  // sensible verb without an edit here.
  const commitLabel =
    reason === 'transfer' ? 'Record move'
      : reason === 'delivery' ? 'Record delivery'
      : reason === 'miscount' ? 'Record correction'
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
    <div className="bg-paper">
      <div className="flex items-baseline justify-between bg-ink px-4 py-2.5 text-ground">
        <h3 className="text-[19px] font-extrabold">
          {location.kind === 'storeroom'
            ? 'Adjust storeroom stock'
            : `Adjust slot ${location.slotNumber}`}
        </h3>
      </div>

      <div className="border-b-2 border-rule-strong px-4 py-3">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          Reason
        </span>
        {/* Reason first, because reason governs which fields exist below and
            which way the number goes. A `<select>` hid that: the destination
            and direction fields rendered below a control the operator had
            already scrolled past. */}
        <div className="mt-1.5 grid grid-cols-2 gap-px bg-rule-light">
          {tiles.map((r) => (
            <button
              key={r.reason}
              type="button"
              aria-pressed={reason === r.reason}
              onClick={() => setReason(r.reason)}
              className={`px-3 py-2.5 text-left text-[12.5px] font-bold ${
                reason === r.reason ? 'bg-accent text-ground' : 'bg-paper text-ink'
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
                reason === r.reason ? 'bg-accent text-ground' : 'bg-paper text-ink'
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
          {reason === 'transfer' && (
            <span className="text-[13px] font-bold tabular-nums">
              {there} up {shownUnits}
            </span>
          )}
        </div>

        {needsDirection && (
          <label className="col-span-2 flex flex-col gap-1 bg-paper px-4 py-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
              Correction direction
            </span>
            <select
              aria-label="Correction direction"
              className="border-b-2 border-ink bg-transparent pb-1 text-[13.5px] outline-none"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'more' | 'fewer')}
            >
              <option value="more">There are more than recorded</option>
              <option value="fewer">There are fewer than recorded</option>
            </select>
          </label>
        )}

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
