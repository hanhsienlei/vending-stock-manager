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
      <div className="mb-2 flex flex-wrap gap-1">
        {machines.map((m) => {
          const isHidden = hidden.has(m.id)
          return (
            <button
              key={m.id}
              type="button"
              aria-label={`${isHidden ? 'Show' : 'Hide'} L${m.level}`}
              aria-pressed={!isHidden}
              onClick={() => toggle(m.id)}
              className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                isHidden ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white'
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
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="px-2 py-1">Slot</th>
              <th scope="col" className="px-2 py-1">Item</th>
              <th scope="col" className="px-2 py-1">Qty</th>
              {shown.map((m) => (
                <th key={m.id} scope="col" className="px-2 py-1 text-right">
                  L{m.level}
                </th>
              ))}
              <th scope="col" className="px-2 py-1 text-right">GF</th>
              <th scope="col" className="px-2 py-1 text-right">Total</th>
              <th scope="col" className="px-2 py-1 text-right">Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                aria-label={`stock row ${row.key}`}
                className="border-b"
              >
                <td className="px-2 py-1 font-bold text-gray-500">{row.key}</td>
                <td className="whitespace-nowrap px-2 py-1">{row.itemName}</td>
                <td className="px-2 py-1 text-gray-500">{row.size ?? ''}</td>
                {shown.map((m) => (
                  <td key={m.id} className="px-2 py-1 text-right tabular-nums">
                    {row.perMachine.get(m.id) ?? 0}
                  </td>
                ))}
                <td className="px-2 py-1 text-right tabular-nums">{row.storeroom}</td>
                <td className="px-2 py-1 text-right font-semibold tabular-nums">
                  {row.total}
                </td>
                {/* Blank by design — Phase 3 fills it; until then it is
                    hand-written, exactly as on the paper sheet. */}
                <td aria-label={`order for ${row.key}`} className="px-2 py-1" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
