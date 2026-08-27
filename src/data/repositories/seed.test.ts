import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { listItems } from './items'
import { listMachines } from './machines'
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

  it('is a no-op the second time — safe even if reachable outside the UI gate', async () => {
    await seedStarterCatalogue()
    const second = await seedStarterCatalogue()

    expect(second).toBe(false)
    expect(await listItems()).toHaveLength(60)
    expect(await listMachines()).toHaveLength(15)
    expect(await listPlacements()).toHaveLength(60)
  })
})
