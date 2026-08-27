import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db'
import { listItems } from './items'
import { listMachines, saveMachine } from './machines'
import { listPlacements } from './placements'
import { listSlotConfigs } from './slotConfigs'
import { resolveMachineMap } from '../../domain/placement'
import { seedStarterCatalogue } from './seed'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('seedStarterCatalogue', () => {
  it('creates all 60 items, each with par 5 and box size 1', async () => {
    await seedStarterCatalogue()

    const items = await listItems()
    expect(items).toHaveLength(60)
    for (const item of items) {
      expect(item.basePar).toBe(5)
      expect(item.boxSize).toBe(1)
    }
  })

  it('creates fifteen machines, L2 through L16', async () => {
    await seedStarterCatalogue()

    const machines = await listMachines()
    expect(machines).toHaveLength(15)
    expect(machines.map((m) => m.level)).toEqual(
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    )
  })

  it('places every item so a machine resolves to the full 55-slot map with no SlotConfig pinning', async () => {
    await seedStarterCatalogue()

    const [items, placements, machines, configs] = await Promise.all([
      listItems(), listPlacements(), listMachines(), listSlotConfigs(),
    ])
    expect(configs).toEqual([])

    const map = resolveMachineMap(machines[0].id, items, placements, [])
    expect(map).toHaveLength(55)
    for (const slot of map) expect(slot.capacity).toBe(5)
  })

  it('resolves mixed slot 63 to three items and slot 52 to Sunkist and Fanta', async () => {
    await seedStarterCatalogue()

    const [items, placements, machines] = await Promise.all([
      listItems(), listPlacements(), listMachines(),
    ])
    const map = resolveMachineMap(machines[0].id, items, placements, [])
    const byId = new Map(items.map((i) => [i.id, i]))

    const slot63 = map.find((s) => s.slotNumber === 63)
    expect(slot63?.accepts).toHaveLength(3)

    const slot52Names = map
      .find((s) => s.slotNumber === 52)!
      .accepts.map((id) => byId.get(id)?.name)
      .sort()
    expect(slot52Names).toEqual(['Fanta', 'Sunkist'])
  })

  it('carries the size through to the persisted item', async () => {
    await seedStarterCatalogue()

    const items = await listItems()
    const coke = items.find((i) => i.name === 'Coke')
    expect(coke?.size).toBe('375ml')
    const redBull = items.find((i) => i.name === 'Red Bull Energy Drink')
    expect(redBull?.size).toBe('600ml')
  })

  it('is a no-op the second time — safe even if reachable outside the UI gate', async () => {
    await seedStarterCatalogue()
    const second = await seedStarterCatalogue()

    expect(second).toBe(false)
    expect(await listItems()).toHaveLength(60)
    expect(await listMachines()).toHaveLength(15)
    expect(await listPlacements()).toHaveLength(60)
  })

  // Review defect #1: two overlapping calls (a double-tap on a button that
  // stays enabled through ~135 writes) must not both see an empty catalogue.
  // The emptiness check and every write have to share one transaction so
  // IndexedDB serializes the two attempts instead of interleaving them.
  it('is safe against two overlapping calls: only one full seed ever lands', async () => {
    const [a, b] = await Promise.all([seedStarterCatalogue(), seedStarterCatalogue()])

    expect([a, b].sort()).toEqual([false, true])
    expect(await listItems()).toHaveLength(60)
    expect(await listMachines()).toHaveLength(15)
    expect(await listPlacements()).toHaveLength(60)
  })

  // Review defect #2: the gate checked only `listItems`, so an operator who
  // adds a machine by hand before ever touching Items — the natural first
  // screen per App.tsx — got a second, duplicate machine per level.
  it('does not reseed when a machine already exists, even with an empty catalogue', async () => {
    await saveMachine({ level: 2, label: 'L2' })

    const result = await seedStarterCatalogue()

    expect(result).toBe(false)
    expect(await listItems()).toHaveLength(0)
    expect(await listMachines()).toHaveLength(1)
  })

  // Review defect #3: three separate transactions meant a crash between
  // batches left items with no placements, and — because items then existed
  // — the gate returned `false` forever after, with no in-app way to finish
  // or clear it. One transaction means a failure partway rolls everything
  // back, so the catalogue is empty again and a retry can succeed cleanly.
  it('rolls back the whole seed if a write partway through fails, and the gate is not left stuck', async () => {
    const realPut = db.placements.put.bind(db.placements)
    let calls = 0
    const spy = vi.spyOn(db.placements, 'put').mockImplementation((record: unknown) => {
      calls += 1
      if (calls === 30) throw new Error('simulated write failure')
      return realPut(record as never)
    })

    await expect(seedStarterCatalogue()).rejects.toThrow('simulated write failure')
    spy.mockRestore()

    expect(await listItems()).toHaveLength(0)
    expect(await listMachines()).toHaveLength(0)
    expect(await listPlacements()).toHaveLength(0)

    const retry = await seedStarterCatalogue()
    expect(retry).toBe(true)
    expect(await listItems()).toHaveLength(60)
    expect(await listMachines()).toHaveLength(15)
    expect(await listPlacements()).toHaveLength(60)
  })
})
