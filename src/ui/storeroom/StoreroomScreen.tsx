import { useState } from 'react'
import { useStoreroom } from './useStoreroom'
import { AdjustmentSheet } from '../adjustments/AdjustmentSheet'
import { ADJUSTMENT_REASONS } from '../../domain/adjustments'
import { fromBoxesAndLoose, toBoxesAndLoose } from '../../domain/packs'
import type { Id, Item } from '../../domain/types'

/** A typed number field, floored at zero. An empty field reads as 0 rather
 * than NaN, so clearing it before typing never writes a nonsense balance. */
function parseQuantity(raw: string): number {
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function formatVerifiedAt(timestamp: number | undefined): string {
  if (timestamp === undefined) return 'Never verified'
  return `Verified ${new Date(timestamp).toLocaleString()}`
}

// Design §7.1: the adjustment sheet is reached from the storeroom screen too,
// but never with `miscount` on offer here. The storeroom's own correction
// mechanism is the manual count below, which resets the ledger anchor
// directly; a miscount recorded through the sheet would be excluded from
// `ledgerBalance` (domain/storeroom.ts, fix round 1, finding 1) and so would
// silently do nothing — worse than not offering it. Derived from
// `entersResidual` rather than a hard-coded reason name, so this can never
// drift from the rule it exists to respect.
const STOREROOM_ADJUSTMENT_REASONS = ADJUSTMENT_REASONS.filter((r) => r.entersResidual)

/** The storeroom balance is a ledger estimate, not a stocktake (spec §6.5):
 * "on hand" is the last manual count plus every storeroom movement logged
 * since. The manual-count input beside it stays the anchor-setting
 * control — the operator's word for what the shelf actually holds right
 * now, resetting the ledger from that instant.
 *
 * The quantity is entered as boxes + loose with the units computed (spec
 * §5.4, design §8) — "5 boxes + 17 rather than counting to 137". It is this
 * field rather than a feature beside it, which is why it is built in rather
 * than retrofitted. At `boxSize: 1` — every seeded item today — the split is
 * the identity one, so the control shows a single plain units field and
 * starts working the day real carton sizes are entered. Machine screens stay
 * in loose units throughout: a vending slot contains no boxes. */
export function StoreroomScreen() {
  const { items, units, verifiedAt, onHand, loading, setUnits, refresh } = useStoreroom()
  const [search, setSearch] = useState('')
  const [adjusting, setAdjusting] = useState<Id | null>(null)

  if (loading) return <div className="p-4">Loading…</div>

  // Counted against every item, never the filtered subset (item 10,
  // fix-plan 2026-08-27) — otherwise typing a search would make the header
  // report fewer items counted than actually are.
  const countedCount = verifiedAt.size

  // No tray grouping here, unlike the item list this mirrors (commit
  // f9e90a7): trays describe a machine's physical layout, and the storeroom
  // is shelves — its rows have no tray structure to group by. Search alone.
  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Storeroom</h2>
        <span className="text-sm text-gray-500">
          {countedCount} / {items.length} counted
        </span>
      </div>

      {/* One-handed on a phone: a single full-width field, no extra taps to
          reach it — same as the item list's search box. */}
      <input
        type="search"
        aria-label="Search storeroom"
        placeholder="Search storeroom"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-lg border p-3"
      />

      <ul className="flex flex-col gap-2">
        {filtered.map((item) => (
          <li key={item.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{item.name}</div>
                <div className="text-xs text-gray-500">
                  {item.size && <>{item.size} · </>}
                  {formatVerifiedAt(verifiedAt.get(item.id))}
                </div>
                <button
                  type="button"
                  onClick={() => setAdjusting(item.id)}
                  className="text-xs font-bold text-blue-600"
                >
                  {`Adjust ${item.name}`}
                </button>
              </div>
              <div className="text-right">
                <div
                  aria-label={`${item.name} on hand`}
                  className="text-sm font-semibold"
                >
                  {onHand.get(item.id) ?? 0}
                </div>
                <QuantityField
                  item={item}
                  units={units.get(item.id) ?? 0}
                  // Same shape as useCounting's steppers: commit
                  // optimistically, persist behind it, swallow a rejected
                  // write here rather than let it surface as an unhandled
                  // rejection (no error surface is in scope for this screen
                  // either — see known-gaps.md).
                  onChange={(qty) => { void setUnits(item.id, qty).catch(() => {}) }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* A floating sheet, not an inline one — the same fix the machine map
          needed (94cf425). This list is the whole sixty-item catalogue, so a
          sheet rendered in document order after it opens thousands of pixels
          below the "Adjust" button that was tapped: from where the operator
          is standing, a button that does nothing. Anchored to the bottom,
          capped at 80vh, scrollable, and dismissed by tapping the backdrop. */}
      {adjusting !== null && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-2"
          onClick={() => setAdjusting(null)}
          aria-label="Close adjustment sheet"
          role="presentation"
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <AdjustmentSheet
              location={{ kind: 'storeroom' }}
              itemId={adjusting}
              reasons={STOREROOM_ADJUSTMENT_REASONS}
              onSaved={() => {
                setAdjusting(null)
                void refresh()
              }}
              onCancel={() => setAdjusting(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** The ledger's quantity input. One plain field at `boxSize: 1`, boxes +
 * loose above it — the same control either way, because the split degrades to
 * "everything loose" on its own (`domain/packs.ts`). Both fields write one
 * number: what is stored is always units, never a box count, so nothing
 * downstream has to know a carton size to read the balance. */
function QuantityField({
  item, units, onChange,
}: {
  item: Item
  units: number
  onChange: (units: number) => void
}) {
  const { boxes, loose } = toBoxesAndLoose(units, item.boxSize)

  if (item.boxSize <= 1) {
    return (
      <input
        aria-label={`${item.name} units`}
        type="number"
        inputMode="numeric"
        min={0}
        className="w-20 rounded-lg border p-2 text-right"
        value={units}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(parseQuantity(e.target.value))}
      />
    )
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        aria-label={`${item.name} boxes`}
        type="number"
        inputMode="numeric"
        min={0}
        className="w-14 rounded-lg border p-2 text-right"
        value={boxes}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) =>
          onChange(fromBoxesAndLoose(parseQuantity(e.target.value), loose, item.boxSize))}
      />
      <span className="whitespace-nowrap text-xs text-gray-500">
        \u00d7{item.boxSize} +
      </span>
      <input
        aria-label={`${item.name} loose`}
        type="number"
        inputMode="numeric"
        min={0}
        className="w-14 rounded-lg border p-2 text-right"
        value={loose}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) =>
          onChange(fromBoxesAndLoose(boxes, parseQuantity(e.target.value), item.boxSize))}
      />
    </div>
  )
}
