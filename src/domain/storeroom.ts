import { entersResidual } from './adjustments'
import type { Adjustment, StoreroomBalance } from './types'

/** Spec §6.5: storeroom stock is "an estimate maintained by a ledger, not a
 * stocktake". The manual count is the anchor — the last moment the shelf was
 * actually observed — and everything logged since is applied on top.
 *
 * A movement at exactly `verifiedAt` is excluded: the count is the later
 * truth, having observed the shelf after that movement happened.
 *
 * A `miscount` is excluded regardless of timing: types.ts documents it as
 * "a data fix, NOT a stock movement", the same rule `entersResidual` already
 * enforces for the sales residual (fix round 1, finding 1) — one invariant,
 * shared, rather than two definitions that could drift apart.
 *
 * Until Phase 3 brings the trolley, the movements here are deliveries,
 * adjustments and transfers. */
export function ledgerBalance(
  anchor: StoreroomBalance | undefined,
  movements: Adjustment[],
): number {
  const since = anchor?.verifiedAt ?? -Infinity
  const net = movements
    .filter((m) => m.occurredAt > since && entersResidual(m.reason))
    .reduce((sum, m) => sum + m.units, 0)

  return Math.max(0, (anchor?.units ?? 0) + net)
}
