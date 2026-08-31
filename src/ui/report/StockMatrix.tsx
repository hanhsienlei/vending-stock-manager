import { useState } from 'react'
import type { MatrixRow } from '../../domain/stockMatrix'
import type { Id, Machine } from '../../domain/types'

/** The paper stock sheet, on screen. The PDF export is held (design §2), so a
 * screenshot has to do its job — which makes legibility a requirement rather
 * than polish, because 60 items by 17 columns is not readable on a phone.
 *
 * Three things make it work: machine columns that toggle off, horizontal
 * scrolling for a larger screen, and landscape. `Order` stays blank for
 * hand-writing until Phase 3 fills it, exactly as the paper does today. */
export function StockMatrix({
  rows, machines,
}: {
  rows: MatrixRow[]
  machines: Machine[]
}) {
  const [hidden, setHidden] = useState<Set<Id>>(new Set())

  const shown = machines.filter((m) => !hidden.has(m.id))

  function toggle(machineId: Id) {
    setHidden((current) => {
      const next = new Set(current)
      if (!next.delete(machineId)) next.add(machineId)
      return next
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-px bg-rule-light">
        {machines.map((m) => {
          const isHidden = hidden.has(m.id)
          return (
            <button
              key={m.id}
              type="button"
              aria-label={`${isHidden ? 'Show' : 'Hide'} L${m.level}`}
              aria-pressed={!isHidden}
              onClick={() => toggle(m.id)}
              // Ink, not accent: fifteen accent chips would spend the whole
              // screen's colour budget on a control (§11).
              className={`px-2.5 py-1.5 text-[11px] font-bold tabular-nums ${
                isHidden
                  ? 'bg-surface text-neutral-600 line-through'
                  : 'bg-ink text-ground'
              }`}
            >
              L{m.level}
            </button>
          )
        })}
      </div>

      {/* The only horizontally scrolling surface in the app. Every other
          screen is a phone-width column and should stay one. */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="bg-ink text-left text-ground">
              <th scope="col" className="px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.10em]">Slot</th>
              <th scope="col" className="px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.10em]">Item</th>
              <th scope="col" className="px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.10em]">Qty</th>
              {shown.map((m) => (
                <th key={m.id} scope="col" className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.10em]">
                  L{m.level}
                </th>
              ))}
              <th scope="col" className="border-l-2 border-rule-strong px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.10em]">GF</th>
              <th scope="col" className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.10em]">Total</th>
              <th scope="col" className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.10em] text-accent">Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.key}
                aria-label={`stock row ${row.key}`}
                // At 60 rows by 12 columns, banding is what keeps a
                // screenshot readable (§11).
                className={`border-b border-rule-light ${i % 2 === 0 ? 'bg-paper' : 'bg-neutral-100'}`}
              >
                <td className="whitespace-nowrap px-2 py-1.5 text-[15px] font-extrabold tabular-nums">
                  {row.key}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-[13px] font-semibold">
                  {row.itemName}
                </td>
                <td className="px-2 py-1.5 text-[11px] font-medium text-neutral-700">
                  {row.size ?? ''}
                </td>
                {shown.map((m) => {
                  const value = row.perMachine.get(m.id) ?? 0
                  return (
                    <td
                      key={m.id}
                      className={`px-2 py-1.5 text-right text-[15px] font-extrabold tabular-nums ${
                        value === 0 ? 'text-accent-700' : 'text-ink'
                      }`}
                    >
                      {value}
                    </td>
                  )
                })}
                <td className="border-l-2 border-rule-strong px-2 py-1.5 text-right text-[15px] font-extrabold tabular-nums">
                  {row.storeroom}
                </td>
                <td className="px-2 py-1.5 text-right text-[15px] font-extrabold tabular-nums">
                  {row.total}
                </td>
                {/* Blank by design — Phase 3 fills it; until then it is
                    hand-written, exactly as on the paper sheet. The tint
                    says whose column it is. */}
                <td
                  aria-label={`order for ${row.key}`}
                  className="bg-accent-100 px-2 py-1.5"
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="bg-surface px-4 py-3 text-[11px] font-medium text-neutral-700">
        Order stays blank for your pen until Phase 3 fills it — the red header
        marks it as the column that is yours, not the app&rsquo;s. A red figure
        is a machine at zero.
      </p>
    </div>
  )
}
