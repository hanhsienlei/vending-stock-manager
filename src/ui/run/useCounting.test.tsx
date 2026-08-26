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

    await expect(result.current.setBefore(58, coke.id, 4)).rejects.toThrow(/finalized/i)
  })
})
