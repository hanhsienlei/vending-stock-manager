import { useState } from 'react'
import { AllocationSection } from './AllocationSection'
import { useTrolley, type TrolleyRow } from './useTrolley'
import { AdjustmentSheet } from '../adjustments/AdjustmentSheet'
import { QuantityField } from '../components/QuantityField'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
import { ADJUSTMENT_REASONS } from '../../domain/adjustments'
import { formatRunDate } from '../../domain/date'
import { toBoxesAndLoose } from '../../domain/packs'
import type { Id } from '../../domain/types'

/** `1fr 40px 112px 44px` — ITEM, NEED, TAKEN, NONE.
 *
 * Design §12.1 writes `1fr 56px 96px 44px`. The taken cell is widened and the
 * need cell narrowed by the same 16px, for a reason the storeroom already
 * measured: the boxes+loose control is two 34px fields either side of a
 * `×24 +` separator and needs ~108px, and at 96px it spills LEFT over the
 * column beside it (`StoreroomScreen.tsx`'s own note, written after a
 * photograph of a real phone). The need is a figure and nothing else; 40px
 * takes three digits at 19px, and no slot in the estate holds a thousand.
 *
 * At 393px: 32px of padding, three 8px gaps, 196px of fixed cells, leaving
 * 141px for the item name — the same width the storeroom's name column has. */
const GRID = 'grid grid-cols-[1fr_40px_112px_44px] items-center gap-2 px-4'

/** A footer action, flush left at `15px 16px` (tokens.md). */
const ACTION = 'px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em]'

/** `1fr 56px 112px` — ITEM, TROLLEY SAYS, YOU FOUND (spec §7 step 5).
 *
 * The same 112px the taken cell gets, for the same reason: the count is typed
 * in boxes and loose, off the same shelf, in the same control. */
const RETURN_GRID = 'grid grid-cols-[1fr_56px_112px] items-center gap-2 px-4'

/** The same reasons the storeroom offers — the residual-entering ones. A
 * `miscount` is excluded there because it would be excluded from
 * `ledgerBalance` and so would silently do nothing, and this sheet writes to
 * the same ledger from the same place. Derived from `entersResidual` rather
 * than named, so it cannot drift from the rule it respects. */
const STOREROOM_ADJUSTMENT_REASONS = ADJUSTMENT_REASONS.filter((r) => r.entersResidual)

/** `5 boxes + 17`, or `17 loose` where there is no carton. The same split the
 * quantity field below the figure uses, so the workings line and the control
 * are describing the number in one vocabulary. */
function formatPacks(units: number, boxSize: number): string {
  const { boxes, loose } = toBoxesAndLoose(units, boxSize)
  const boxWord = `${boxes} box${boxes === 1 ? '' : 'es'}`
  if (boxes === 0) return `${loose} loose`
  if (loose === 0) return boxWord
  return `${boxWord} + ${loose}`
}

/** The explainability requirement, in one line: `5 slots · 1.4/day · 3 days ·
 * 1 box + 6` (design §12.1). Every figure on the row derives from something
 * printed beside it — the need is what those slots want after that many days
 * at that rate, and the box split is what the operator will actually lift.
 *
 * `no rate yet` rather than `0.0/day`, always: null is not zero (`rate.ts`),
 * and a need built on the no-rate fallback must say so rather than imply the
 * item sells nothing. */
function workingsFor(row: TrolleyRow): string {
  if (row.slots.length === 0) {
    return `Already on the trolley · ${formatPacks(row.taken, row.item.boxSize)}`
  }
  return [
    `${row.slots.length} slot${row.slots.length === 1 ? '' : 's'}`,
    row.rate === null ? 'no rate yet' : `${row.rate.toFixed(1)}/day`,
    `${row.days} day${row.days === 1 ? '' : 's'}`,
    formatPacks(row.needed, row.item.boxSize),
  ].join(' · ')
}

/** Load the trolley, once, at G (D4).
 *
 * A nested screen under Machines, never a fifth nav tab — the nav stays at
 * four (design §12, Phase 2 §7.2). Reached from the machines footer, where
 * `Start run` sits before anything is counted.
 *
 * The screen is the whole of spec §6.2: what every machine wants, resolved to
 * items, with the workings beside each figure and one editable number per row.
 * Allocation lives inside it rather than beside it (D5) — it exists to surface
 * a trade-off at G, and a screen you have to go and find does not do that. */
export function TrolleyScreen({
  runId, mode, onDone,
}: {
  runId: Id
  mode: 'load' | 'return'
  onDone: () => void
}) {
  const {
    loading, runDate, rows, quiet, needsBySlot, levelOf, returnRows, found,
    setTaken, toggleNoneLeft, setFound, save, saveReturn,
  } = useTrolley(runId, mode)
  const [adjusting, setAdjusting] = useState<{ itemId: Id; name: string } | null>(null)

  const returning = mode === 'return'

  // `state` rather than `eyebrow`: `ScreenHeader` takes a back affordance or
  // an eyebrow and never both, and a nested screen the operator cannot leave
  // is worse than one whose context line sits on the right.
  const header = (
    <ScreenHeader
      back={{ label: '← Machines', onClick: onDone }}
      state={returning ? `RETURNING · ${formatRunDate(runDate).toUpperCase()}` : undefined}
      title={returning ? 'Leftovers' : 'Load trolley'}
      figure={loading || returning
        ? undefined
        : `${rows.filter((r) => r.taken > 0).length} / ${rows.length}`}
    />
  )

  if (loading) {
    return (
      <ScreenLayout header={header}>
        <div className="p-4">
          {returning ? 'Working out what should be left…' : 'Working out what to take…'}
        </div>
      </ScreenLayout>
    )
  }

  // The adjustment sheet, floating and anchored to the bottom — the storeroom
  // learned this the hard way (94cf425): a sheet rendered in document order
  // after a long list opens below the button that was tapped, which from
  // where the operator is standing is a button that does nothing.
  const sheet = adjusting !== null && (
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
          itemId={adjusting.itemId}
          itemName={adjusting.name}
          reasons={STOREROOM_ADJUSTMENT_REASONS}
          onSaved={() => setAdjusting(null)}
          onCancel={() => setAdjusting(null)}
        />
      </div>
    </div>
  )

  if (returning) {
    return (
      <ScreenLayout
        header={header}
        stickyExtra={
          <div
            data-testid="return-column-header"
            className={`${RETURN_GRID} bg-ink py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground`}
          >
            <span>Item</span>
            <span className="text-right leading-tight">Trolley<br />says</span>
            <span className="text-right leading-tight">You<br />found</span>
          </div>
        }
      >
        {returnRows.length === 0 && (
          <p className="bg-paper px-4 py-3 text-[12.5px] font-medium text-neutral-700">
            Nothing went up on the trolley this run, so there is nothing to
            bring back down.
          </p>
        )}

        <ul>
          {returnRows.map((row) => {
            const counted = found.get(row.line.itemId) ?? Math.max(0, row.predicted)
            const difference = counted - row.predicted

            return (
              <li
                key={row.line.id}
                data-testid={`return-row-${row.item.name}`}
                className={`border-b border-rule-light bg-paper py-2.5 ${
                  difference === 0 ? '' : 'shadow-[inset_4px_0_0_var(--color-accent)]'
                }`}
              >
                <div className={RETURN_GRID}>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold">{row.item.name}</div>
                    <div className="truncate text-[11px] font-medium text-neutral-700">
                      {`Took ${row.line.taken} · ${row.line.taken - row.predicted} into machines`}
                    </div>
                  </div>

                  <span
                    aria-label={`${row.item.name} on the trolley`}
                    className="text-right text-[19px] font-extrabold tabular-nums"
                  >
                    {row.predicted}
                  </span>

                  <QuantityField
                    item={row.item}
                    units={counted}
                    onChange={(units) => setFound(row.line.itemId, units)}
                  />
                </div>

                {/* One action, never taken automatically (design §11, D6).
                    The app writes the return; the difference is the
                    operator's to explain, through the ordinary sheet. */}
                {difference !== 0 && (
                  <p className="px-4 pt-1 text-[11px] font-semibold text-accent-700">
                    {difference < 0
                      ? `${-difference} fewer than the trolley says · `
                      : `${difference} more than the trolley says · `}
                    <button
                      type="button"
                      onClick={() => setAdjusting({ itemId: row.line.itemId, name: row.item.name })}
                      className="font-extrabold underline"
                    >
                      Log the difference
                    </button>
                  </p>
                )}
              </li>
            )
          })}
        </ul>

        <div className="flex border-t-2 border-rule-strong">
          <button
            type="button"
            onClick={() => { void saveReturn().then(onDone).catch(() => {}) }}
            className={`bg-accent ${ACTION} text-ground`}
          >
            Put the leftovers back
          </button>
          <button
            type="button"
            onClick={onDone}
            className={`bg-ground ${ACTION} text-neutral-700`}
          >
            Back
          </button>
        </div>

        {sheet}
      </ScreenLayout>
    )
  }

  return (
    <ScreenLayout
      header={header}
      stickyExtra={
        <div
          data-testid="trolley-column-header"
          className={`${GRID} bg-ink py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground`}
        >
          <span>Item</span>
          <span className="text-right">Need</span>
          <span className="text-right">Taken</span>
          <span className="text-right">None</span>
        </div>
      }
    >
      {rows.length === 0 && (
        <p className="bg-paper px-4 py-3 text-[12.5px] font-medium text-neutral-700">
          Nothing to take. Every machine is projected to be full enough, or the
          storeroom is out of what they want.
        </p>
      )}

      <ul>
        {rows.map((row) => (
          <li
            key={row.item.id}
            data-testid={`trolley-row-${row.item.name}`}
            className={`border-b border-rule-light bg-paper py-2.5 ${
              // The app's one edge mark. It already means "ran dry, in
              // progress, never verified"; an empty shelf is the same kind of
              // fact about the same kind of row.
              row.noneLeftInG ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''
            }`}
          >
            <div className={GRID}>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold">{row.item.name}</div>
                <div className="truncate text-[11px] font-medium text-neutral-700">
                  {workingsFor(row)}
                </div>
              </div>

              <span
                aria-label={`${row.item.name} need`}
                className="text-right text-[19px] font-extrabold tabular-nums"
              >
                {row.needed}
              </span>

              <QuantityField
                item={row.item}
                units={row.taken}
                onChange={(units) => setTaken(row.item.id, units)}
              />

              {/* Ink when on, not accent: a selected state is ink (interface
                  refinement §7, ruling 6). D11 puts this control on this
                  screen and nowhere else — it is the moment the operator is
                  looking at the shelf. */}
              <button
                type="button"
                aria-label={`No ${row.item.name} left in G`}
                aria-pressed={row.noneLeftInG}
                onClick={() => toggleNoneLeft(row.item.id)}
                className={`px-1 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] ${
                  row.noneLeftInG
                    ? 'bg-ink text-ground'
                    : 'border border-rule-light text-neutral-600'
                }`}
              >
                None
              </button>
            </div>
          </li>
        ))}
      </ul>

      {quiet.length > 0 && (
        <section>
          <h2 className="bg-surface px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em]">
            Nothing expected
          </h2>
          {/* Design §4.4: a slot selling nothing whose level has not moved is
              dead stock or a tray nobody has counted, and both deserve the
              operator's eye. A short list, never an alert. */}
          <ul className="bg-paper">
            {quiet.map((slot) => (
              <li
                key={`${slot.level}-${slot.slotNumber}`}
                data-testid={`quiet-slot-${slot.slotNumber}`}
                className="border-b border-rule-light px-4 py-1.5 text-[12.5px] font-medium text-neutral-700"
              >
                {`L${slot.level} · ${slot.slotNumber} · ${slot.itemName} · still at ${slot.lastLevel}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Above the footer, so the trade-off is the last thing read before
          the trolley goes up (design §12.2). */}
      <AllocationSection rows={rows} needsBySlot={needsBySlot} levelOf={levelOf} />

      <div className="flex border-t-2 border-rule-strong">
        <button
          type="button"
          onClick={() => { void save().then(onDone).catch(() => {}) }}
          className={`bg-accent ${ACTION} text-ground`}
        >
          Take the trolley up
        </button>
        <button
          type="button"
          onClick={onDone}
          className={`bg-ground ${ACTION} text-neutral-700`}
        >
          Back
        </button>
      </div>
    </ScreenLayout>
  )
}
