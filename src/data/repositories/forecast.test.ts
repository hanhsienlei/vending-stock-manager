import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db'
import { saveItem } from './items'
import { saveMachine } from './machines'
import { setPlacement } from './placements'
import { getOrCreateRun } from './runs'
import { openVisit, putCountLines, finalizeVisit } from './visits'
import { forecastForRun, RATE_SEARCH_VISITS } from './forecast'
import { newId, now } from '../../domain/ids'
import type { Id } from '../../domain/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

interface SlotCount {
  slotNumber: number
  itemId: Id
  before: number
  after: number
}

/** One finalized visit to one machine on one run date. `before` closes the
 * period that visit ends; `after` opens the next one. */
async function count(runDate: string, machineId: Id, slots: SlotCount[]) {
  const run = await getOrCreateRun(runDate)
  const visit = await openVisit(run.id, machineId)
  await putCountLines(slots.map((slot) => ({
    id: newId(), visitId: visit.id, slotNumber: slot.slotNumber,
    itemId: slot.itemId, before: slot.before, after: slot.after,
    touched: true, filled: false, price: 4.5, updatedAt: now(),
  })))
  await finalizeVisit(visit.id)
  return visit
}

async function coke() {
  return saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
}

/** `count` run dates, one a week from `start`, oldest first. */
function weeklyFrom(start: string, weeks: number): string[] {
  const [year, month, day] = start.split('-').map(Number)
  return Array.from({ length: weeks }, (_, week) =>
    new Date(Date.UTC(year, month - 1, day + week * 7)).toISOString().slice(0, 10))
}

/** Nine weekly visits ending 2026-08-25, so eight periods of 7 days each. */
const TUESDAYS = weeklyFrom('2026-06-30', 9)

describe('forecastForRun', () => {
  // The finding that made RATE_SEARCH_VISITS necessary. The usable periods
  // alternate with dry ones, so four clean periods lie seven periods back —
  // and `HISTORY_LIMIT = 4` would bound only three periods, of which two are
  // usable. A four-period window cannot be filled from four visits.
  it('finds four usable periods past several censored ones', async () => {
    const item = await coke()
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(item.id, { kind: 'base' }, [58])

    // Closing levels, oldest first: the first visit opens the history, then
    // usable and ran-dry periods alternate.  Every visit refills to 10.
    const closings = [0, 3, 3, 0, 3, 0, 3, 0, 3]
    for (const [index, date] of TUESDAYS.entries()) {
      await count(date, l7.id, [
        { slotNumber: 58, itemId: item.id, before: closings[index], after: 10 },
      ])
    }

    const [row] = await forecastForRun('2026-08-28')

    expect(row.rateDetail.periodsUsed).toBe(4)
    expect(row.rateDetail.unitsSold).toBe(28)
    expect(row.rateDetail.days).toBe(28)
    expect(row.rate).toBe(1)
    expect(row.rateDetail.excluded.map((e) => e.reason)).toEqual(
      ['ran-dry', 'ran-dry', 'ran-dry'],
    )
    // 10 in the slot, 3 days at 1/day, refill the 3 that will have gone.
    expect(row.daysSince).toBe(3)
    expect(row.projected).toBe(7)
    expect(row.need).toBe(3)
    expect(row.basis).toBe('rate')
  })

  // Design §7.1: a machine skipped last Friday has been drawing down for a
  // week while its neighbours have had three days, and skipped machines are
  // the ones most likely to be empty.
  it('measures days since THIS machine\'s last visit, not since the last run', async () => {
    const item = await coke()
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const l8 = await saveMachine({ label: 'Lift lobby', level: 8 })
    await setPlacement(item.id, { kind: 'base' }, [58])

    for (const date of ['2026-08-04', '2026-08-11', '2026-08-18']) {
      await count(date, l7.id, [{ slotNumber: 58, itemId: item.id, before: 3, after: 10 }])
      await count(date, l8.id, [{ slotNumber: 58, itemId: item.id, before: 3, after: 10 }])
    }
    // L7 is counted again on the 25th; L8 is skipped.
    await count('2026-08-25', l7.id, [
      { slotNumber: 58, itemId: item.id, before: 3, after: 10 },
    ])

    const rows = await forecastForRun('2026-08-28')
    const forL7 = rows.find((r) => r.machineId === l7.id)
    const forL8 = rows.find((r) => r.machineId === l8.id)

    expect(forL7?.daysSince).toBe(3)
    expect(forL8?.daysSince).toBe(10)
    // Same rate, twice the drawdown: the skipped machine wants more.
    expect(forL8?.need).toBeGreaterThan(forL7?.need ?? 0)
  })

  it('gives a machine that has never been counted the no-rate fallback', async () => {
    const item = await coke()
    await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(item.id, { kind: 'base' }, [58])

    const [row] = await forecastForRun('2026-08-28')

    expect(row.rate).toBeNull()
    expect(row.basis).toBe('no-rate')
    expect(row.lastLevel).toBe(0)
    expect(row.need).toBe(10)          // the whole capacity
    expect(row.rateDetail.periodsUsed).toBe(0)
  })

  // Two usable periods is the floor (`MIN_PERIODS_FOR_RATE`); one is not a
  // rate, and must not be reported as a rate of zero.
  it('gives a slot with only one usable period no rate at all', async () => {
    const item = await coke()
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(item.id, { kind: 'base' }, [58])

    await count('2026-08-18', l7.id, [
      { slotNumber: 58, itemId: item.id, before: 0, after: 10 },
    ])
    await count('2026-08-25', l7.id, [
      { slotNumber: 58, itemId: item.id, before: 3, after: 10 },
    ])

    const [row] = await forecastForRun('2026-08-28')

    expect(row.rateDetail.periodsUsed).toBe(1)
    expect(row.rate).toBeNull()
    expect(row.basis).toBe('no-rate')
    // The fallback assumes nothing sold, and the slot was left full: nothing
    // to bring. Not a rate of zero dressed up as one.
    expect(row.need).toBe(0)
  })

  it('reads no more than RATE_SEARCH_VISITS visits per machine', async () => {
    const item = await coke()
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(item.id, { kind: 'base' }, [58])

    // Fifteen weekly visits — three more than the search window.
    for (const date of weeklyFrom('2026-05-05', 15)) {
      await count(date, l7.id, [
        { slotNumber: 58, itemId: item.id, before: 3, after: 10 },
      ])
    }

    const spy = vi.spyOn(db.countLines, 'where')
    await forecastForRun('2026-08-28')

    // `where` is overloaded across a string, a string[] and a criteria
    // object, so the argument is compared as text rather than by identity.
    const lineReads = spy.mock.calls.filter((call) => String(call[0]) === 'visitId')
    expect(lineReads).toHaveLength(RATE_SEARCH_VISITS)
    spy.mockRestore()
  })

  // Design §3.2: demand is measured on the slot total, so a slot holding two
  // items has one rate, not two — and the incoming item's early periods do
  // not censor the channel.
  it('measures a two-item slot on the slot total', async () => {
    const cokeItem = await coke()
    const fanta = await saveItem({ name: 'Fanta', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(cokeItem.id, { kind: 'base' }, [58])
    await setPlacement(fanta.id, { kind: 'base' }, [58])

    for (const date of ['2026-08-11', '2026-08-18', '2026-08-25']) {
      await count(date, l7.id, [
        { slotNumber: 58, itemId: cokeItem.id, before: 1, after: 5 },
        { slotNumber: 58, itemId: fanta.id, before: 2, after: 5 },
      ])
    }

    const [row] = await forecastForRun('2026-08-28')

    // 10 left at each visit, 3 found at the next: 7 a period, over 7 days.
    expect(row.itemIds).toHaveLength(2)
    expect(row.lastLevel).toBe(10)
    expect(row.rateDetail.periodsUsed).toBe(2)
    expect(row.rate).toBe(1)
  })

  it('covers every machine that has a map, in walk order', async () => {
    const item = await coke()
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const l2 = await saveMachine({ label: 'Lift lobby', level: 2 })
    const l16 = await saveMachine({ label: 'Nothing stocked', level: 16 })
    await setPlacement(item.id, { kind: 'base' }, [58, 59])
    // An explicit machine override of no slots at all — L16 stocks nothing,
    // so it has no map and contributes no rows.
    await setPlacement(item.id, { kind: 'machine', machineId: l16.id }, [])

    const rows = await forecastForRun('2026-08-28')

    expect(rows.map((r) => [r.machineId, r.slotNumber])).toEqual([
      [l2.id, 58], [l2.id, 59], [l7.id, 58], [l7.id, 59],
    ])
    expect(rows.every((r) => r.itemIds[0] === item.id)).toBe(true)
  })

  it('reports the slot that ran dry last period, for allocation to rank on', async () => {
    const item = await coke()
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(item.id, { kind: 'base' }, [58, 59])

    await count('2026-08-18', l7.id, [
      { slotNumber: 58, itemId: item.id, before: 3, after: 10 },
      { slotNumber: 59, itemId: item.id, before: 3, after: 10 },
    ])
    await count('2026-08-25', l7.id, [
      { slotNumber: 58, itemId: item.id, before: 0, after: 10 },
      { slotNumber: 59, itemId: item.id, before: 3, after: 10 },
    ])

    const rows = await forecastForRun('2026-08-28')

    expect(rows.find((r) => r.slotNumber === 58)?.ranDryLastPeriod).toBe(true)
    expect(rows.find((r) => r.slotNumber === 59)?.ranDryLastPeriod).toBe(false)
  })
})
