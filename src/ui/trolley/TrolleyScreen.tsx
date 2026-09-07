import { AllocationSection } from './AllocationSection'
import { useTrolley, type TrolleyRow } from './useTrolley'
import { QuantityField } from '../components/QuantityField'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
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
    loading, rows, quiet, needsBySlot, levelOf, setTaken, toggleNoneLeft, save,
  } = useTrolley(runId, mode)

  const header = (
    <ScreenHeader
      back={{ label: '← Machines', onClick: onDone }}
      title="Load trolley"
      figure={loading ? undefined : `${rows.filter((r) => r.taken > 0).length} / ${rows.length}`}
    />
  )

  if (loading) {
    return (
      <ScreenLayout header={header}>
        <div className="p-4">Working out what to take…</div>
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
