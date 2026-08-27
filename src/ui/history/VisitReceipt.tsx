import { useEffect, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { getCountLines } from '../../data/repositories/visits'
import { distinctLabel } from '../machines/machineLabel'
import type { CountLine, Id, Item, Machine } from '../../domain/types'

/** The numbers exactly as recorded, read back out of the database.
 *
 * This screen exists for trust rather than for work: nothing here is
 * editable, and it deliberately shows the stored figures rather than
 * anything derived from them, so the operator can confirm the app kept what
 * they typed. Corrections go through the counting screen, which is still
 * open to a finished machine (spec §7, amended 2026-08-27). */
export function VisitReceipt({
  visitId, machine, onBack,
}: {
  visitId: Id
  machine: Machine
  onBack: () => void
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

  if (loading) return <div className="p-4">Loading…</div>

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-blue-600">
          ← Back
        </button>
        <span className="text-sm">
          <span className="font-semibold">L{machine.level}</span>
          {distinctLabel(machine) && (
            <span className="ml-2 text-gray-500">{distinctLabel(machine)}</span>
          )}
        </span>
      </div>

      {lines.length === 0 ? (
        // An abandoned machine has a draft visit and no lines. A blank screen
        // here reads as data loss, so say which it is.
        <p className="text-sm text-gray-500">
          Nothing was recorded for this machine.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lines.map((line) => (
            <li
              key={line.id}
              aria-label={`slot ${line.slotNumber} record`}
              className="flex items-center gap-3 rounded-lg border p-2"
            >
              <span className="w-8 text-sm font-bold text-gray-500">
                {line.slotNumber}
              </span>
              <span className="flex-1 text-sm">
                {items.get(line.itemId)?.name ?? 'Deleted item'}
              </span>
              {line.filled && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold uppercase text-green-700">
                  Filled
                </span>
              )}
              <span className="text-sm tabular-nums">
                <span className="font-semibold">{line.before}</span>
                <span className="mx-1 text-gray-400">→</span>
                <span className="font-semibold text-emerald-700">{line.after}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
