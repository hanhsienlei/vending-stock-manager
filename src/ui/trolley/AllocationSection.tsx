import { useMemo, useState } from 'react'
import type { TrolleyRow } from './useTrolley'
import { allocate } from '../../domain/allocation'
import type { SlotNeed } from '../../domain/forecast'
import type { Id } from '../../domain/types'

/** `30px 26px 1fr 44px` — LV, SL, ITEM, UNITS (design §12.2).
 *
 * At 393px: 32px of padding, three 8px gaps and 100px of fixed cells leave
 * 237px for the item name, which is more than the list above it gets. */
const GRID = 'grid grid-cols-[30px_26px_1fr_44px] items-center gap-2 px-4'

/** Who goes short, and where the line falls (design §12.2, spec §6.2).
 *
 * Part of the load screen, not a screen of its own (D5): it exists to surface
 * a trade-off at the moment the trolley is being loaded, and a screen you have
 * to go and find does not do that. Hidden entirely while every item's `taken`
 * covers its need — a trade-off that does not exist is not worth a band across
 * the screen.
 *
 * **It writes nothing** (design §3.9). The ranking is advisory, every figure
 * above it is still the operator's to override, and this recomputes from the
 * taken figures in memory on every keystroke. */
export function AllocationSection({
  rows, needsBySlot, levelOf,
}: {
  rows: TrolleyRow[]
  needsBySlot: Map<string, SlotNeed>
  levelOf: Map<Id, number>
}) {
  const [open, setOpen] = useState(false)

  const { allocation, nameOf } = useMemo(() => ({
    allocation: allocate(
      rows.flatMap((row) => row.slots),
      needsBySlot,
      new Map(rows.map((row) => [row.item.id, row.taken])),
      levelOf,
    ),
    nameOf: new Map(rows.map((row) => [row.item.id, row.item.name])),
  }), [rows, needsBySlot, levelOf])

  const itemsShort = rows.filter((row) => row.taken < row.needed).length
  const slotsShort = allocation.lines.filter((line) => line.allocated < line.need).length

  if (itemsShort === 0 || slotsShort === 0) return null

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full bg-accent-200 px-4 py-2.5 text-left text-[12.5px] font-medium text-accent-800"
      >
        {`${itemsShort} item${itemsShort === 1 ? '' : 's'} short — `}
        {slotsShort === 1 ? '1 slot goes without. ' : `${slotsShort} slots go without. `}
        <strong className="font-extrabold underline">
          {open ? 'Hide.' : 'See who.'}
        </strong>
      </button>

      {open && (
        <section aria-label="Allocation" className="border-t-2 border-rule-strong">
          <div
            className={`${GRID} bg-ink py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground`}
          >
            <span>Lv</span>
            <span>Sl</span>
            <span>Item</span>
            <span className="text-right">Units</span>
          </div>

          <ul>
            {allocation.lines.map((line) => {
              // `cutAfter` is the index of the last line served in full
              // before the FIRST that is not, so everything past it is below
              // the line — including a later line of a different item that
              // happens to be covered. That is what makes the bar a divider
              // rather than a label.
              const belowCut =
                allocation.cutAfter !== null && line.rank > allocation.cutAfter
              const level = levelOf.get(line.machineId) ?? 0

              return (
                <li key={`${line.machineId}-${line.slotNumber}`}>
                  {allocation.cutAfter !== null && line.rank === allocation.cutAfter + 1 && (
                    <div
                      data-testid="allocation-cut-line"
                      className="bg-surface px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em]"
                    >
                      Cut line · nothing below is covered
                    </div>
                  )}
                  <div
                    data-testid={`allocation-slot-${level}-${line.slotNumber}`}
                    // `neutral-100`, never 45% opacity: that is the disabled
                    // state for a control, and these rows are information the
                    // operator has to read (design §12.2).
                    className={`${GRID} border-b border-rule-light py-2 ${
                      belowCut ? 'bg-neutral-100' : 'bg-paper'
                    }`}
                  >
                    <span className="text-[13px] font-extrabold tabular-nums">
                      {`L${level}`}
                    </span>
                    <span className="text-[13px] font-medium tabular-nums text-neutral-700">
                      {line.slotNumber}
                    </span>
                    <span className="truncate text-[13px] font-semibold">
                      {nameOf.get(line.itemId) ?? ''}
                    </span>
                    <span className="text-right text-[15px] font-extrabold tabular-nums">
                      {line.allocated}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
