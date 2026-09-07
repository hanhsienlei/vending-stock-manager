import type { AdjustmentReason } from './types'

export interface ReasonSpec {
  reason: AdjustmentReason
  label: string
  /** What this does to stock across the whole estate. */
  totalStock: 'increase' | 'decrease' | 'unchanged'
  /** Whether it is a stock movement the sales residual must account for. */
  entersResidual: boolean
  /** Whether an operator may still choose it. A row with `offered: false` is
   * history only: it is read back so old rows keep their meaning, and it is
   * never put on screen. Separate from `entersResidual`, which is about what
   * the arithmetic does with a row, not about who may write one. */
  offered: boolean
}

/** Spec §5.3's table as data rather than as branching scattered across call
 * sites — adding a reason is a row. Order is display order in the sheet. */
export const ADJUSTMENT_REASONS: ReasonSpec[] = [
  {
    reason: 'transfer',
    label: 'Move to another machine or the storeroom',
    totalStock: 'unchanged',
    entersResidual: true,
    offered: true,
  },
  {
    reason: 'expired',
    label: 'Expired',
    totalStock: 'decrease',
    entersResidual: true,
    offered: true,
  },
  {
    reason: 'damaged',
    label: 'Damaged or broken',
    totalStock: 'decrease',
    entersResidual: true,
    offered: true,
  },
  {
    reason: 'missing',
    label: 'Missing or taken',
    totalStock: 'decrease',
    entersResidual: true,
    offered: true,
  },
  {
    reason: 'delivery',
    label: 'Delivery arrived',
    totalStock: 'increase',
    entersResidual: true,
    offered: true,
  },
  {
    reason: 'miscount',
    label: 'Miscount correction',
    totalStock: 'unchanged',
    // Spec §5.3 and §3.3: a data fix, not a stock movement. It corrects the
    // record without entering the sales calculation at all.
    entersResidual: false,
    // Retired as an operator-facing reason (Phase 3 design §4.1, D8). It
    // could change nothing that anything reads: the residual reads
    // `CountLine`, and an `Adjustment` cannot alter one — so the row was
    // written and then ignored by every consumer, which is worse than absent
    // because it looks like it worked. The correct fix already exists and is
    // better: spec §7 as amended makes a finalized visit editable, so a wrong
    // count is fixed by typing the right number, and the storeroom's manual
    // count re-anchors the ledger.
    //
    // The ROW stays rather than being deleted, so `reasonSpec('miscount')`
    // keeps working for rows already on disk — which must keep being excluded
    // from the residual. Deleting it would silently change what those rows
    // mean.
    offered: false,
  },
]

/** What the sheet may put on screen. Every consumer that shows reasons to an
 * operator filters through this, never through `entersResidual` — the two
 * happen to select the same rows today, and the day they stop is the day a
 * retired reason would silently reappear. */
export const OFFERED_REASONS: ReasonSpec[] = ADJUSTMENT_REASONS.filter((r) => r.offered)

const BY_REASON = new Map(ADJUSTMENT_REASONS.map((r) => [r.reason, r]))

export function reasonSpec(reason: AdjustmentReason): ReasonSpec {
  const spec = BY_REASON.get(reason)
  if (!spec) throw new Error(`Unknown adjustment reason: ${reason}`)
  return spec
}

export function entersResidual(reason: AdjustmentReason): boolean {
  return reasonSpec(reason).entersResidual
}
