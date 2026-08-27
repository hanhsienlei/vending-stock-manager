import { describe, it, expect } from 'vitest'
import { salesForPeriod } from './sales'
import type { Adjustment, CountLine, Visit } from './types'

const visit = (id: string, finalizedAt: number): Visit => ({
  id, runId: 'r1', machineId: 'L7', status: 'finalized', finalizedAt,
  updatedAt: finalizedAt,
})

const line = (
  visitId: string, slotNumber: number, itemId: string,
  before: number, after: number, extra: Partial<CountLine> = {},
): CountLine => ({
  id: `${visitId}-${slotNumber}-${itemId}`, visitId, slotNumber, itemId,
  before, after, touched: true, filled: false, price: 4.5, updatedAt: 1,
  ...extra,
})

const movement = (
  itemId: string, slotNumber: number, units: number,
  reason: Adjustment['reason'], occurredAt: number,
): Adjustment => ({
  id: `${itemId}-${occurredAt}`, itemId, locationKind: 'machine',
  machineId: 'L7', slotNumber, reason, units, occurredAt, updatedAt: occurredAt,
})

describe('salesForPeriod', () => {
  it('sells the difference between what was left and what was found', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4)] },
      [],
    )

    expect(result.opening).toBe(10)
    expect(result.closing).toBe(4)
    expect(result.sold).toBe(6)
    expect(result.revenue).toBe(27)
  })

  // Spec §3.3's own worked cases.
  it('does not book a write-off as a sale', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 5, 5)] },
      [movement('coke', 58, -2, 'expired', 150)],
    )

    expect(result.sold).toBe(3)
  })

  it('counts stock transferred in as available to sell', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 5, 5)] },
      [movement('coke', 58, 3, 'transfer', 150)],
    )

    expect(result.sold).toBe(8)
  })

  it('ignores a miscount correction entirely', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4)] },
      [movement('coke', 58, -5, 'miscount', 150)],
    )

    expect(result.sold).toBe(6)
  })

  it('ignores movements outside the period', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4)] },
      [
        movement('coke', 58, -2, 'expired', 50),   // before the opening visit
        movement('coke', 58, -2, 'expired', 250),  // after the closing visit
      ],
    )

    expect(result.sold).toBe(6)
  })

  it('uses the closing line\'s price, so a period is valued as it was counted', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10, { price: 9.99 })] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4, { price: 4.5 })] },
      [],
    )

    expect(result.price).toBe(4.5)
    expect(result.revenue).toBe(27)
  })

  // Design §3.3: the operator's decision. An untouched row means seen and
  // unchanged, so it reports zero rather than being censored.
  it('reports zero for an untouched slot rather than censoring it', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 3)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 3, 3, { touched: false })] },
      [],
    )

    expect(result.sold).toBe(0)
    expect(result.censoredReason).toBeUndefined()
  })

  it('censors the first ever visit, which has no opening', () => {
    const [result] = salesForPeriod(
      null,
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 4, 4)] },
      [],
    )

    expect(result.sold).toBeNull()
    expect(result.revenue).toBeNull()
    expect(result.censoredReason).toBe('no-previous-visit')
  })

  // Design §3.4. The operator drains a line before removing it, so this is the
  // abnormal case: the item left the slot still holding stock, and the app
  // cannot tell whether it sold or was pulled out.
  it('censors an item that left a slot while it still held stock', () => {
    const results = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 5)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'fanta', 0, 5)] },
      [],
    )

    const coke = results.find((r) => r.itemId === 'coke')
    expect(coke?.sold).toBeNull()
    expect(coke?.censoredReason).toBe('left-slot-with-stock')
  })

  // The normal changeover, which must NOT be censored: Coke was drained to
  // zero before it was removed, so zero sold is the truthful answer.
  it('reports zero, not censored, when a drained line leaves a slot', () => {
    const results = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 0, 0)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'fanta', 0, 5)] },
      [],
    )

    const coke = results.find((r) => r.itemId === 'coke')
    expect(coke?.sold).toBe(0)
    expect(coke?.censoredReason).toBeUndefined()
  })

  it('reports a slot that ran dry, with its sales still counted', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 0, 0)] },
      [],
    )

    expect(result.ranDry).toBe(true)
    expect(result.sold).toBe(10)
  })

  it('handles a mixed slot as two independent results', () => {
    const results = salesForPeriod(
      {
        visit: visit('v1', 100),
        lines: [line('v1', 52, 'fanta', 0, 3), line('v1', 52, 'sunkist', 0, 2)],
      },
      {
        visit: visit('v2', 200),
        lines: [line('v2', 52, 'fanta', 1, 1), line('v2', 52, 'sunkist', 2, 2)],
      },
      [],
    )

    expect(results.find((r) => r.itemId === 'fanta')?.sold).toBe(2)
    expect(results.find((r) => r.itemId === 'sunkist')?.sold).toBe(0)
  })

  it('treats an item new to a slot as having opened at zero', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4)] },
      [],
    )

    expect(result.opening).toBe(0)
    // Found 4 in a slot that closed empty last time: negative sales are not
    // possible, so this is stock that arrived unrecorded, reported as zero.
    expect(result.sold).toBe(0)
  })

  // The movement window is deliberately asymmetric — half-open at the bottom
  // (`occurredAt <= from` excluded) and closed at the top (`> to` excluded) —
  // and that asymmetry is the only thing standing between an adjustment
  // logged at a finalize instant and being counted in BOTH adjacent periods.
  // Two visits finalized to the same millisecond is routine, so these are the
  // boundaries that decide whether revenue is stated once or twice.
  it('excludes an adjustment logged at the instant the period opened', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4)] },
      // occurredAt === from: it belongs to the period that just closed, which
      // has already counted it against its own closing level.
      [movement('coke', 58, -2, 'expired', 100)],
    )

    expect(result.movements).toBe(0)
    expect(result.sold).toBe(6)
  })

  it('includes an adjustment logged at the instant the period closed', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4)] },
      // occurredAt === to: logged at the machine during this very count, so
      // this is the period that owns it.
      [movement('coke', 58, -2, 'expired', 200)],
    )

    expect(result.movements).toBe(-2)
    expect(result.sold).toBe(4)
  })

  // A draft visit has not closed a period, so there is no bound on "the
  // window" — without a guard, `to` falls back to an unbounded ceiling and
  // admits adjustments that belong to a later, still-unopened period. This
  // proves both the censoring and that the hazard is actually closed.
  it('censors a draft visit instead of admitting an unbounded window of future adjustments', () => {
    const draftCurrent: Visit = {
      id: 'v2', runId: 'r1', machineId: 'L7', status: 'draft', updatedAt: 200,
    }

    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: draftCurrent, lines: [line('v2', 58, 'coke', 4, 4)] },
      [movement('coke', 58, -2, 'expired', 999_999_999)], // far in the future
    )

    expect(result.sold).toBeNull()
    expect(result.revenue).toBeNull()
    expect(result.censoredReason).toBe('visit-not-finalized')
    expect(result.movements).toBe(0)
  })
})
