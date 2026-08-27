import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { today } from './date'

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
