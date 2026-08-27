import { useState } from 'react'
import { useStoreroom } from './useStoreroom'

function formatVerifiedAt(timestamp: number | undefined): string {
  if (timestamp === undefined) return 'Never verified'
  return `Verified ${new Date(timestamp).toLocaleString()}`
}

/** The storeroom balance is a ledger estimate, not a stocktake (spec §6.5):
 * "on hand" is the last manual count plus every storeroom movement logged
 * since. The manual-count input beside it stays the anchor-setting
 * control — the operator's word for what the shelf actually holds right
 * now, resetting the ledger from that instant.
 *
 * Plain units, not boxes + loose: every seeded item has `boxSize: 1`, so a
 * boxes field would be actively misleading until real carton sizes are
 * entered (spec §5.4 is deferred, not built here). */
export function StoreroomScreen() {
  const { items, units, verifiedAt, onHand, loading, setUnits } = useStoreroom()
  const [search, setSearch] = useState('')

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
              </div>
              <div className="text-right">
                <div
                  aria-label={`${item.name} on hand`}
                  className="text-sm font-semibold"
                >
                  {onHand.get(item.id) ?? 0}
                </div>
                <input
                  aria-label={`${item.name} units`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="w-20 rounded-lg border p-2 text-right"
                  value={units.get(item.id) ?? 0}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10)
                    const qty = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
                    // Same shape as useCounting's steppers: commit optimistically,
                    // persist behind it, swallow a rejected write here rather than
                    // let it surface as an unhandled rejection (no error surface
                    // is in scope for this screen either — see known-gaps.md).
                    void setUnits(item.id, qty).catch(() => {})
                  }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
