import { describe, it, expect } from 'vitest'
import { slotPeriods } from './slotPeriods'
import type { SalesLine } from './sales'

const salesLine = (
  slotNumber: number, itemId: string, opening: number, closing: number,
  extra: Partial<SalesLine> = {},
): SalesLine => ({
  slotNumber, itemId, opening, closing, movements: 0,
  sold: Math.max(0, opening - closing),
  ranDry: closing === 0, clamped: false, price: 4.5,
  revenue: Math.max(0, opening - closing) * 4.5,
  ...extra,
})

const one = (lines: SalesLine[]) =>
  slotPeriods('L7', '2026-08-28', '2026-08-25', lines)[0]

describe('slotPeriods', () => {
  // Design §3.2: spec §3.4 measures demand per SLOT; the residual is per
  // (slot, item), because opening and closing levels are per item and a
  // mixed slot holds two of them. This is that aggregation.
  it('sums an item-level residual into one slot figure', () => {
    const period = one([
      salesLine(52, 'coke', 8, 5),    // sold 3
      salesLine(52, 'fanta', 6, 4),   // sold 2
    ])

    expect(period.sold).toBe(5)
    expect(period.closingTotal).toBe(9)
    expect(period.exclusion).toBeUndefined()
  })

  it('measures the period in calendar days between the two run dates', () => {
    expect(one([salesLine(52, 'coke', 8, 5)]).days).toBe(3)
    expect(slotPeriods('L7', '2026-09-01', '2026-08-28', [
      salesLine(52, 'coke', 8, 5),
    ])[0].days).toBe(4)
  })

  it('is keyed by the closing run, which is what orders the rate window', () => {
    const period = one([salesLine(52, 'coke', 8, 5)])

    expect(period.machineId).toBe('L7')
    expect(period.slotNumber).toBe(52)
    expect(period.runDate).toBe('2026-08-28')
  })

  it('returns one period per slot, in slot order', () => {
    const periods = slotPeriods('L7', '2026-08-28', '2026-08-25', [
      salesLine(58, 'water', 4, 1),
      salesLine(52, 'coke', 8, 5),
    ])

    expect(periods.map((p) => p.slotNumber)).toEqual([52, 58])
  })

  // Spec §6.1's own wording: "the slot's total count reached 0". Observed
  // sales are then a lower bound, and learning from them teaches the slot to
  // under-order and guarantees it runs dry again.
  it('censors a slot whose TOTAL closed at zero', () => {
    const period = one([salesLine(52, 'coke', 8, 0)])

    expect(period.exclusion).toBe('ran-dry')
    expect(period.sold).toBeNull()
    expect(period.closingTotal).toBe(0)
  })

  // The test that separates SalesLine.ranDry from the slot's ran-dry.
  it('does NOT censor a mixed slot with one item at zero and stock in the other', () => {
    const period = one([
      salesLine(52, 'coke', 3, 0),    // this line IS ranDry
      salesLine(52, 'fanta', 6, 4),   // …but the channel dispensed all period
    ])

    expect(period.sold).toBe(5)
    expect(period.closingTotal).toBe(4)
    expect(period.exclusion).toBeUndefined()
  })

  it('carries a line-level censoring reason up to the slot', () => {
    const period = one([
      salesLine(52, 'coke', 3, 3, {
        sold: null, censoredReason: 'left-slot-with-stock',
      }),
      salesLine(52, 'fanta', 6, 4),
    ])

    expect(period.exclusion).toBe('left-slot-with-stock')
    expect(period.sold).toBeNull()
  })

  it('reuses the residual\'s vocabulary for a draft visit rather than inventing one', () => {
    const period = one([
      salesLine(52, 'coke', 3, 3, { sold: null, censoredReason: 'visit-not-finalized' }),
    ])

    expect(period.exclusion).toBe('visit-not-finalized')
  })

  // Design §3.4: the numbers for that period did not reconcile, so its zero
  // is not an honest zero.
  it('excludes a period whose residual clamped', () => {
    const period = one([
      salesLine(52, 'coke', 5, 9, { sold: 0, clamped: true }),
    ])

    expect(period.exclusion).toBe('residual-clamped')
    expect(period.sold).toBeNull()
  })

  it('clamps one line and censors the whole slot with it', () => {
    const period = one([
      salesLine(52, 'coke', 5, 9, { sold: 0, clamped: true }),
      salesLine(52, 'fanta', 6, 4),
    ])

    expect(period.exclusion).toBe('residual-clamped')
    expect(period.sold).toBeNull()
  })

  // A censored line has no residual, so a censoring reason outranks a clamp,
  // and both outrank ran-dry — the more specific explanation wins.
  it('prefers a line-level reason over a clamp and over ran-dry', () => {
    const period = one([
      salesLine(52, 'coke', 5, 0, {
        sold: null, censoredReason: 'no-previous-visit',
      }),
    ])

    expect(period.exclusion).toBe('no-previous-visit')
  })

  it('prefers a clamp over ran-dry', () => {
    const period = one([
      salesLine(52, 'coke', 5, 0, { sold: 0, clamped: true }),
    ])

    expect(period.exclusion).toBe('residual-clamped')
  })

  it('has no period at all without an opening run date', () => {
    expect(slotPeriods('L7', '2026-09-04', null, [salesLine(52, 'coke', 8, 5)]))
      .toEqual([])
  })

  it('has no periods when the visit recorded no lines', () => {
    expect(slotPeriods('L7', '2026-09-04', '2026-09-01', [])).toEqual([])
  })

  // Two runs on one calendar day is a correction, not a zero-length period,
  // and dividing by zero must be impossible.
  it('floors the period at one day when two runs land on the same date', () => {
    const period = slotPeriods('L7', '2026-08-28', '2026-08-28', [
      salesLine(52, 'coke', 8, 5),
    ])[0]

    expect(period.days).toBe(1)
  })

  it('records a genuine zero as zero sold, not as no figure', () => {
    const period = one([salesLine(52, 'coke', 8, 8)])

    expect(period.sold).toBe(0)
    expect(period.sold).not.toBeNull()
    expect(period.exclusion).toBeUndefined()
  })
})
