import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { setPlacement } from '../../data/repositories/placements'
import { setSlotConfig } from '../../data/repositories/slotConfigs'
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

/** Three single-item slots in the first (short) tray, for `fillTray`. Each
 * item's basePar (5) is what capacity falls back to with no SlotConfig. */
async function seedTray() {
  const chips = await saveItem({ name: 'Chips', price: 2, basePar: 5, boxSize: 24 })
  const gum = await saveItem({ name: 'Gum', price: 1, basePar: 5, boxSize: 24 })
  const mints = await saveItem({ name: 'Mints', price: 1, basePar: 5, boxSize: 24 })
  const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
  await setPlacement(chips.id, { kind: 'base' }, [10])
  await setPlacement(gum.id, { kind: 'base' }, [11])
  await setPlacement(mints.id, { kind: 'base' }, [12])
  return { chips, gum, mints, machine }
}

describe('useCounting', () => {
  it('seeds before-counts from the last finalized visit', async () => {
    const { coke, machine } = await seed()

    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 58, itemId: coke.id,
      before: 2, after: 8, touched: true, filled: true, price: 0, updatedAt: now(),
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

  it('finalizes the visit and still allows a correcting edit afterwards (spec §7, amended 2026-08-27)', async () => {
    // The operator finished a machine, noticed a miscount, and found a
    // screen that silently swallowed every tap. finalizedAt is a marker now,
    // not a lock.
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await result.current.finalize() })

    await act(async () => { await result.current.setBefore(58, coke.id, 4) })

    expect(result.current.before.get(`58:${coke.id}`)).toBe(4)
    const lines = await getCountLines(
      (await openVisit(run.id, machine.id)).id,
    )
    expect(lines.find((l) => l.slotNumber === 58)?.before).toBe(4)
  })

  it('rolls back before to the pre-write value when a write is rejected', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    // A rejection unrelated to finalization — e.g. the visit itself is gone —
    // is still possible and must still roll the optimistic update back.
    const visit = await openVisit(run.id, machine.id)
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setBefore(58, coke.id, 3) })
    await db.visits.delete(visit.id)

    await act(async () => {
      await expect(result.current.setBefore(58, coke.id, 4)).rejects.toThrow(/unknown visit/i)
    })

    expect(result.current.before.get(`58:${coke.id}`)).toBe(3)
    expect(result.current.after.get(`58:${coke.id}`)).toBe(3)
  })

  it('does not flag ran dry on a slot with no prior recorded level and no operator input', async () => {
    // First-ever visit to this machine: every slot seeds at 0 from an empty
    // history. That is "never counted", not "sold out" (spec §5.2, amended).
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const slot = result.current.map.find((s) => s.slotNumber === 58)!
    expect(result.current.before.get(`58:${coke.id}`)).toBe(0)
    expect(result.current.ranDry(slot)).toBe(false)
  })

  it('flags ran dry once the operator counts a never-counted slot down to zero', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const slot = result.current.map.find((s) => s.slotNumber === 58)!
    // Touch the row without changing its value: tap up then back down. The
    // operator has now actually looked at the slot and confirmed it empty.
    await act(async () => { await result.current.setBefore(58, coke.id, 1) })
    await act(async () => { await result.current.setBefore(58, coke.id, 0) })

    expect(result.current.touched.has(`58:${coke.id}`)).toBe(true)
    expect(result.current.ranDry(slot)).toBe(true)
  })

  it('still flags ran dry when a prior visit recorded the slot empty and it is carried forward', async () => {
    const { coke, machine } = await seed()

    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 58, itemId: coke.id,
      before: 0, after: 0, touched: true, filled: false, price: 0, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const slot = result.current.map.find((s) => s.slotNumber === 58)!
    // Untouched this visit — carried forward from a real, recorded empty.
    expect(result.current.touched.has(`58:${coke.id}`)).toBe(false)
    expect(result.current.ranDry(slot)).toBe(true)
  })

  // Item 3, fix-plan 2026-08-27: finalize() now writes a CountLine for every
  // slot, including untouched ones at 0 — so a machine's own open visit,
  // once finalized, satisfies `lastRecordedLevels` for every slot in the
  // map. Re-opening a machine finished earlier the same day (an ordinary
  // workflow now that finalizedAt is a marker, not a lock — spec §7) must
  // not let that self-history flag every untouched slot RAN DRY again.
  it('does not count a machine\'s own open visit as prior history for ran-dry', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')

    const first = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    // Finish immediately, touching nothing — slot 58 records before=0,
    // after=0, touched=false, exactly like every other never-counted slot.
    await act(async () => { await first.result.current.finalize() })
    first.unmount()

    const second = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    const slot = second.result.current.map.find((s) => s.slotNumber === 58)!
    expect(second.result.current.before.get(`58:${coke.id}`)).toBe(0)
    expect(second.result.current.touched.has(`58:${coke.id}`)).toBe(false)
    expect(second.result.current.ranDry(slot)).toBe(false)
  })

  it('still flags ran dry on reopen when a genuinely earlier finalized visit recorded the slot empty', async () => {
    const { coke, machine } = await seed()

    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 58, itemId: coke.id,
      before: 0, after: 0, touched: true, filled: false, price: 0, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')
    const first = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await act(async () => { await first.result.current.finalize() })
    first.unmount()

    const second = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    const slot = second.result.current.map.find((s) => s.slotNumber === 58)!
    expect(second.result.current.ranDry(slot)).toBe(true)
  })

  // Item 4, fix-plan 2026-08-27: toggleFill never marked a slot `touched`,
  // only `−`/`+` did. On a machine with no history, a slot found empty and
  // refilled without ever tapping the stepper therefore showed no RAN DRY —
  // losing the lost-sales signal on the run where it matters most. ranDry is
  // display-only (CountLine has no such field), so this is a presentation
  // fix, not a data one — but the persisted `touched` flag drives it, so it
  // must be set too.
  it('treats Fill as observing the slot, flagging ran dry on a never-counted empty slot', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const slot = result.current.map.find((s) => s.slotNumber === 58)!
    // Before any interaction: never counted, not sold out.
    expect(result.current.ranDry(slot)).toBe(false)

    // The operator never touched the stepper — the slot was already showing
    // 0 — and went straight to Fill.
    await act(async () => { await result.current.toggleFill(58) })

    expect(result.current.touched.has(`58:${coke.id}`)).toBe(true)
    expect(result.current.ranDry(slot)).toBe(true)

    const lines = await getCountLines(visit.id)
    expect(lines.find((l) => l.slotNumber === 58)?.touched).toBe(true)
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
      before: 2, after: 8, touched: true, filled: true, price: 0, updatedAt: now(),
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

  // Item 5, fix-plan 2026-08-27: SlotEditSheet's onSaved calls
  // counting.reload(), but mergeWith only fills gaps — a key already
  // present (a filled slot's `after`) is left alone. Raising a filled
  // slot's capacity via the slot editor therefore left `after` stuck at the
  // old capacity, both on screen and in the persisted CountLine, recording
  // a short fill.
  it("recomputes a filled slot's after when its capacity changes mid-count", async () => {
    const { coke, machine } = await seed() // basePar 8 -> capacity 8, no SlotConfig
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.toggleFill(58) })
    expect(result.current.after.get(`58:${coke.id}`)).toBe(8)

    // Raise the slot's capacity, exactly as SlotEditSheet's "Save capacity"
    // does, then reload the map the way its onSaved callback does.
    await setSlotConfig(machine.id, 58, { capacity: 20, accepts: [coke.id] })
    await act(async () => { await result.current.reload() })

    await waitFor(() => expect(result.current.after.get(`58:${coke.id}`)).toBe(20))
    // The `before` count (what was actually found) must not move.
    expect(result.current.before.get(`58:${coke.id}`)).toBe(0)

    const lines = await getCountLines(visit.id)
    const line = lines.find((l) => l.slotNumber === 58 && l.itemId === coke.id)
    expect(line?.after).toBe(20)
    expect(line?.filled).toBe(true)
  })

  it('leaves an unfilled slot alone when its capacity changes mid-count', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setBefore(58, coke.id, 3) })
    expect(result.current.after.get(`58:${coke.id}`)).toBe(3)

    await setSlotConfig(machine.id, 58, { capacity: 20, accepts: [coke.id] })
    await act(async () => { await result.current.reload() })

    // Not filled, so raising capacity must not silently top it up.
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
      before: 2, after: 8, touched: true, filled: true, price: 0, updatedAt: now(),
    })
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 59, itemId: coke.id,
      before: 1, after: 4, touched: true, filled: true, price: 0, updatedAt: now(),
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

  it('comes back toggled after remount when filled while already at capacity', async () => {
    const { coke, machine } = await seedWithHistory()
    const run = await createRun('2026-08-26')

    const first = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    // Slot 58's capacity is 8 (coke's basePar, no SlotConfig). Bring the
    // before-count to capacity by hand, then Fill — after stays 8, equal to
    // before, so `after > before` cannot tell this apart from an untouched
    // slot. This is exactly the case spec 1a exists to fix.
    await act(async () => { await first.result.current.setBefore(58, coke.id, 8) })
    await act(async () => { await first.result.current.toggleFill(58) })
    first.unmount()

    const second = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    expect(second.result.current.filled.has(58)).toBe(true)
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

/** Spec §3.1: slots that sold nothing need zero taps, so most of a machine is
 * walked past untouched. Recording only the touched ones leaves ~80% of every
 * machine with no row at all — Phase 2's sales residual has no opening or
 * closing level to work from, and a slow mover left untouched for four visits
 * falls out of the lookback window entirely, seeding 0 and RAN DRY on a slot
 * that is physically full. */
describe('useCounting recording the whole machine on finalize', () => {
  async function seedMachine() {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58, 59])
    await setPlacement(fanta.id, { kind: 'base' }, [52])
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    return { coke, fanta, sunkist, machine }
  }

  /** One visit, start to finish: open the screen, optionally work a row,
   * finalize, and leave — exactly what the operator does per machine. */
  async function visit(
    machineId: string,
    date: string,
    work?: (counting: ReturnType<typeof useCounting>) => Promise<void>,
  ) {
    const run = await createRun(date)
    // Opened up front so the test can read the visit's lines afterwards; the
    // hook reuses it rather than opening a second.
    const opened = await openVisit(run.id, machineId)
    const hook = renderHook(() => useCounting(run.id, machineId))
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    if (work) await act(async () => { await work(hook.result.current) })
    await act(async () => { await hook.result.current.finalize() })
    hook.unmount()
    return opened
  }

  const keyOf = (line: { slotNumber: number; itemId: string }) =>
    `${line.slotNumber}:${line.itemId}`

  it('records a line for every slot in the map, not only the touched one', async () => {
    const { coke, fanta, sunkist, machine } = await seedMachine()
    const run = await createRun('2026-08-26')
    const opened = await openVisit(run.id, machine.id)

    const hook = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    await act(async () => { await hook.result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await hook.result.current.finalize() })
    hook.unmount()

    const lines = await getCountLines(opened.id)
    // One row per slot/item pair — the mixed slot contributes one per item.
    expect(lines.map(keyOf).sort()).toEqual([
      `52:${fanta.id}`, `52:${sunkist.id}`, `58:${coke.id}`, `59:${coke.id}`,
    ].sort())
  })

  it('marks the untouched rows as untouched and the worked row as touched', async () => {
    const { coke, machine } = await seedMachine()
    const run = await createRun('2026-08-26')
    const opened = await openVisit(run.id, machine.id)

    const hook = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    await act(async () => { await hook.result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await hook.result.current.finalize() })
    hook.unmount()

    const lines = await getCountLines(opened.id)
    const byKey = new Map(lines.map((l) => [keyOf(l), l]))
    expect(byKey.get(`58:${coke.id}`)).toMatchObject({ touched: true, before: 3, after: 3 })
    expect(byKey.get(`59:${coke.id}`)?.touched).toBe(false)
    expect(byKey.get(`52:${coke.id}`)).toBeUndefined()
  })

  it('records the level that was on screen for an untouched slot, not zero', async () => {
    const { coke, machine } = await seedMachine()

    // Left at 7 last visit and walked past this time.
    await visit(machine.id, '2026-08-22', async (c) => {
      await c.setBefore(59, coke.id, 7)
    })

    const opened = await visit(machine.id, '2026-08-26')

    const line = (await getCountLines(opened.id)).find((l) => l.slotNumber === 59)
    expect(line).toMatchObject({ before: 7, after: 7, touched: false })
  })

  it('keeps a slow mover at its real level across more visits than the history window', async () => {
    const { coke, machine } = await seedMachine()

    await visit(machine.id, '2026-08-01', async (c) => {
      await c.setBefore(59, coke.id, 7)
    })
    // Five more visits, never touching slot 59 — more than HISTORY_LIMIT, so
    // the visit that last recorded 7 has fallen out of the lookback entirely.
    for (const day of ['02', '03', '04', '05', '06']) {
      await visit(machine.id, `2026-08-${day}`)
    }

    const run = await createRun('2026-08-07')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.before.get(`59:${coke.id}`)).toBe(7)
    expect(result.current.touched.has(`59:${coke.id}`)).toBe(false)
    expect(result.current.ranDry({ slotNumber: 59, capacity: 8, accepts: [coke.id] }))
      .toBe(false)
  })

  /** Strips `updatedAt` before comparing — finalize() re-stamps every line on
   * every call by design now (spec §7, amended), so exact line objects
   * differ across calls even when nothing else changed. What must not
   * differ is the row set and its content. */
  const withoutStamp = (lines: Awaited<ReturnType<typeof getCountLines>>) =>
    lines
      .map(({ updatedAt: _updatedAt, ...rest }) => rest)
      .sort((a, b) => a.slotNumber - b.slotNumber || a.itemId.localeCompare(b.itemId))

  it('re-finalizing without further edits does not throw or duplicate rows, and still re-stamps', async () => {
    let t = 1_700_000_000_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      t += 1000
      return t
    })

    const { coke, machine } = await seedMachine()
    const run = await createRun('2026-08-26')
    const opened = await openVisit(run.id, machine.id)

    const hook = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    await act(async () => { await hook.result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await hook.result.current.finalize() })

    const afterFirst = await getCountLines(opened.id)

    // Re-entering a finished machine is ordinary — you would do it to check
    // something — so a second tap on Finish must not throw, and per the
    // amendment it re-runs and re-stamps rather than being a dead button
    // (the bug the old status-based early return would reintroduce).
    await act(async () => {
      await expect(hook.result.current.finalize()).resolves.toBeUndefined()
    })
    hook.unmount()

    const afterSecond = await getCountLines(opened.id)
    expect(afterSecond).toHaveLength(afterFirst.length)
    expect(withoutStamp(afterSecond)).toEqual(withoutStamp(afterFirst))
    expect(afterSecond.every((l, i) => l.updatedAt > afterFirst[i].updatedAt)).toBe(true)

    clock.mockRestore()
  })

  it('re-finishing a reopened, already-finalized machine works and re-stamps, without duplicating rows', async () => {
    const { coke, machine } = await seedMachine()
    const run = await createRun('2026-08-26')
    const opened = await openVisit(run.id, machine.id)

    const first = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await act(async () => { await first.result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await first.result.current.finalize() })
    first.unmount()

    const recorded = await getCountLines(opened.id)

    // Walking back into the machine: openVisit hands back the finalized visit
    // unchanged, and Finish must still work — re-stamping, not silently
    // no-op'ing forever (the old dead-button bug the early return fixed for
    // the wrong reason).
    const second = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    await act(async () => {
      await expect(second.result.current.finalize()).resolves.toBeUndefined()
    })
    second.unmount()

    const rewritten = await getCountLines(opened.id)
    expect(rewritten).toHaveLength(recorded.length)
    expect(withoutStamp(rewritten)).toEqual(withoutStamp(recorded))
  })

  it('persists an edit made after finalize, and re-finishing afterwards records it and re-stamps', async () => {
    let t = 1_700_000_000_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      t += 1000
      return t
    })

    const { coke, machine } = await seedMachine()
    const run = await createRun('2026-08-26')
    const opened = await openVisit(run.id, machine.id)

    const hook = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    await act(async () => { await hook.result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await hook.result.current.finalize() })
    const firstFinalizedAt = (await openVisit(run.id, machine.id)).finalizedAt

    // The miscount-correction scenario from the operator's device test:
    // finish, notice a miscount, correct it, finish again.
    await act(async () => { await hook.result.current.setBefore(58, coke.id, 5) })
    await act(async () => { await hook.result.current.finalize() })
    hook.unmount()

    const lines = await getCountLines(opened.id)
    const line58 = lines.find((l) => l.slotNumber === 58 && l.itemId === coke.id)
    expect(line58?.before).toBe(5)
    expect(line58?.after).toBe(5)

    const secondFinalizedAt = (await openVisit(run.id, machine.id)).finalizedAt
    expect(secondFinalizedAt).toBeGreaterThan(firstFinalizedAt ?? 0)

    clock.mockRestore()
  })

  it('records a filled slot at capacity for every item in it', async () => {
    const { fanta, sunkist, machine } = await seedMachine()
    const run = await createRun('2026-08-26')
    const opened = await openVisit(run.id, machine.id)

    const hook = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    await act(async () => { await hook.result.current.toggleFill(52) })
    await act(async () => { await hook.result.current.finalize() })
    hook.unmount()

    const lines = (await getCountLines(opened.id)).filter((l) => l.slotNumber === 52)
    expect(lines).toHaveLength(2)
    const total = lines.reduce((sum, l) => sum + l.after, 0)
    expect(total).toBe(5)
    expect(lines.map((l) => l.itemId).sort()).toEqual([fanta.id, sunkist.id].sort())
  })
})

describe('the price snapshot', () => {
  it('records the price in force when the slot was counted', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setBefore(58, coke.id, 3)
    })

    const [line] = await getCountLines(visit.id)
    expect(line.price).toBe(4.5)
  })

  it('records the price on every line at finalize, not just the touched ones', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const chips = await saveItem({ name: 'Chips', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    await setPlacement(chips.id, { kind: 'base' }, [12])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.finalize()
    })

    const lines = await getCountLines(visit.id)
    const byItem = new Map(lines.map((l) => [l.itemId, l.price]))
    expect(byItem.get(coke.id)).toBe(4.5)
    expect(byItem.get(chips.id)).toBe(3.5)
  })

  // The whole point of the snapshot (design §3.6): a price change must not
  // reach backwards.
  it('leaves an already-recorded line at its original price when the item is repriced', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.setBefore(58, coke.id, 3)
    })

    await saveItem({ id: coke.id, name: 'Coke', price: 5, basePar: 5, boxSize: 24 })

    const [line] = await getCountLines(visit.id)
    expect(line.price).toBe(4.5)
  })

  // The third write site: the capacity-change rewrite inside the seeding
  // effect (see "recomputes a filled slot's after when its capacity changes
  // mid-count" above). It stamps a line too, off the same items map.
  it('records the price on a line rewritten by a mid-count capacity change', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.toggleFill(58) })

    await setSlotConfig(machine.id, 58, { capacity: 20, accepts: [coke.id] })
    await act(async () => { await result.current.reload() })
    await waitFor(() => expect(result.current.after.get(`58:${coke.id}`)).toBe(20))

    const lines = await getCountLines(visit.id)
    const line = lines.find((l) => l.slotNumber === 58 && l.itemId === coke.id)
    expect(line?.price).toBe(4.5)
  })
})

describe('the editable after-count', () => {
  it('records a partial refill, above the before-count but below capacity', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setBefore(58, coke.id, 4) })
    await act(async () => { await result.current.setAfter(58, coke.id, 8) })

    const [line] = await getCountLines(visit.id)
    expect(line.before).toBe(4)
    expect(line.after).toBe(8)
  })

  // Redistribution: stock taken out of this machine for another one.
  it('allows an after-count below the before-count', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setBefore(58, coke.id, 9) })
    await act(async () => { await result.current.setAfter(58, coke.id, 5) })

    const [line] = await getCountLines(visit.id)
    expect(line.after).toBe(5)
  })

  it('never records a negative after-count', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setAfter(58, coke.id, -3) })

    const [line] = await getCountLines(visit.id)
    expect(line.after).toBe(0)
  })

  // Rule 3. Without it, entering the after-count before the before-count
  // silently discards the after-count.
  it('keeps a hand-entered after-count when the before-count changes afterwards', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setAfter(58, coke.id, 8) })
    await act(async () => { await result.current.setBefore(58, coke.id, 3) })

    const [line] = await getCountLines(visit.id)
    expect(line.before).toBe(3)
    expect(line.after).toBe(8)
  })

  // Rule 2. The green Fill button must stop claiming a slot was topped to
  // capacity once the operator has said otherwise.
  it('turns Fill off when the after-count is entered by hand', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.toggleFill(58) })
    expect(result.current.filled.has(58)).toBe(true)

    await act(async () => { await result.current.setAfter(58, coke.id, 7) })

    expect(result.current.filled.has(58)).toBe(false)
    const [line] = await getCountLines(visit.id)
    expect(line.after).toBe(7)
    expect(line.filled).toBe(false)
  })

  // Rule 4. Fill is how a hand-entered figure is undone.
  it('restores the derived after-count when Fill is tapped again', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setAfter(58, coke.id, 7) })
    await act(async () => { await result.current.toggleFill(58) })

    const [line] = await getCountLines(visit.id)
    expect(line.after).toBe(10)

    // And the before-count now drives it again.
    await act(async () => { await result.current.setBefore(58, coke.id, 2) })
    const [again] = await getCountLines(visit.id)
    expect(again.after).toBe(10)
  })

  // Rule 5.
  it('treats a resumed draft\'s hand-entered after-count as still hand-entered', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: 58, itemId: coke.id,
      before: 3, after: 8, touched: true, filled: false, price: 4.5, updatedAt: now(),
    })

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setBefore(58, coke.id, 5) })

    const [line] = await getCountLines(visit.id)
    expect(line.after).toBe(8)
  })

  it('gives each item of a mixed slot its own after-count', async () => {
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(fanta.id, { kind: 'base' }, [52])
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setAfter(52, fanta.id, 2) })
    await act(async () => { await result.current.setAfter(52, sunkist.id, 3) })

    const lines = await getCountLines(visit.id)
    const byItem = new Map(lines.map((l) => [l.itemId, l.after]))
    expect(byItem.get(fanta.id)).toBe(2)
    expect(byItem.get(sunkist.id)).toBe(3)
  })
  // C1. `CountLine.filled` is documented as a slot-level fact — "shared by
  // every line of the slot" — so a hand-entered after-count has to clear it
  // for every line, not only for the item that was typed. A sibling left
  // saying `filled: true` puts the slot back into `filled` on the next
  // screen entry, and the seeding effect's recompute then tops the
  // hand-entered figure back to capacity and persists it. That number is the
  // next period's opening, so the phantom sales compound every period after.
  it('keeps a hand-entered after-count in a mixed filled slot across a reload, per key', async () => {
    const { fanta, sunkist, machine } = await seedMixed()
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const first = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(first.result.current.loading).toBe(false))

    await act(async () => { await first.result.current.toggleFill(52) })
    await act(async () => { await first.result.current.setAfter(52, fanta.id, 3) })

    // Fill is off for the slot, so it must be off on every line of the slot.
    const afterEdit = await getCountLines(visit.id)
    expect(afterEdit.map((l) => l.filled)).toEqual([false, false])

    first.unmount()

    // Back on the machine, then anything that calls reload() — saving from
    // the `⋯` sheet does — refires the seeding effect and its recompute.
    const second = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.filled.has(52)).toBe(false)

    await act(async () => { await second.result.current.reload() })

    const lines = await getCountLines(visit.id)
    const byItem = new Map(lines.map((l) => [l.itemId, l.after]))
    expect(byItem.get(fanta.id)).toBe(3)
    expect(byItem.get(sunkist.id)).toBe(0)
    expect(second.result.current.after.get(`52:${fanta.id}`)).toBe(3)
  })

  // The same rule from the other side, for rows already on disk: these are
  // exactly the lines the pre-fix build wrote — one hand-entered line with
  // Fill cleared, beside a sibling whose `filled: true` was never updated.
  // Reading them puts the slot back into `filled`, so the recompute runs;
  // it must still leave the hand-entered figure alone, the way `setBefore`
  // already does.
  it('does not re-derive a hand-entered after-count when a stale sibling row still claims the slot was filled', async () => {
    const { fanta, sunkist, machine } = await seedMixed()
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    // Fanta is the preferred item (alphabetical), so it is the one the
    // recompute tops up — which makes "the recompute ran" observable.
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: 52, itemId: fanta.id,
      before: 0, after: 0, touched: true, filled: true, price: 3.5, updatedAt: now(),
    })
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: 52, itemId: sunkist.id,
      before: 0, after: 2, touched: true, filled: false, price: 3.5, updatedAt: now(),
    })

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.filled.has(52)).toBe(true)

    await act(async () => { await result.current.reload() })

    // The recompute did run — Fanta went to capacity …
    await waitFor(() => expect(result.current.after.get(`52:${fanta.id}`)).toBe(5))
    // … and left the hand-entered figure beside it untouched, on disk.
    const lines = await getCountLines(visit.id)
    const byItem = new Map(lines.map((l) => [l.itemId, l.after]))
    expect(byItem.get(sunkist.id)).toBe(2)
    expect(result.current.after.get(`52:${sunkist.id}`)).toBe(2)
  })

  it('fills every named slot to capacity in one batch, and leaves the rest alone', async () => {
    const { chips, machine } = await seedTray()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.fillTray([10, 11]) })

    expect(result.current.filled.has(10)).toBe(true)
    expect(result.current.filled.has(11)).toBe(true)
    expect(result.current.filled.has(12)).toBe(false)
    expect(result.current.after.get(`10:${chips.id}`)).toBe(5)
  })

  it('leaves an already-filled slot filled rather than toggling it off', async () => {
    const { machine } = await seedTray()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.toggleFill(10) })
    await act(async () => { await result.current.fillTray([10, 11]) })
    expect(result.current.filled.has(10)).toBe(true)
  })

  // Fix 2, 2026-08-28 whole-branch review: inverts the assertion above. The
  // original test asserted that fillTray overwrites a hand-entered
  // after-count to capacity ("Fill is a default, not a verdict — but
  // fillTray is an explicit request, so it does set the slot"). That
  // direction was wrong: a part-refill typed by hand (the operator ran out
  // on the trolley, typed the true figure, then tapped the tray footer to
  // finish the rest) was being silently rewritten to capacity, persisted,
  // and its Rule 3 protection permanently cleared — booking phantom sales
  // next period. Per-slot Fill in the `⋯` sheet remains the explicit way to
  // override a typed figure (§3.6).
  it('leaves a hand-entered after-count alone when tray-filling, and fills its untouched neighbour', async () => {
    const { chips, gum, machine } = await seedTray()
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setAfter(10, chips.id, 3) })
    await act(async () => { await result.current.fillTray([10, 11]) })

    // The typed figure on slot 10 survives untouched.
    expect(result.current.after.get(`10:${chips.id}`)).toBe(3)
    expect(result.current.filled.has(10)).toBe(false)

    // Its untouched neighbour goes to capacity as normal.
    expect(result.current.after.get(`11:${gum.id}`)).toBe(5)
    expect(result.current.filled.has(11)).toBe(true)

    const lines = await getCountLines(visit.id)
    const bySlot = new Map(lines.map((l) => [l.slotNumber, l]))
    expect(bySlot.get(10)).toMatchObject({ after: 3, filled: false })
    expect(bySlot.get(11)).toMatchObject({ after: 5, filled: true })
  })

  // Fix 1, 2026-08-28 whole-branch review: fillTray copied toggleFill's rule
  // of adding every filled key to `touched`, which is right for a per-slot
  // tap ("you tapped Fill on THIS slot, so you looked at it") and wrong
  // generalised to a whole tray — one footer tap would claim the operator
  // observed every slot in the tray. That both paints the ran-dry edge on
  // slots with no prior recorded level (the exact suppression that must not
  // change) and persists a false "counted and found empty" for a slot
  // nobody looked at.
  it('does not mark a tray-filled slot touched, and does not flag it ran dry', async () => {
    const { chips, machine } = await seedTray()
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const slot = result.current.map.find((s) => s.slotNumber === 10)!
    await act(async () => { await result.current.fillTray([10]) })

    expect(result.current.filled.has(10)).toBe(true)
    expect(result.current.touched.has(`10:${chips.id}`)).toBe(false)
    expect(result.current.ranDry(slot)).toBe(false)

    const lines = await getCountLines(visit.id)
    expect(lines.find((l) => l.slotNumber === 10)?.touched).toBe(false)
  })

  // The same rule, one screen event later. The seeding effect's capacity
  // recompute is the third Fill write site, and it was written (1bc556e)
  // when both Fill paths still added their keys to `touched`, so it asserts
  // `touched: true` for every line it rewrites. Fix 1 changed what a tray
  // fill means and never reached here — so a `reload()`, which saving
  // anything from a slot's `⋯` sheet performs, re-marked the whole filled
  // tray touched and put the ran-dry edge back on slots nobody counted.
  // A capacity correction is not an observation.
  it('does not mark a tray-filled slot touched when the capacity recompute rewrites it', async () => {
    const { chips, machine } = await seedTray()
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.fillTray([10]) })
    expect(result.current.touched.has(`10:${chips.id}`)).toBe(false)

    // Saving capacity from the `⋯` sheet: the config changes and reload()
    // gives `map` a new identity, re-firing the effect with 10 in `filled`.
    await setSlotConfig(machine.id, 10, { capacity: 20, accepts: [chips.id] })
    await act(async () => { await result.current.reload() })

    // The recompute did run — the fill followed capacity up …
    await waitFor(() => expect(result.current.after.get(`10:${chips.id}`)).toBe(20))

    // … without claiming anybody looked at the slot.
    const slot = result.current.map.find((s) => s.slotNumber === 10)!
    expect(result.current.touched.has(`10:${chips.id}`)).toBe(false)
    expect(result.current.ranDry(slot)).toBe(false)

    const lines = await getCountLines(visit.id)
    expect(lines.find((l) => l.slotNumber === 10)?.touched).toBe(false)
  })
})
