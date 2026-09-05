import { entersResidual } from './adjustments'
import type { Adjustment, StoreroomBalance, TrolleyLine } from './types'

/** A signed change to the storeroom's units on hand, and when it happened.
 * Normalised: whatever produced it, the balance sees only these two fields. */
export interface Movement {
  units: number
  at: number
}

/** Every source of storeroom movement, normalised into one list.
 *
 * Phase 3 design §3.5. The trolley is a table of its own rather than a pair of
 * adjustment reasons, so the balance now has two producers — and the lesson of
 * Phase 2's 99e7a91 was not "one table" but **one owner of an invariant**.
 * So the normalising happens here, once, and `ledgerBalance` keeps a single
 * implementation of the arithmetic. Any future movement source is added here,
 * never to the balance.
 *
 * The `entersResidual` filter lives on this side because it is a property of
 * the adjustment's reason, which a `Movement` no longer carries: a `miscount`
 * is "a data fix, NOT a stock movement" (types.ts) and never becomes one.
 *
 * A trolley line contributes `−taken` at `loadedAt` and, once the run closes,
 * `+returned` at `returnedAt`. An unreturned line contributes only the load:
 * the units are on the trolley, which is neither the shelf nor a machine.
 *
 * Pure: plain data in, plain data out. */
export function storeroomMovements(
  adjustments: Adjustment[],
  trolleyLines: TrolleyLine[],
): Movement[] {
  const movements: Movement[] = adjustments
    .filter((a) => entersResidual(a.reason))
    .map((a) => ({ units: a.units, at: a.occurredAt }))

  for (const line of trolleyLines) {
    movements.push({ units: -line.taken, at: line.loadedAt })
    // `undefined` is "not returned yet"; zero is a real observation — the
    // trolley came back empty — so the test is on the field, not on its value.
    if (line.returned !== undefined) {
      movements.push({ units: line.returned, at: line.returnedAt ?? line.updatedAt })
    }
  }

  return movements
}

/** Spec §6.5: storeroom stock is "an estimate maintained by a ledger, not a
 * stocktake". The manual count is the anchor — the last moment the shelf was
 * actually observed — and everything logged since is applied on top.
 *
 * A movement at exactly `verifiedAt` is excluded: the count is the later
 * truth, having observed the shelf after that movement happened. That
 * boundary is load-bearing for `None left in G` (design §3.6, §11), which
 * writes an anchor of zero stamped at the same instant as the load's own
 * `−taken` — so the load is correctly not applied a second time, and the
 * balance reads 0 rather than −taken clamped to 0.
 *
 * The arithmetic is deliberately unchanged since Phase 2; only the input is
 * normalised, by `storeroomMovements` above. */
export function ledgerBalance(
  anchor: StoreroomBalance | undefined,
  movements: Movement[],
): number {
  const since = anchor?.verifiedAt ?? -Infinity
  const net = movements
    .filter((m) => m.at > since)
    .reduce((sum, m) => sum + m.units, 0)

  return Math.max(0, (anchor?.units ?? 0) + net)
}
