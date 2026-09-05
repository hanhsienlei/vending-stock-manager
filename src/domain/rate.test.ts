import { describe, it, expect } from 'vitest'
import { demandRate, MIN_PERIODS_FOR_RATE, RATE_WINDOW } from './rate'
import type { SlotPeriod } from './slotPeriods'

const period = (
  runDate: string, sold: number | null, days: number,
  extra: Partial<SlotPeriod> = {},
): SlotPeriod => ({
  machineId: 'L7', slotNumber: 52, runDate, days, sold,
  closingTotal: sold === null ? 0 : 4,
  ...extra,
})

const excluded = (
  runDate: string, reason: SlotPeriod['exclusion'], days = 3,
): SlotPeriod => period(runDate, null, days, { exclusion: reason })

describe('demandRate', () => {
  // Design §3.3: pooled units over pooled days, not a mean of four quotients.
  // Periods alternate 3 and 4 days at a Tue/Fri cadence, so the two differ —
  // and "42 sold over 14 days = 3.0 a day" is one division the operator can
  // check by hand, which is spec §6.1's whole argument for a mean at all.
  it('is total units over total days across the window', () => {
    const result = demandRate([
      period('2026-09-01', 12, 4),
      period('2026-08-28', 9, 3),
      period('2026-08-25', 12, 4),
      period('2026-08-21', 9, 3),
    ])

    expect(result.unitsSold).toBe(42)
    expect(result.days).toBe(14)
    expect(result.rate).toBeCloseTo(3.0)
    expect(result.periodsUsed).toBe(4)
  })

  it('is not the mean of the per-period rates', () => {
    // 12/4 = 3.0 and 1/3 = 0.333…; the mean of quotients is 1.667, while
    // pooled is 13/7 = 1.857. Different numbers, and pooled is the answer to
    // "how many a day does this slot sell".
    const result = demandRate([period('2026-09-01', 12, 4), period('2026-08-28', 1, 3)])

    expect(result.rate).toBeCloseTo(13 / 7)
    expect(result.rate).not.toBeCloseTo(1.667)
  })

  it('takes the four most recent usable periods, skipping the rest', () => {
    const result = demandRate([
      period('2026-09-01', 4, 4),
      excluded('2026-08-28', 'ran-dry'),
      period('2026-08-25', 4, 4),
      excluded('2026-08-21', 'residual-clamped'),
      period('2026-08-18', 4, 4),
      period('2026-08-14', 4, 4),
      period('2026-08-11', 99, 4),   // beyond the window: must not be counted
    ])

    expect(result.periodsUsed).toBe(RATE_WINDOW)
    expect(result.unitsSold).toBe(16)
    expect(result.days).toBe(16)
    expect(result.rate).toBeCloseTo(1.0)
  })

  it('uses what it has when fewer than four periods are usable', () => {
    const result = demandRate([period('2026-09-01', 8, 4), period('2026-08-28', 4, 3)])

    expect(result.periodsUsed).toBe(2)
    expect(result.rate).toBeCloseTo(12 / 7)
  })

  // null is not zero, and the two must never be collapsed: zero means "this
  // slot sells nothing", null means "I don't know yet", and they produce
  // different needs downstream.
  it('has no rate below two usable periods — null, not zero', () => {
    const result = demandRate([
      period('2026-09-01', 6, 3),
      excluded('2026-08-28', 'ran-dry'),
    ])

    expect(result.rate).toBeNull()
    expect(result.rate).not.toBe(0)
    expect(result.periodsUsed).toBe(1)
  })

  it('has no rate with no periods at all', () => {
    const result = demandRate([])

    expect(result.rate).toBeNull()
    expect(result.periodsUsed).toBe(0)
    expect(result.unitsSold).toBe(0)
    expect(result.days).toBe(0)
  })

  it('has no rate when every period is excluded', () => {
    const result = demandRate([
      excluded('2026-09-01', 'ran-dry'),
      excluded('2026-08-28', 'left-slot-with-stock'),
      excluded('2026-08-25', 'visit-not-finalized'),
      excluded('2026-08-21', 'residual-clamped'),
    ])

    expect(result.rate).toBeNull()
    expect(result.periodsUsed).toBe(0)
  })

  it('has a rate of zero for a slot that genuinely sold nothing', () => {
    const result = demandRate([
      period('2026-09-01', 0, 4),
      period('2026-08-28', 0, 3),
      period('2026-08-25', 0, 4),
      period('2026-08-21', 0, 3),
    ])

    expect(result.rate).toBe(0)
    expect(result.rate).not.toBeNull()
    expect(result.periodsUsed).toBe(4)
  })

  // Not decoration: spec §6.1 chooses a mean over anything cleverer BECAUSE
  // the operator has to trust the number, and a number whose exclusions are
  // invisible is not checkable.
  it('reports what it skipped and why, so the screen can show it', () => {
    const result = demandRate([
      period('2026-09-01', 6, 3),
      excluded('2026-08-28', 'ran-dry'),
      period('2026-08-25', 6, 3),
      excluded('2026-08-21', 'ran-dry'),
      period('2026-08-18', 6, 3),
      period('2026-08-14', 6, 3),
    ])

    expect(result.excluded).toEqual([
      { runDate: '2026-08-28', reason: 'ran-dry' },
      { runDate: '2026-08-21', reason: 'ran-dry' },
    ])
  })

  it('reports only the exclusions inside the range it actually scanned', () => {
    const result = demandRate([
      period('2026-09-01', 6, 3),
      period('2026-08-28', 6, 3),
      period('2026-08-25', 6, 3),
      period('2026-08-21', 6, 3),
      // The window filled above; nothing past here was consulted, so nothing
      // past here may be reported as skipped.
      excluded('2026-08-18', 'ran-dry'),
    ])

    expect(result.excluded).toEqual([])
  })

  it('carries the numbers the screen shows the workings from', () => {
    const result = demandRate([period('2026-09-01', 12, 4), period('2026-08-28', 9, 3)])

    // "3.0 / day — 21 sold over 7 days, 2 periods."
    expect(result.unitsSold).toBe(21)
    expect(result.days).toBe(7)
    expect(result.periodsUsed).toBe(2)
  })

  // A usable period with a null `sold` should not exist — slotPeriods nulls
  // `sold` exactly when it sets an exclusion — but the rate must not silently
  // treat one as a zero if it ever does.
  it('ignores a period with no figure even if nothing marked it excluded', () => {
    const result = demandRate([
      period('2026-09-01', 6, 3),
      period('2026-08-28', null, 3),
      period('2026-08-25', 6, 3),
    ])

    expect(result.periodsUsed).toBe(2)
    expect(result.unitsSold).toBe(12)
  })

  it('states its window and its floor as constants the screen can read', () => {
    expect(RATE_WINDOW).toBe(4)
    expect(MIN_PERIODS_FOR_RATE).toBe(2)
  })
})
