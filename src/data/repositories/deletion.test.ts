import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db'
import { getItem, saveItem, deleteItem } from './items'
import { saveMachine } from './machines'
import { listPlacements, setPlacement } from './placements'
import { listSlotConfigs, setSlotConfig } from './slotConfigs'
import { getStoreroomBalance, setStoreroomBalance } from './storeroom'
import { createRun } from './runs'
import { openVisit, getCountLines, putCountLine, finalizeVisit } from './visits'
import { newId, now } from '../../domain/ids'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('deleteItem', () => {
  it('removes the item itself', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await deleteItem(coke.id)
    expect(await getItem(coke.id)).toBeUndefined()
  })

  it('removes both the base and every machine-scoped placement for the item', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [58, 59])
    await setPlacement(coke.id, { kind: 'machine', machineId: 'L5' }, [57])

    await deleteItem(coke.id)

    expect(await listPlacements()).toEqual([])
  })

  it('leaves other items\' placements alone', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    await setPlacement(fanta.id, { kind: 'base' }, [52])

    await deleteItem(coke.id)

    const remaining = await listPlacements()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].itemId).toBe(fanta.id)
  })

  it('strips the item out of any SlotConfig.accepts list, without deleting the slot config', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    await setSlotConfig('L7', 52, { capacity: 5, accepts: [coke.id, sunkist.id] })

    await deleteItem(coke.id)

    const configs = await listSlotConfigs()
    expect(configs).toHaveLength(1)
    expect(configs[0].accepts).toEqual([sunkist.id])
  })

  it('removes the item\'s storeroom balance', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setStoreroomBalance(coke.id, 40)

    await deleteItem(coke.id)

    expect(await getStoreroomBalance(coke.id)).toBeUndefined()
  })

  // The historical-record decision: a finalized CountLine is the immutable
  // record spec §7 promises ("later corrections are Adjustment records,
  // never edits to history") and Phase 2's sales reconciliation reads it.
  // Deleting an item from the catalogue must not rewrite what it actually
  // sold in the past — so the CountLine survives, unchanged, dangling itemId
  // and all. This test pins that decision.
  it('does NOT touch historical CountLine rows — a deleted item\'s past counts survive', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-22')
    const visit = await openVisit(run.id, machine.id)
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: 58, itemId: coke.id,
      before: 2, after: 6, touched: true, filled: true, updatedAt: now(),
    })
    await finalizeVisit(visit.id)

    await deleteItem(coke.id)

    const lines = await getCountLines(visit.id)
    expect(lines).toHaveLength(1)
    expect(lines[0].itemId).toBe(coke.id)
    expect(lines[0].after).toBe(6)
  })

  it('is atomic: a failure partway through leaves nothing removed', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    await setSlotConfig('L7', 58, { capacity: 8, accepts: [coke.id] })
    await setStoreroomBalance(coke.id, 40)

    // storeroomBalances is the last table touched by deleteItem — forcing a
    // failure there proves the earlier deletes (items, placements,
    // slotConfigs) in the same transaction get rolled back too.
    const spy = vi.spyOn(db.storeroomBalances, 'where').mockImplementation(() => {
      throw new Error('simulated write failure')
    })

    await expect(deleteItem(coke.id)).rejects.toThrow('simulated write failure')
    spy.mockRestore()

    expect(await getItem(coke.id)).toEqual(coke)
    expect(await listPlacements()).toHaveLength(1)
    const configs = await listSlotConfigs()
    expect(configs).toHaveLength(1)
    expect(configs[0].accepts).toEqual([coke.id])
    expect(await getStoreroomBalance(coke.id)).toMatchObject({ units: 40 })
  })
})

// `deleteMachine` was removed 2026-08-27 (see machines.ts) as an operator
// decision after the first device test — the fifteen-machine roster is
// fixed, created once by the seed, and the UI delete affordance sat next to
// the "start count" tap target with no undo. Its cascade-delete tests were
// removed with it rather than left green over dead code.
