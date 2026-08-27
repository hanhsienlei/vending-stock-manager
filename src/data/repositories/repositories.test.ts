import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { listItems, getItem, saveItem, deleteItem } from './items'
import { listMachines, saveMachine } from './machines'
import { listPlacements, setPlacement } from './placements'
import { listSlotConfigs, setSlotConfig } from './slotConfigs'
import { listStoreroomBalances, setStoreroomBalance } from './storeroom'

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

  it('throws when creating a new config without a capacity', async () => {
    await expect(
      setSlotConfig('L7', 52, { accepts: ['sunkist', 'fanta'] }),
    ).rejects.toThrow(/capacity/)
    expect(await listSlotConfigs()).toEqual([])
  })

  it('preserves stored capacity when patching accepts on an existing config', async () => {
    await setSlotConfig('L7', 52, { capacity: 5 })
    await setSlotConfig('L7', 52, { accepts: ['sunkist', 'fanta'] })
    const all = await listSlotConfigs()
    expect(all).toHaveLength(1)
    expect(all[0].capacity).toBe(5)
    expect(all[0].accepts).toEqual(['sunkist', 'fanta'])
  })
})

describe('storeroomBalances', () => {
  it('saves with a generated id, updatedAt and verifiedAt', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const saved = await setStoreroomBalance(coke.id, 40)
    expect(saved.id).toBeTruthy()
    expect(saved.itemId).toBe(coke.id)
    expect(saved.units).toBe(40)
    expect(saved.updatedAt).toBeGreaterThan(0)
    expect(saved.verifiedAt).toBeGreaterThan(0)
  })

  it('updates the same row in place rather than creating a second one for the item', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const first = await setStoreroomBalance(coke.id, 40)
    const second = await setStoreroomBalance(coke.id, 35)

    expect(second.id).toBe(first.id)
    const all = await listStoreroomBalances()
    expect(all).toHaveLength(1)
    expect(all[0].units).toBe(35)
  })

  it('keeps balances for different items separate', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    await setStoreroomBalance(coke.id, 40)
    await setStoreroomBalance(fanta.id, 12)

    const all = await listStoreroomBalances()
    expect(all).toHaveLength(2)
  })
})
