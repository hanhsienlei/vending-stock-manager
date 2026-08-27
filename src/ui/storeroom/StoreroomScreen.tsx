import { useStoreroom } from './useStoreroom'

function formatVerifiedAt(timestamp: number | undefined): string {
  if (timestamp === undefined) return 'Never verified'
  return `Verified ${new Date(timestamp).toLocaleString()}`
}

/** Manual storeroom count only (spec §6.5) — no trolley, no deliveries, no
 * pick list. Plain units, not boxes + loose: every seeded item has
 * `boxSize: 1`, so a boxes field would be actively misleading until real
 * carton sizes are entered (spec §5.4 is deferred, not built here). */
export function StoreroomScreen() {
  const { items, units, verifiedAt, loading, setUnits } = useStoreroom()

  if (loading) return <div className="p-4">Loading…</div>

  const countedCount = verifiedAt.size

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Storeroom</h2>
        <span className="text-sm text-gray-500">
          {countedCount} / {items.length} counted
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{item.name}</div>
                <div className="text-xs text-gray-500">
                  {item.size && <>{item.size} · </>}
                  {formatVerifiedAt(verifiedAt.get(item.id))}
                </div>
              </div>
              <input
                aria-label={`${item.name} units`}
                type="number"
                inputMode="numeric"
                min={0}
                className="w-20 rounded-lg border p-2 text-right"
                value={units.get(item.id) ?? 0}
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
          </li>
        ))}
      </ul>
    </div>
  )
}
