import type { AdjustmentReason } from './types'

export interface ReasonSpec {
  reason: AdjustmentReason
  label: string
  /** What this does to stock across the whole estate. */
  totalStock: 'increase' | 'decrease' | 'unchanged'
  /** Whether it is a stock movement the sales residual must account for. */
  entersResidual: boolean
}

/** Spec §5.3's table as data rather than as branching scattered across call
 * sites — adding a reason is a row. Order is display order in the sheet. */
export const ADJUSTMENT_REASONS: ReasonSpec[] = [
  {
    reason: 'transfer',
    label: 'Move to another machine or the storeroom',
    totalStock: 'unchanged',
    entersResidual: true,
  },
  { reason: 'expired', label: 'Expired', totalStock: 'decrease', entersResidual: true },
  { reason: 'damaged', label: 'Damaged or broken', totalStock: 'decrease', entersResidual: true },
  { reason: 'missing', label: 'Missing or taken', totalStock: 'decrease', entersResidual: true },
  { reason: 'delivery', label: 'Delivery arrived', totalStock: 'increase', entersResidual: true },
  {
    reason: 'miscount',
    label: 'Miscount correction',
    totalStock: 'unchanged',
    // Spec §5.3 and §3.3: a data fix, not a stock movement. It corrects the
    // record without entering the sales calculation at all.
    entersResidual: false,
  },
]

const BY_REASON = new Map(ADJUSTMENT_REASONS.map((r) => [r.reason, r]))

export function reasonSpec(reason: AdjustmentReason): ReasonSpec {
  const spec = BY_REASON.get(reason)
  if (!spec) throw new Error(`Unknown adjustment reason: ${reason}`)
  return spec
}

export function entersResidual(reason: AdjustmentReason): boolean {
  return reasonSpec(reason).entersResidual
}
