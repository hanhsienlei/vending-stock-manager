import type { Adjustment, StoreroomBalance } from './types'

/** Spec §6.5: storeroom stock is "an estimate maintained by a ledger, not a
 * stocktake". The manual count is the anchor — the last moment the shelf was
 * actually observed — and everything logged since is applied on top.
 *
 * A movement at exactly `verifiedAt` is excluded: the count is the later
 * truth, having observed the shelf after that movement happened.
 *
 * Until Phase 3 brings the trolley, the movements here are deliveries,
 * adjustments and transfers. */
export function ledgerBalance(
  anchor: StoreroomBalance | undefined,
  movements: Adjustment[],
): number {
  const since = anchor?.verifiedAt ?? -Infinity
  const net = movements
    .filter((m) => m.occurredAt > since)
    .reduce((sum, m) => sum + m.units, 0)

  return Math.max(0, (anchor?.units ?? 0) + net)
}
