import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { setPlacement } from '../../data/repositories/placements'
import { createRun } from '../../data/repositories/runs'
import {
  openVisit, putCountLine, finalizeVisit, getCountLines,
} from '../../data/repositories/visits'
import { newId, now } from '../../domain/ids'
import { useCounting } from './useCounting'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function seed() {
  const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
  const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
  await setPlacement(coke.id, { kind: 'base' }, [58])
  return { coke, machine }
}

/** A mixed slot: two items sharing slot 52, no SlotConfig, so `accepts`
 * falls back to alphabetical order (Fanta, then Sunkist) and capacity
 * falls back to the preferred item's basePar (5). */
async function seedMixed() {
  const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
  const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
  const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
  await setPlacement(fanta.id, { kind: 'base' }, [52])
  await setPlacement(sunkist.id, { kind: 'base' }, [52])
  return { fanta, sunkist, machine }
}

describe('useCounting', () => {
  it('seeds before-counts from the last finalized visit', async () => {
    const { coke, machine } = await seed()

    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 58, itemId: coke.id,
      before: 2, after: 8, touched: true, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.before.get(`58:${coke.id}`)).toBe(8)
    expect(result.current.touched.has(`58:${coke.id}`)).toBe(false)
  })

  it('seeds zero when the machine has no history', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.before.get(`58:${coke.id}`)).toBe(0)
  })

  it('mirrors before into after until the slot is filled', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setBefore(58, coke.id, 3) })
    expect(result.current.after.get(`58:${coke.id}`)).toBe(3)

    await act(async () => { await result.current.toggleFill(58) })
    expect(result.current.after.get(`58:${coke.id}`)).toBe(8)
  })

  it('persists each change immediately, with no save step', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.setBefore(58, coke.id, 3) })

    const lines = await getCountLines(visit.id)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ before: 3, after: 3, touched: true })
  })

  it('finalizes the visit and blocks further writes', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await result.current.finalize() })

    await act(async () => {
      await expect(result.current.setBefore(58, coke.id, 4)).rejects.toThrow(/finalized/i)
    })
  })

  it('rolls back before to the pre-write value when a write is rejected', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await result.current.finalize() })

    await act(async () => {
      await expect(result.current.setBefore(58, coke.id, 4)).rejects.toThrow(/finalized/i)
    })

    expect(result.current.before.get(`58:${coke.id}`)).toBe(3)
    expect(result.current.after.get(`58:${coke.id}`)).toBe(3)
  })

  it('brings a mixed slot total to capacity on fill, not each item to capacity', async () => {
    const { fanta, sunkist, machine } = await seedMixed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.toggleFill(52) })

    const fantaAfter = result.current.after.get(`52:${fanta.id}`) ?? 0
    const sunkistAfter = result.current.after.get(`52:${sunkist.id}`) ?? 0
    expect(fantaAfter + sunkistAfter).toBe(5)
    expect(fantaAfter).toBeLessThanOrEqual(5)
    expect(sunkistAfter).toBeLessThanOrEqual(5)
  })

  it('preserves an in-progress count across reload() instead of re-seeding it from history', async () => {
    const { coke, machine } = await seed()

    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 58, itemId: coke.id,
      before: 2, after: 8, touched: true, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.before.get(`58:${coke.id}`)).toBe(8)

    await act(async () => { await result.current.setBefore(58, coke.id, 3) })
    expect(result.current.before.get(`58:${coke.id}`)).toBe(3)

    // A map correction (e.g. via SlotEditSheet) calls reload(), which gives
    // useMachineMap a new `map` array identity and re-fires the seeding
    // effect. That must merge, not replace: the operator's entered count
    // (3) must survive, not reset back to the historical level (8).
    await act(async () => { await result.current.reload() })
    await waitFor(() => expect(result.current.before.get(`58:${coke.id}`)).toBe(3))
    expect(result.current.after.get(`58:${coke.id}`)).toBe(3)
  })

  it('recomputes after for every item in a filled mixed slot when one item changes', async () => {
    const { fanta, sunkist, machine } = await seedMixed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.toggleFill(52) })
    await act(async () => { await result.current.setBefore(52, sunkist.id, 3) })

    const fantaBefore = result.current.before.get(`52:${fanta.id}`) ?? 0
    const sunkistBefore = result.current.before.get(`52:${sunkist.id}`) ?? 0
    const fantaAfter = result.current.after.get(`52:${fanta.id}`) ?? 0
    const sunkistAfter = result.current.after.get(`52:${sunkist.id}`) ?? 0

    expect(sunkistBefore).toBe(3)
    expect(fantaAfter + sunkistAfter).toBe(5)
    expect(fantaAfter).toBeGreaterThanOrEqual(fantaBefore)
    expect(sunkistAfter).toBeGreaterThanOrEqual(sunkistBefore)
  })
})

/** Switching screens, reloading the page, or a service-worker autoUpdate all
 * unmount the counting screen mid-machine. Spec §7: "every keystroke is
 * persisted immediately, so abandoning mid-machine loses nothing." */
describe('useCounting resuming an open draft visit', () => {
  async function seedWithHistory() {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58, 59])

    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 58, itemId: coke.id,
      before: 2, after: 8, touched: true, updatedAt: now(),
    })
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 59, itemId: coke.id,
      before: 1, after: 4, touched: true, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    return { coke, machine }
  }

  it('reloads counts entered before the screen was unmounted', async () => {
    const { coke, machine } = await seedWithHistory()
    const run = await createRun('2026-08-26')

    const first = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await act(async () => { await first.result.current.setBefore(58, coke.id, 3) })
    first.unmount()

    const second = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    // The draft line wins over the historical level (8) it was counted against.
    expect(second.result.current.before.get(`58:${coke.id}`)).toBe(3)
    expect(second.result.current.after.get(`58:${coke.id}`)).toBe(3)
  })

  it('restores which rows were touched, and leaves the untouched ones alone', async () => {
    const { coke, machine } = await seedWithHistory()
    const run = await createRun('2026-08-26')

    const first = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await act(async () => { await first.result.current.setBefore(58, coke.id, 3) })
    first.unmount()

    const second = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    expect(second.result.current.touched.has(`58:${coke.id}`)).toBe(true)
    expect(second.result.current.touched.has(`59:${coke.id}`)).toBe(false)
  })

  it('lets history fill the slots the open visit has not reached yet', async () => {
    const { coke, machine } = await seedWithHistory()
    const run = await createRun('2026-08-26')

    const first = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await act(async () => { await first.result.current.setBefore(58, coke.id, 3) })
    first.unmount()

    const second = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    expect(second.result.current.before.get(`59:${coke.id}`)).toBe(4)
  })

  it('restores the fill toggles already applied', async () => {
    const { coke, machine } = await seedWithHistory()
    const run = await createRun('2026-08-26')

    const first = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await act(async () => { await first.result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await first.result.current.toggleFill(58) })
    first.unmount()

    const second = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    expect(second.result.current.filled.has(58)).toBe(true)
    expect(second.result.current.after.get(`58:${coke.id}`)).toBe(8)
    expect(second.result.current.before.get(`58:${coke.id}`)).toBe(3)
  })

  it('does not resurrect a fill that was toggled back off', async () => {
    const { coke, machine } = await seedWithHistory()
    const run = await createRun('2026-08-26')

    const first = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await act(async () => { await first.result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await first.result.current.toggleFill(58) })
    await act(async () => { await first.result.current.toggleFill(58) })
    first.unmount()

    const second = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    expect(second.result.current.filled.has(58)).toBe(false)
    expect(second.result.current.after.get(`58:${coke.id}`)).toBe(3)
  })

  it('keeps an in-session count when a map correction re-fires the seed', async () => {
    const { coke, machine } = await seedWithHistory()
    const run = await createRun('2026-08-26')

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await result.current.reload() })

    await waitFor(() => expect(result.current.before.get(`58:${coke.id}`)).toBe(3))
    expect(result.current.filled.has(58)).toBe(false)
  })
})
