import { describe, it, expect } from 'vitest'
import { effectivePlacement, resolveMachineMap } from './placement'
import type { Item, ItemPlacement, SlotConfig } from './types'

const item = (id: string, name: string, basePar: number): Item => ({
  id, name, price: 4.5, basePar, boxSize: 24, updatedAt: 1,
})

const base = (id: string, itemId: string, slots: number[]): ItemPlacement => ({
  id, itemId, scope: { kind: 'base' }, slots, updatedAt: 1,
})

const forMachine = (
  id: string, itemId: string, machineId: string, slots: number[],
): ItemPlacement => ({
  id, itemId, scope: { kind: 'machine', machineId }, slots, updatedAt: 1,
})

const coke = item('coke', 'Coke', 8)
const sunkist = item('sunkist', 'Sunkist', 5)
const fanta = item('fanta', 'Fanta', 5)

describe('effectivePlacement', () => {
  it('falls back to the base placement', () => {
    const placements = [base('p1', 'coke', [58, 59])]
    expect(effectivePlacement('coke', 'L7', placements)?.slots).toEqual([58, 59])
  })

  it('prefers a machine-scoped placement over the base', () => {
    const placements = [base('p1', 'coke', [58, 59]), forMachine('p2', 'coke', 'L5', [57])]
    expect(effectivePlacement('coke', 'L5', placements)?.slots).toEqual([57])
    expect(effectivePlacement('coke', 'L7', placements)?.slots).toEqual([58, 59])
  })

  it('returns undefined when the item has no placement at all', () => {
    expect(effectivePlacement('coke', 'L7', [])).toBeUndefined()
  })
})

describe('resolveMachineMap', () => {
  it('places a base item into its slots', () => {
    const map = resolveMachineMap('L7', [coke], [base('p1', 'coke', [58, 59])], [])
    expect(map).toEqual([
      { slotNumber: 58, capacity: 8, accepts: ['coke'] },
      { slotNumber: 59, capacity: 8, accepts: ['coke'] },
    ])
  })

  it('honours a machine override', () => {
    const placements = [base('p1', 'coke', [58, 59]), forMachine('p2', 'coke', 'L5', [57])]
    const map = resolveMachineMap('L5', [coke], placements, [])
    expect(map.map((s) => s.slotNumber)).toEqual([57])
  })

  it('treats an empty slot list as not stocked, suppressing the base', () => {
    const placements = [base('p1', 'coke', [58, 59]), forMachine('p2', 'coke', 'L9', [])]
    expect(resolveMachineMap('L9', [coke], placements, [])).toEqual([])
  })

  it('groups several items into one shared slot', () => {
    const placements = [base('p1', 'sunkist', [52]), base('p2', 'fanta', [52])]
    const map = resolveMachineMap('L7', [sunkist, fanta], placements, [])
    expect(map).toHaveLength(1)
    expect(map[0].accepts.sort()).toEqual(['fanta', 'sunkist'])
  })

  it('orders accepts by SlotConfig preference, appending unlisted items by name', () => {
    const placements = [
      base('p1', 'sunkist', [52]), base('p2', 'fanta', [52]), base('p3', 'coke', [52]),
    ]
    const configs: SlotConfig[] = [{
      id: 'c1', machineId: 'L7', slotNumber: 52, capacity: 5,
      accepts: ['sunkist'], updatedAt: 1,
    }]
    const map = resolveMachineMap('L7', [sunkist, fanta, coke], placements, configs)
    // 'sunkist' is listed first; 'Coke' then 'Fanta' follow, sorted by name
    expect(map[0].accepts).toEqual(['sunkist', 'coke', 'fanta'])
  })

  it('uses SlotConfig capacity when present', () => {
    const configs: SlotConfig[] = [{
      id: 'c1', machineId: 'L12', slotNumber: 58, capacity: 14,
      accepts: ['coke'], updatedAt: 1,
    }]
    const map = resolveMachineMap('L12', [coke], [base('p1', 'coke', [58])], configs)
    expect(map[0].capacity).toBe(14)
  })

  it('seeds capacity from the first accepted item basePar when unconfigured', () => {
    const map = resolveMachineMap('L7', [sunkist], [base('p1', 'sunkist', [52])], [])
    expect(map[0].capacity).toBe(5)
  })

  it('returns slots ascending by slot number', () => {
    const placements = [
      base('p1', 'coke', [58]), base('p2', 'sunkist', [52]), base('p3', 'fanta', [35]),
    ]
    const map = resolveMachineMap('L7', [coke, sunkist, fanta], placements, [])
    expect(map.map((s) => s.slotNumber)).toEqual([35, 52, 58])
  })

  it('ignores placements for items missing from the catalogue', () => {
    const map = resolveMachineMap('L7', [], [base('p1', 'ghost', [58])], [])
    expect(map).toEqual([])
  })

  // Regression: deleting an item can leave a SlotConfig.accepts preference
  // list carrying its old id (e.g. data written before delete started
  // cleaning it up, or a config the delete's cleanup hasn't reached). The
  // counting screen must not crash resolving a mixed slot in that state — it
  // must simply resolve to the items that still exist.
  it('tolerates a stale itemId left over in SlotConfig.accepts', () => {
    const placements = [base('p1', 'coke', [52])]
    const configs: SlotConfig[] = [{
      id: 'c1', machineId: 'L7', slotNumber: 52, capacity: 5,
      accepts: ['ghost', 'coke'], updatedAt: 1,
    }]
    const map = resolveMachineMap('L7', [coke], placements, configs)
    expect(map).toHaveLength(1)
    expect(map[0].accepts).toEqual(['coke'])
  })
})
