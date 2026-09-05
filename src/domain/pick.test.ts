import { describe, it, expect } from 'vitest'
import { buildPickList, slotKey } from './pick'
import type { PickInput } from './pick'
import { slotNeed } from './forecast'
import type { SlotNeed } from './forecast'

const need = (
  machineId: string, slotNumber: number, capacity: number, lastLevel: number,
  over: Partial<Parameters<typeof slotNeed>[0]> = {},
): SlotNeed => slotNeed({
  machineId, slotNumber, capacity, lastLevel,
  rate: null, daysSince: 3, ranDryLastPeriod: false,
  ...over,
})

const input = (over: Partial<PickInput> = {}): PickInput => ({
  needs: [],
  accepts: new Map(),
  outOfStock: new Set(),
  unmovedSlots: new Set(),
  levelOf: new Map([['L7', 7], ['L8', 8], ['L12', 12]]),
  ...over,
})

const lineFor = (list: ReturnType<typeof buildPickList>, itemId: string) =>
  list.lines.find((l) => l.itemId === itemId)

describe('buildPickList', () => {
  it('resolves a slot to the first accepted item that is in stock', () => {
    const list = buildPickList(input({
      needs: [need('L7', 52, 10, 4)],
      accepts: new Map([[slotKey('L7', 52), ['coke', 'fanta']]]),
    }))

    expect(list.lines).toHaveLength(1)
    expect(lineFor(list, 'coke')?.needed).toBe(6)
    expect(lineFor(list, 'coke')?.slots).toEqual([
      { machineId: 'L7', slotNumber: 52, itemId: 'coke', units: 6 },
    ])
  })

  it('falls to the second accepted item when the first is out', () => {
    const list = buildPickList(input({
      needs: [need('L7', 52, 10, 4)],
      accepts: new Map([[slotKey('L7', 52), ['coke', 'fanta']]]),
      outOfStock: new Set(['coke']),
    }))

    expect(lineFor(list, 'coke')).toBeUndefined()
    expect(lineFor(list, 'fanta')?.needed).toBe(6)
  })

  it('lists a need as unfulfillable when every accepted item is out', () => {
    const list = buildPickList(input({
      needs: [need('L7', 52, 10, 4)],
      accepts: new Map([[slotKey('L7', 52), ['coke', 'fanta']]]),
      outOfStock: new Set(['coke', 'fanta']),
    }))

    expect(list.unfulfillable).toHaveLength(1)
    expect(list.unfulfillable[0].slotNumber).toBe(52)
    expect(list.lines).toEqual([])
  })

  it('lists a need as unfulfillable when the slot accepts nothing at all', () => {
    const list = buildPickList(input({ needs: [need('L7', 52, 10, 4)] }))

    expect(list.unfulfillable).toHaveLength(1)
    expect(list.lines).toEqual([])
  })

  it('aggregates the same item across machines into one line', () => {
    const accepts = new Map<string, string[]>()
    const needs: SlotNeed[] = []
    for (const [machineId, slotNumber, lastLevel] of [
      ['L7', 52, 6], ['L7', 53, 7], ['L8', 52, 8], ['L12', 41, 5], ['L12', 42, 4],
    ] as const) {
      needs.push(need(machineId, slotNumber, 10, lastLevel))
      accepts.set(slotKey(machineId, slotNumber), ['coke'])
    }

    const list = buildPickList(input({ needs, accepts }))

    // 4 + 3 + 2 + 5 + 6
    expect(lineFor(list, 'coke')?.needed).toBe(20)
    expect(lineFor(list, 'coke')?.slots).toHaveLength(5)
  })

  // The important test, and it is testing a REFUSAL. Design §3.7: a pick list
  // that has already rationed against a wrong estimate disagrees with what
  // the operator can see, and they have to undo the app's arithmetic in their
  // head. The storeroom is consulted as a binary, never as a quantity.
  it('does not ration against the storeroom estimate', () => {
    const accepts = new Map<string, string[]>()
    const needs: SlotNeed[] = []
    for (const slotNumber of [51, 52, 53]) {
      needs.push(need('L7', slotNumber, 10, 4))
      accepts.set(slotKey('L7', slotNumber), ['coke', 'fanta'])
    }

    // The ledger says 8 Coke and the needs total 18. The pick list still asks
    // for 18, and it does not spill the excess onto Fanta.
    const list = buildPickList(input({ needs, accepts }))

    expect(lineFor(list, 'coke')?.needed).toBe(18)
    expect(lineFor(list, 'fanta')).toBeUndefined()
  })

  it('skips a slot whose need is zero', () => {
    const list = buildPickList(input({
      needs: [need('L7', 52, 10, 10), need('L7', 53, 10, 4)],
      accepts: new Map([
        [slotKey('L7', 52), ['coke']],
        [slotKey('L7', 53), ['coke']],
      ]),
    }))

    expect(lineFor(list, 'coke')?.needed).toBe(6)
    expect(lineFor(list, 'coke')?.slots).toHaveLength(1)
    expect(list.unfulfillable).toEqual([])
  })

  it('walks in walk order — machine level, then slot number', () => {
    const accepts = new Map<string, string[]>([
      [slotKey('L12', 41), ['coke']],
      [slotKey('L7', 53), ['coke']],
      [slotKey('L7', 52), ['coke']],
      [slotKey('L8', 10), ['coke']],
    ])
    const list = buildPickList(input({
      needs: [
        need('L12', 41, 10, 1), need('L7', 53, 10, 1),
        need('L7', 52, 10, 1), need('L8', 10, 10, 1),
      ],
      accepts,
    }))

    expect(lineFor(list, 'coke')?.slots.map((s) => `${s.machineId}:${s.slotNumber}`))
      .toEqual(['L7:52', 'L7:53', 'L8:10', 'L12:41'])
  })

  // Design §4.4: a slot that sells nothing and whose level has not moved is
  // either dead stock or a tray nobody has counted. Both deserve the
  // operator's eye, and neither should quietly consume trolley space.
  it('lists a slot that has sold nothing and not moved as quiet, not as a need', () => {
    const list = buildPickList(input({
      needs: [need('L7', 52, 10, 4, { rate: 0 })],
      accepts: new Map([[slotKey('L7', 52), ['coke']]]),
      unmovedSlots: new Set([slotKey('L7', 52)]),
    }))

    expect(list.quiet).toHaveLength(1)
    expect(list.quiet[0].slotNumber).toBe(52)
    expect(list.lines).toEqual([])
    expect(list.unfulfillable).toEqual([])
  })

  it('does not call a slot quiet on a still level alone when it is still selling', () => {
    const list = buildPickList(input({
      needs: [need('L7', 52, 10, 4, { rate: 1.5 })],
      accepts: new Map([[slotKey('L7', 52), ['coke']]]),
      unmovedSlots: new Set([slotKey('L7', 52)]),
    }))

    expect(list.quiet).toEqual([])
    expect(lineFor(list, 'coke')).toBeDefined()
  })

  it('does not call a slot quiet on a zero rate alone when its level moves', () => {
    const list = buildPickList(input({
      needs: [need('L7', 52, 10, 4, { rate: 0 })],
      accepts: new Map([[slotKey('L7', 52), ['coke']]]),
    }))

    expect(list.quiet).toEqual([])
    expect(lineFor(list, 'coke')?.needed).toBe(6)
  })

  // null is not zero, one more time: a slot with no history is not quiet, it
  // is unknown, and it gets its fallback need.
  it('does not call a slot with no rate quiet', () => {
    const list = buildPickList(input({
      needs: [need('L7', 52, 10, 4, { rate: null })],
      accepts: new Map([[slotKey('L7', 52), ['coke']]]),
      unmovedSlots: new Set([slotKey('L7', 52)]),
    }))

    expect(list.quiet).toEqual([])
    expect(lineFor(list, 'coke')?.needed).toBe(6)
  })

  it('produces nothing at all from no needs', () => {
    const list = buildPickList(input())

    expect(list).toEqual({ lines: [], unfulfillable: [], quiet: [] })
  })

  it('resolves two slots of one machine to different items', () => {
    const list = buildPickList(input({
      needs: [need('L7', 52, 10, 4), need('L7', 53, 8, 2)],
      accepts: new Map([
        [slotKey('L7', 52), ['coke', 'fanta']],
        [slotKey('L7', 53), ['water']],
      ]),
      outOfStock: new Set(['coke']),
    }))

    expect(lineFor(list, 'fanta')?.needed).toBe(6)
    expect(lineFor(list, 'water')?.needed).toBe(6)
  })
})
