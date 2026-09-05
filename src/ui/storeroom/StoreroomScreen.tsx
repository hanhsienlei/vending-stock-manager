import { useState } from 'react'
import { useStoreroom } from './useStoreroom'
import { AdjustmentSheet } from '../adjustments/AdjustmentSheet'
import { ADJUSTMENT_REASONS } from '../../domain/adjustments'
import { fromBoxesAndLoose, toBoxesAndLoose } from '../../domain/packs'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
import { downloadBundle } from '../../backup/export'
import { today } from '../../domain/date'
import type { Id, Item } from '../../domain/types'

/** A typed number field, floored at zero. An empty field reads as 0 rather
 * than NaN, so clearing it before typing never writes a nonsense balance. */
function parseQuantity(raw: string): number {
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

/** How long ago the shelf figure was confirmed, short enough to sit beside a
 * size in a 1fr cell (§8). `Never verified` is the string the row's accent
 * treatment keys off, so it is unchanged. Display copy for this screen only —
 * it does not belong in `src/domain/`. */
function formatVerifiedAt(timestamp: number | undefined): string {
  if (timestamp === undefined) return 'Never verified'
  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (days <= 0) return 'Verified today'
  if (days === 1) return 'Verified yesterday'
  if (days < 7) return `Verified ${days} days ago`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? 'Verified 1 week ago' : `Verified ${weeks} weeks ago`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** A stored date (`yyyy-mm-dd`) as `4 Sep` — the export button's date, short
 * enough to sit inside a label. Split by hand rather than parsed, for the
 * reason `domain/date.ts` spells out: `new Date('2026-09-04')` is UTC
 * midnight, which reads as the 3rd in every zone behind UTC. Display copy for
 * this screen only, like `formatVerifiedAt` above. */
function formatShortDate(date: string): string {
  const [, month, day] = date.split('-').map(Number)
  return `${day} ${MONTHS[month - 1]}`
}

/** `1fr 44px 112px`. The count column holds the boxes+loose control — two
 * 34px fields, a 4px gap either side of a `×200 +` separator — which needs
 * ~108px. At 88px the flex was `justify-end` and spilled the excess LEFT, so
 * the boxes input rendered under the `APP ESTIMATE` heading and overlapped
 * the estimate figure by 12px (measured in a browser at 393px: heading
 * 219-281, boxes input 269-303).
 *
 * The column was sized when every item was seeded `boxSize: 1` and the
 * control was one plain field. Entering the real carton sizes flipped 46 of
 * 60 items into the two-field form — the case the layout had never been
 * checked against. The estimate column gives up the width because it only
 * ever holds a figure; 44px still takes four digits at 18px. */
const GRID = 'grid grid-cols-[1fr_44px_112px] items-center gap-2 px-4'

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

  if (loading) {
    return (
      <ScreenLayout header={<ScreenHeader title="Storeroom" />}>
        <div className="p-4">Loading…</div>
      </ScreenLayout>
    )
  }

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
    <ScreenLayout
      header={
        <ScreenHeader
          eyebrow={`LEDGER · ${countedCount} OF ${items.length} VERIFIED`}
          title="Storeroom"
        />
      }
    >
      <div className="border-b border-rule-light px-4 py-2">
        <input
          type="search"
          aria-label="Search storeroom"
          placeholder="Search storeroom"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border-b-2 border-ink bg-transparent pb-1 text-[13.5px] outline-none"
        />
      </div>

      <div
        data-testid="storeroom-column-header"
        className={`${GRID} bg-ink py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground`}
      >
        <span>Item</span>
        <span className="text-right leading-tight">App<br />estimate</span>
        <span className="text-right leading-tight">Your<br />count</span>
      </div>

      <ul>
        {filtered.map((item) => {
          const verified = verifiedAt.get(item.id)
          const neverVerified = verified === undefined
          const estimate = onHand.get(item.id) ?? 0
          return (
            <li
              key={item.id}
              data-testid={`storeroom-row-${item.name}`}
              className={`border-b border-rule-light bg-paper py-2.5 ${
                neverVerified ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''
              }`}
            >
              <div className={GRID}>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{item.name}</div>
                  <div
                    className={`text-[11px] font-medium ${
                      neverVerified ? 'text-accent-700' : 'text-neutral-700'
                    }`}
                  >
                    {item.size && <>{item.size} · </>}
                    <span>{formatVerifiedAt(verified)}</span>
                    {' · '}
                    <button
                      type="button"
                      aria-label={`Adjust ${item.name}`}
                      onClick={() => setAdjusting(item.id)}
                      className="font-bold text-accent-700"
                    >
                      Adjust
                    </button>
                  </div>
                </div>

                <span
                  aria-label={`${item.name} on hand`}
                  className={`text-right text-[18px] font-extrabold tabular-nums ${
                    estimate === 0 && neverVerified ? 'text-neutral-500' : 'text-ink'
                  }`}
                >
                  {estimate}
                </span>

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
            </li>
          )
        })}
      </ul>

      <p className="bg-surface px-4 py-3 text-[11px] font-medium text-neutral-700">
        <strong>App estimate</strong> is your last count plus every delivery and
        adjustment since. Typing <strong>your count</strong> overrides it and the
        running total starts again from there.
      </p>

      {/* The backup export (design §14). It sits here because this is the
          screen the operator is already on when they are at G with a phone
          and no trolley, and because there is no settings screen to hide it
          behind. Neutral rather than accent: this screen's one accent is
          already spent on the never-verified inset, and a safety action that
          shouts competes with the work.
          `void` and a swallowed rejection, like the writes above — the
          failure mode is a download that does not start, which the operator
          sees directly, and there is still no error surface on this screen
          (known-gaps.md). */}
      <div className="border-t border-rule-light">
        <button
          type="button"
          onClick={() => { void downloadBundle().catch(() => {}) }}
          className="w-full bg-ground px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-neutral-700"
        >
          Export a backup · {formatShortDate(today())}
        </button>
        <p className="px-4 pb-3 text-[11px] font-medium text-neutral-700">
          Saves every table as one JSON file. Do it before you install a new
          version: an older build cannot reopen a database a newer one has
          upgraded.
        </p>
      </div>

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
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <AdjustmentSheet
              location={{ kind: 'storeroom' }}
              itemId={adjusting}
              itemName={items.find((i) => i.id === adjusting)?.name ?? ''}
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
    </ScreenLayout>
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
        className="w-full border-2 border-ink bg-paper px-1.5 py-1 text-right text-[18px] font-extrabold tabular-nums outline-none"
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
        className="w-[34px] border-2 border-ink bg-paper px-1 py-1 text-right text-[17px] font-extrabold tabular-nums outline-none"
        value={boxes}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) =>
          onChange(fromBoxesAndLoose(parseQuantity(e.target.value), loose, item.boxSize))}
      />
      <span className="whitespace-nowrap text-[10px] font-medium text-neutral-700">
        ×{item.boxSize} +
      </span>
      <input
        aria-label={`${item.name} loose`}
        type="number"
        inputMode="numeric"
        min={0}
        className="w-[34px] border-2 border-ink bg-paper px-1 py-1 text-right text-[17px] font-extrabold tabular-nums outline-none"
        value={loose}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) =>
          onChange(fromBoxesAndLoose(boxes, parseQuantity(e.target.value), item.boxSize))}
      />
    </div>
  )
}
