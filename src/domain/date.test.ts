import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { today, formatRunDate, daysBetween } from './date'

// fix-plan 2026-08-27, item 1 (critical): the run date must be the
// operator's *local* calendar day, never UTC. This machine runs at
// Australia/Adelaide (+09:30), and the operator starts real restock runs
// before 09:30 local. A UTC-based `today()` (`toISOString().slice(0, 10)`)
// reads that instant as still being the previous UTC day, which — per the
// spec §7 amendment that made `getOrCreateRun`/`openVisit` return existing
// records instead of throwing — means tomorrow's real counts would silently
// land on tonight's test run and inside a visit already finalized tonight.
describe('today', () => {
  const originalTZ = process.env.TZ

  beforeEach(() => {
    process.env.TZ = 'Australia/Adelaide'
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTZ
  })

  it('returns the local calendar day even when UTC still reads the previous day', () => {
    // 2026-08-28T00:30:00+09:30 local == 2026-08-27T15:00:00Z. A
    // shape-only assertion (does it look like yyyy-mm-dd?) would pass
    // against the broken UTC implementation too — this pins the actual
    // boundary value.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T15:00:00Z'))

    expect(today()).toBe('2026-08-28')
  })

  it('agrees with UTC well after local midnight, so the fix is not just an offset flip', () => {
    // 2026-08-27T10:00:00+09:30 local == 2026-08-27T00:30:00Z — both
    // calendars land on the same date here.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T00:30:00Z'))

    expect(today()).toBe('2026-08-27')
  })
})

// The history screen labels each run with its date. `new Date('2026-08-27')`
// parses as UTC midnight, which in any zone behind UTC renders as the 26th —
// the same class of bug as the critical one above, one screen over.
describe('formatRunDate', () => {
  const originalTZ = process.env.TZ

  afterEach(() => {
    process.env.TZ = originalTZ
  })

  it('reads a stored run date as a plain calendar date', () => {
    expect(formatRunDate('2026-08-27')).toBe('Thu 27 Aug 2026')
  })

  it('does not shift the date in a zone behind UTC', () => {
    // Honolulu is UTC-10. Parsing '2026-08-27' as an instant renders as the
    // 26th here.
    process.env.TZ = 'Pacific/Honolulu'
    expect(formatRunDate('2026-08-27')).toBe('Thu 27 Aug 2026')
  })

  it('does not shift the date in a zone ahead of UTC either', () => {
    process.env.TZ = 'Australia/Adelaide'
    expect(formatRunDate('2026-08-27')).toBe('Thu 27 Aug 2026')
  })

  it('handles the first of a month, where an off-by-one crosses the month', () => {
    expect(formatRunDate('2026-09-01')).toBe('Tue 1 Sep 2026')
  })
})

// Phase 3 §5.3: the demand rate needs a period's *length*, and a period is
// bounded by two run dates. Calendar days between them, never milliseconds
// between `finalizedAt` stamps — a run date cannot move, and a late edit
// re-stamps `finalizedAt` and would silently stretch a 3-day period to 10.
describe('daysBetween', () => {
  const originalTZ = process.env.TZ

  afterEach(() => {
    process.env.TZ = originalTZ
  })

  it('counts calendar days between two stored run dates', () => {
    expect(daysBetween('2026-08-25', '2026-08-28')).toBe(3)   // Tue → Fri
    expect(daysBetween('2026-08-28', '2026-09-01')).toBe(4)   // Fri → Tue
    expect(daysBetween('2026-08-25', '2026-08-25')).toBe(0)
  })

  it('is not thrown off by a daylight-saving boundary', () => {
    // Adelaide moves on the first Sunday in October.
    process.env.TZ = 'Australia/Adelaide'
    expect(daysBetween('2026-10-02', '2026-10-06')).toBe(4)
  })

  it('counts across a month and a year boundary', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3)
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
  })

  it('is negative when the dates are the wrong way round, not silently zero', () => {
    expect(daysBetween('2026-08-28', '2026-08-25')).toBe(-3)
  })
})
