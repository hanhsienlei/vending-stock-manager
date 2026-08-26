import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { listItems, getItem, saveItem, deleteItem } from './items'
import { listMachines, saveMachine } from './machines'
import { listPlacements, setPlacement } from './placements'
import { listSlotConfigs, setSlotConfig } from './slotConfigs'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('items', () => {
  it('saves with a generated id and updatedAt', async () => {
    const saved = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    expect(saved.id).toBeTruthy()
    expect(saved.updatedAt).toBeGreaterThan(0)
    expect(await getItem(saved.id)).toEqual(saved)
  })

  it('updates in place when an id is supplied', async () => {
    const saved = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await saveItem({ id: saved.id, name: 'Coke', price: 5, basePar: 8, boxSize: 24 })
    const all = await listItems()
    expect(all).toHaveLength(1)
    expect(all[0].price).toBe(5)
  })

  it('deletes', async () => {
    const saved = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await deleteItem(saved.id)
    expect(await listItems()).toEqual([])
  })
})

describe('machines', () => {
  it('lists ascending by level', async () => {
    await saveMachine({ label: 'Lift lobby', level: 12 })
    await saveMachine({ label: 'Pool corridor', level: 3 })
    expect((await listMachines()).map((m) => m.level)).toEqual([3, 12])
  })
})

describe('placements', () => {
  it('keeps one base placement per item', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [58, 59])
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const all = await listPlacements()
    expect(all).toHaveLength(1)
    expect(all[0].slots).toEqual([58])
  })

  it('keeps base and machine placements side by side', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [58, 59])
    await setPlacement(coke.id, { kind: 'machine', machineId: 'L5' }, [57])
    expect(await listPlacements()).toHaveLength(2)
  })

  it('stores an empty slot list as not stocked', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'machine', machineId: 'L9' }, [])
    const all = await listPlacements()
    expect(all[0].slots).toEqual([])
  })
})

describe('slotConfigs', () => {
  it('upserts on machine and slot number', async () => {
    await setSlotConfig('L7', 52, { capacity: 5 })
    await setSlotConfig('L7', 52, { accepts: ['sunkist', 'fanta'] })
    const all = await listSlotConfigs()
    expect(all).toHaveLength(1)
    expect(all[0].capacity).toBe(5)
    expect(all[0].accepts).toEqual(['sunkist', 'fanta'])
  })
})
