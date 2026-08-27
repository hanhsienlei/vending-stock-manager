import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { saveItem } from './items'
import { saveMachine } from './machines'
import { createRun } from './runs'
import { openVisit, putCountLine, finalizeVisit } from './visits'
import { recordAdjustment } from './adjustments'
import { salesForRange, salesForRun } from './sales'
import { newId, now } from '../../domain/ids'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function countMachine(
  runDate: string, machineId: string, itemId: string,
  before: number, after: number,
) {
  const run = await createRun(runDate)
  const visit = await openVisit(run.id, machineId)
  await putCountLine({
    id: newId(), visitId: visit.id, slotNumber: 58, itemId,
    before, after, touched: true, filled: false, price: 4.5, updatedAt: now(),
  })
  await finalizeVisit(visit.id)
  return { run, visit }
}

describe('salesForRange', () => {
  it('pairs each visit with the machine\'s previous one', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-20', l7.id, coke.id, 0, 10)
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    const [report] = await salesForRange('2026-08-27', '2026-08-27')

    expect(report.runDate).toBe('2026-08-27')
    expect(report.lines[0].sold).toBe(6)
  })

  // Design §5.1: a period is attributed to the run of its closing visit.
  it('attributes a skipped machine to the run it was next counted in', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-13', l7.id, coke.id, 0, 10)
    // No run on the 20th for this machine.
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    expect(await salesForRange('2026-08-20', '2026-08-20')).toEqual([])

    const [report] = await salesForRange('2026-08-27', '2026-08-27')
    expect(report.lines[0].sold).toBe(6)
  })

  it('sums across runs when the range spans several', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-13', l7.id, coke.id, 0, 10)
    await countMachine('2026-08-20', l7.id, coke.id, 7, 10)
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    const reports = await salesForRange('2026-08-14', '2026-08-27')

    expect(reports).toHaveLength(2)
    expect(reports.reduce((sum, r) => sum + (r.lines[0].sold ?? 0), 0)).toBe(9)
  })

  it('excludes runs outside the range at both ends', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-13', l7.id, coke.id, 0, 10)
    await countMachine('2026-08-20', l7.id, coke.id, 7, 10)
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    const reports = await salesForRange('2026-08-20', '2026-08-20')
    expect(reports.map((r) => r.runDate)).toEqual(['2026-08-20'])
  })

  it('ignores a draft visit, which has closed no period', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-20', l7.id, coke.id, 0, 10)
    const run = await createRun('2026-08-27')
    await openVisit(run.id, l7.id)

    expect(await salesForRange('2026-08-27', '2026-08-27')).toEqual([])
  })

  it('feeds the period its own machine\'s adjustments only', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const l2 = await saveMachine({ label: 'Gym', level: 2 })
    await countMachine('2026-08-20', l7.id, coke.id, 0, 10)
    await recordAdjustment({
      itemId: coke.id, locationKind: 'machine',
      machineId: l2.id, slotNumber: 58, reason: 'expired', units: -5,
    })
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    const [report] = await salesForRange('2026-08-27', '2026-08-27')
    expect(report.lines[0].sold).toBe(6)
  })

  // Design §3.2: sales always follow the counts, and an edit that lands after
  // the period closed is marked rather than blocked.
  it('marks a visit edited after the next run began', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const first = await countMachine('2026-08-20', l7.id, coke.id, 0, 10)
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    // `now()` is millisecond-resolution and IndexedDB-backed writes here are
    // fast enough to land in the same millisecond; force real separation so
    // the edit is unambiguously after the later run's finalize.
    await new Promise((resolve) => setTimeout(resolve, 5))

    // Edit the older visit now — after the later run exists.
    await putCountLine({
      id: newId(), visitId: first.visit.id, slotNumber: 58, itemId: coke.id,
      before: 1, after: 10, touched: true, filled: false, price: 4.5,
      updatedAt: now(),
    })

    const [older] = await salesForRange('2026-08-20', '2026-08-20')
    expect(older.editedLate).toBe(true)

    const [newer] = await salesForRange('2026-08-27', '2026-08-27')
    expect(newer.editedLate).toBe(false)
  })
})

describe('salesForRun', () => {
  it('is the same as a range covering that run\'s date', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-20', l7.id, coke.id, 0, 10)
    const { run } = await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    const byRun = await salesForRun(run.id)
    const byRange = await salesForRange('2026-08-27', '2026-08-27')

    expect(byRun).toEqual(byRange)
  })
})
