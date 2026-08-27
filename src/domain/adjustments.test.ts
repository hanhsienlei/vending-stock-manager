import { describe, it, expect } from 'vitest'
import { ADJUSTMENT_REASONS, reasonSpec, entersResidual } from './adjustments'
import type { AdjustmentReason } from './types'

describe('the adjustment reason table', () => {
  it('covers spec §5.3 exactly, plus delivery', () => {
    expect(ADJUSTMENT_REASONS.map((r) => r.reason)).toEqual([
      'transfer', 'expired', 'damaged', 'missing', 'delivery', 'miscount',
    ])
  })

  // Spec §3.3: "Miscount corrections adjust the recorded level without
  // entering this calculation at all — they are data fixes, not stock
  // movements." Getting this wrong double-counts a correction as a sale.
  it('keeps a miscount out of the residual, and everything else in', () => {
    expect(entersResidual('miscount')).toBe(false)

    const others: AdjustmentReason[] =
      ['transfer', 'expired', 'damaged', 'missing', 'delivery']
    expect(others.filter((r) => !entersResidual(r))).toEqual([])
  })

  it('marks delivery as the only reason that increases total stock', () => {
    const increasing = ADJUSTMENT_REASONS
      .filter((r) => r.totalStock === 'increase')
      .map((r) => r.reason)
    expect(increasing).toEqual(['delivery'])
  })

  it('treats a transfer as moving stock, not losing it', () => {
    expect(reasonSpec('transfer').totalStock).toBe('unchanged')
  })

  it('gives every reason a label for the sheet', () => {
    expect(ADJUSTMENT_REASONS.filter((r) => r.label.trim() === '')).toEqual([])
  })
})
