import { useEffect, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { getCountLines } from '../../data/repositories/visits'
import type { CountLine, Id, Item, Machine } from '../../domain/types'

const GRID = 'grid grid-cols-[30px_1fr_60px_60px] items-center gap-2 px-3.5'

/** The numbers exactly as recorded, read back out of the database.
 *
 * This screen exists for trust rather than for work: nothing here is
 * editable, and it deliberately shows the stored figures rather than
 * anything derived from them, so the operator can confirm the app kept what
 * they typed. Corrections go through the counting screen, which is still
 * open to a finished machine (spec §7, amended 2026-08-27).
 *
 * The four columns mirror the count screen's own — `30px 1fr 60px 60px`,
 * `COUNTED` / `REFILLED TO` — so the receipt reads as the same table the
 * operator typed into, not a different presentation of it. The back
 * affordance and the machine identity now live in the `ScreenHeader` that
 * `HistoryScreen` builds for this level; `machine` stays a prop only for the
 * empty-state copy below, so a blank receipt still names which machine it's
 * blank for. */
export function VisitReceipt({
  visitId, machine,
}: {
  visitId: Id
  machine: Machine
}) {
  const [lines, setLines] = useState<CountLine[]>([])
  const [items, setItems] = useState<Map<Id, Item>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const [recorded, allItems] = await Promise.all([getCountLines(visitId), listItems()])
      setItems(new Map(allItems.map((i) => [i.id, i])))
      // Slot order, not write order: a receipt is read against the physical
      // machine, and the operator counts trays top to bottom.
      setLines(
        [...recorded].sort(
          (a, b) => a.slotNumber - b.slotNumber || a.itemId.localeCompare(b.itemId),
        ),
      )
      setLoading(false)
    })()
  }, [visitId])

  if (loading) return <div className="px-4 py-3 text-[13px]">Loading…</div>

  return (
    <div>
      <div
        data-testid="receipt-column-header"
        className={`${GRID} bg-ink py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground`}
      >
        <span>SL</span>
        <span>Item</span>
        <span className="text-center">Counted</span>
        <span className="text-center leading-tight">Refilled<br />to</span>
      </div>

      {lines.length === 0 ? (
        // An abandoned machine has a draft visit and no lines. A blank screen
        // here reads as data loss, so say which it is.
        <p className="px-4 py-3 text-[13px] text-neutral-500">
          Nothing was recorded for L{machine.level}.
        </p>
      ) : (
        <ul>
          {lines.map((line) => (
            <li
              key={line.id}
              aria-label={`slot ${line.slotNumber} record`}
              className={`border-b border-rule-light bg-paper ${
                line.after === 0 ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''
              }`}
            >
              <div className={`${GRID} h-[46px]`}>
                <span className="text-[15px] font-extrabold tabular-nums">
                  {line.slotNumber}
                </span>
                <span className="truncate text-[13px] font-semibold">
                  {items.get(line.itemId)?.name ?? 'Deleted item'}
                </span>
                <span className="border-x border-rule-light text-center text-[19px] font-extrabold tabular-nums">
                  {line.before}
                </span>
                <span className="border-x border-rule-light bg-surface text-center text-[19px] font-extrabold tabular-nums">
                  {line.after}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="bg-surface px-4 py-3 text-[11px] font-medium text-neutral-700">
        <strong>Counted</strong> is what was in the slot on arrival;{' '}
        <strong>refilled to</strong> is what was left behind. A red edge marks a
        slot that had reached zero.
      </p>
    </div>
  )
}
