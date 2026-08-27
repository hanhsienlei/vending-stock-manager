import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db'
import { createRun, getOrCreateRun, listRuns } from './runs'
import {
  openVisit, getCountLines, putCountLine, putCountLines, finalizeVisit, historyForMachine,
  assertVisitNotFinalized,
} from './visits'
import { newId, now } from '../../domain/ids'
import { lastRecordedLevels, levelKey } from '../../domain/levels'
import type { CountLine } from '../../domain/types'

const lineFor = (visitId: string, after: number): CountLine => ({
  id: newId(), visitId, slotNumber: 58, itemId: 'coke',
  before: 3, after, touched: true, filled: false, updatedAt: now(),
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('runs', () => {
  it('lists newest first', async () => {
    await createRun('2026-08-22')
    await createRun('2026-08-26')
    expect((await listRuns()).map((r) => r.date)).toEqual(['2026-08-26', '2026-08-22'])
  })

  it('creates one run per date even when two taps race', async () => {
    const [a, b] = await Promise.all([
      getOrCreateRun('2026-08-26'),
      getOrCreateRun('2026-08-26'),
    ])

    expect(b.id).toBe(a.id)
    expect(await listRuns()).toHaveLength(1)
  })

  it('returns the existing run for a date rather than a second one', async () => {
    const first = await createRun('2026-08-26')
    const again = await getOrCreateRun('2026-08-26')

    expect(again.id).toBe(first.id)
    expect(again.createdAt).toBe(first.createdAt)
    expect(await listRuns()).toHaveLength(1)
  })

  it('still creates a distinct run for a different date', async () => {
    const tuesday = await getOrCreateRun('2026-08-25')
    const friday = await getOrCreateRun('2026-08-28')

    expect(friday.id).not.toBe(tuesday.id)
    expect((await listRuns()).map((r) => r.date)).toEqual(['2026-08-28', '2026-08-25'])
  })
})

describe('visits', () => {
  it('reuses an existing draft rather than creating a second', async () => {
    const run = await createRun('2026-08-26')
    const a = await openVisit(run.id, 'L7')
    const b = await openVisit(run.id, 'L7')
    expect(b.id).toBe(a.id)
  })

  it('stores count lines', async () => {
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')
    await putCountLine(lineFor(visit.id, 8))
    expect(await getCountLines(visit.id)).toHaveLength(1)
  })

  it('accepts writes to a finalized visit — finishing a machine is a marker, not a lock (spec §7, amended)', async () => {
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')
    await finalizeVisit(visit.id)

    await putCountLine(lineFor(visit.id, 8))

    const lines = await getCountLines(visit.id)
    expect(lines).toHaveLength(1)
    expect(lines[0].after).toBe(8)
  })

  // Item 7, fix-plan 2026-08-27. Spec §7, amended: "an edit re-stamps
  // updatedAt." Today only finalizeVisit did that; a count edit re-stamped
  // the CountLine but left Visit.updatedAt stale, weakening visit-level
  // traceability exactly where the amendment relies on it (edits after
  // finalize must be traceable since they are no longer blocked).
  it("re-stamps the visit's updatedAt on a count-line write, including after finalize", async () => {
    let t = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => {
      t += 1000
      return t
    })

    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')
    const finalized = await finalizeVisit(visit.id)

    await putCountLine(lineFor(visit.id, 8))

    const reloaded = await db.visits.get(visit.id)
    expect(reloaded?.updatedAt).toBeGreaterThan(finalized.updatedAt)
    // The marker is unaffected by an edit — still finalized, not reverted to draft.
    expect(reloaded?.status).toBe('finalized')

    vi.restoreAllMocks()
  })

  it("re-stamps the visit's updatedAt on a draft count-line write too", async () => {
    let t = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => {
      t += 1000
      return t
    })

    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')

    await putCountLine(lineFor(visit.id, 8))

    const reloaded = await db.visits.get(visit.id)
    expect(reloaded?.updatedAt).toBeGreaterThan(visit.updatedAt)

    vi.restoreAllMocks()
  })

  it('rejects a write to an unknown visit', async () => {
    await expect(putCountLine(lineFor('no-such-visit', 8))).rejects.toThrow(/unknown visit/i)
  })

  it('returns only finalized visits in history, newest first', async () => {
    const older = await createRun('2026-08-22')
    const olderVisit = await openVisit(older.id, 'L7')
    await putCountLine(lineFor(olderVisit.id, 3))
    await finalizeVisit(olderVisit.id)

    const newer = await createRun('2026-08-26')
    const newerVisit = await openVisit(newer.id, 'L7')
    await putCountLine(lineFor(newerVisit.id, 8))
    await finalizeVisit(newerVisit.id)

    const draftRun = await createRun('2026-08-29')
    await openVisit(draftRun.id, 'L7')   // left as a draft

    const history = await historyForMachine('L7')
    expect(history).toHaveLength(2)
    expect(history[0].lines[0].after).toBe(8)
    expect(history[1].lines[0].after).toBe(3)
  })

  it('does not mix in another machine\'s visits, now that lookup goes through the machineId index', async () => {
    const run = await createRun('2026-08-26')
    const thisMachine = await openVisit(run.id, 'L7')
    await putCountLine(lineFor(thisMachine.id, 8))
    await finalizeVisit(thisMachine.id)

    const otherMachine = await openVisit(run.id, 'L9')
    await putCountLine(lineFor(otherMachine.id, 99))
    await finalizeVisit(otherMachine.id)

    const history = await historyForMachine('L7')
    expect(history).toHaveLength(1)
    expect(history[0].visit.machineId).toBe('L7')
  })

  it('upserts repeated taps on the same slot/item into a single row', async () => {
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')

    await putCountLine(lineFor(visit.id, 8))
    await putCountLine(lineFor(visit.id, 5))
    await putCountLine(lineFor(visit.id, 3))

    const lines = await getCountLines(visit.id)
    expect(lines).toHaveLength(1)
    expect(lines[0].after).toBe(3)
  })

  it('keeps two items in the same slot as separate rows', async () => {
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')

    await putCountLine({ ...lineFor(visit.id, 8), itemId: 'coke' })
    await putCountLine({ ...lineFor(visit.id, 2), itemId: 'sunkist' })

    const lines = await getCountLines(visit.id)
    expect(lines).toHaveLength(2)
  })

  it('writes a batch of lines in one go, upserting the ones already stored', async () => {
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')

    // The operator touched slot 58 during the walk.
    await putCountLine(lineFor(visit.id, 8))

    // Finalize records the whole machine, including that row again.
    await putCountLines([
      { ...lineFor(visit.id, 8), id: newId() },
      { ...lineFor(visit.id, 4), id: newId(), slotNumber: 59, touched: false },
      { ...lineFor(visit.id, 2), id: newId(), slotNumber: 52, itemId: 'fanta' },
      { ...lineFor(visit.id, 1), id: newId(), slotNumber: 52, itemId: 'sunkist' },
    ])

    const lines = await getCountLines(visit.id)
    expect(lines).toHaveLength(4)
    expect(lines.filter((l) => l.slotNumber === 58)).toHaveLength(1)
    expect(lines.find((l) => l.slotNumber === 59)).toMatchObject({
      after: 4, touched: false,
    })
  })

  it('accepts a batch aimed at a finalized visit', async () => {
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')
    await finalizeVisit(visit.id)

    await putCountLines([lineFor(visit.id, 8)])
    expect(await getCountLines(visit.id)).toHaveLength(1)
  })

  it('re-stamps finalizedAt and updatedAt on every call, so re-finishing after an edit still works', async () => {
    let t = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => {
      t += 1000
      return t
    })

    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')
    const first = await finalizeVisit(visit.id)
    const second = await finalizeVisit(visit.id)

    expect(second.finalizedAt).toBeGreaterThan(first.finalizedAt ?? 0)
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt)

    vi.restoreAllMocks()
  })
})

describe('assertVisitNotFinalized', () => {
  it('is available for a genuine lock, but is not enforced on the normal write path', async () => {
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')
    const finalized = await finalizeVisit(visit.id)

    expect(() => assertVisitNotFinalized(finalized)).toThrow(/finalized/i)
    // The normal path (putCountLine/putCountLines) does not call it —
    // confirmed above by writes to a finalized visit succeeding.
  })
})

describe('historyForMachine bounds', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Stamps each record with a strictly increasing time, so `finalizedAt`
   * ordering is deterministic rather than depending on whether two writes
   * happened to land in the same millisecond. */
  function useIncreasingClock() {
    let t = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => {
      t += 1000
      return t
    })
  }

  async function seedFinalizedVisits(machineId: string, count: number) {
    for (let i = 0; i < count; i += 1) {
      const run = await createRun(`2026-08-${String(10 + i).padStart(2, '0')}`)
      const visit = await openVisit(run.id, machineId)
      await putCountLine({ ...lineFor(visit.id, i), id: newId() })
      await finalizeVisit(visit.id)
    }
  }

  it('reads only the newest 4 finalized visits by default', async () => {
    useIncreasingClock()
    await seedFinalizedVisits('L7', 6)

    const history = await historyForMachine('L7')

    expect(history).toHaveLength(4)
    expect(history.map((h) => h.lines[0].after)).toEqual([5, 4, 3, 2])
  })

  it('honours an explicit limit', async () => {
    useIncreasingClock()
    await seedFinalizedVisits('L7', 6)

    const history = await historyForMachine('L7', 2)

    expect(history.map((h) => h.lines[0].after)).toEqual([5, 4])
  })

  it('still lets the newest value per key win within the bound', async () => {
    useIncreasingClock()
    await seedFinalizedVisits('L7', 6)

    const history = await historyForMachine('L7')

    expect(lastRecordedLevels(history).get(levelKey(58, 'coke'))).toBe(5)
  })
})
