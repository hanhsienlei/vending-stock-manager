import { describe, it, expect } from 'vitest'
import { allocate } from './allocation'
import { slotKey } from './pick'
import type { PickAssignment } from './pick'
import { slotNeed } from './forecast'
import type { SlotNeed } from './forecast'

const LEVELS = new Map([['L7', 7], ['L8', 8], ['L12', 12]])

const need = (
  machineId: string, slotNumber: number, units: number,
  over: Partial<Parameters<typeof slotNeed>[0]> = {},
): SlotNeed => slotNeed({
  machineId, slotNumber, capacity: units, lastLevel: 0,
  rate: null, daysSince: 3, ranDryLastPeriod: false,
  ...over,
})

/** Build the two shapes `allocate` takes from one list of slot needs. */
function fixture(needs: SlotNeed[], itemId = 'coke') {
  const assignments: PickAssignment[] = needs.map((n) => ({
    machineId: n.machineId, slotNumber: n.slotNumber, itemId, units: n.need,
  }))
  const bySlot = new Map(needs.map((n) => [slotKey(n.machineId, n.slotNumber), n]))
  return { assignments, bySlot }
}

const totalAllocated = (lines: { allocated: number }[]) =>
  lines.reduce((sum, l) => sum + l.allocated, 0)

describe('allocate', () => {
  // Spec §6.2's first ranking rule: a slot that ran dry is proven unmet
  // demand, which outranks a higher rate that was being met.
  it('serves a slot that ran dry before one with a higher rate', () => {
    const { assignments, bySlot } = fixture([
      need('L7', 52, 6, { rate: 4 }),
      need('L8', 52, 6, { rate: 1, ranDryLastPeriod: true }),
    ])

    const result = allocate(assignments, bySlot, new Map([['coke', 6]]), LEVELS)

    expect(result.lines.map((l) => l.machineId)).toEqual(['L8', 'L7'])
    expect(result.lines[0].allocated).toBe(6)
    expect(result.lines[1].allocated).toBe(0)
  })

  it('orders the rest by demand rate, descending', () => {
    const { assignments, bySlot } = fixture([
      need('L7', 52, 3, { rate: 0.5 }),
      need('L8', 52, 3, { rate: 4 }),
      need('L12', 41, 3, { rate: 2 }),
    ])

    const result = allocate(assignments, bySlot, new Map([['coke', 99]]), LEVELS)

    expect(result.lines.map((l) => l.machineId)).toEqual(['L8', 'L12', 'L7'])
    expect(result.lines.map((l) => l.rank)).toEqual([0, 1, 2])
  })

  // The tiebreak has to be deterministic for the arithmetic to be testable,
  // and walk order is the one the operator can read: the cut line becomes
  // "everything from L12 up goes short", a sentence about their afternoon.
  it('breaks a tie in walk order — lowest level, then lowest slot', () => {
    const { assignments, bySlot } = fixture([
      need('L12', 41, 2, { rate: 2 }),
      need('L7', 53, 2, { rate: 2 }),
      need('L7', 52, 2, { rate: 2 }),
      need('L8', 10, 2, { rate: 2 }),
    ])

    const result = allocate(assignments, bySlot, new Map([['coke', 99]]), LEVELS)

    expect(result.lines.map((l) => `${l.machineId}:${l.slotNumber}`))
      .toEqual(['L7:52', 'L7:53', 'L8:10', 'L12:41'])
  })

  // null is neither a high rate nor a zero rate. A slot nobody has data for
  // must not outrank a slot known to sell four a day.
  it('ranks a slot with no rate below every rated slot', () => {
    const { assignments, bySlot } = fixture([
      need('L7', 52, 3, { rate: null }),
      need('L8', 52, 3, { rate: 0 }),
      need('L12', 41, 3, { rate: 0.1 }),
    ])

    const result = allocate(assignments, bySlot, new Map([['coke', 99]]), LEVELS)

    expect(result.lines.map((l) => l.machineId)).toEqual(['L12', 'L8', 'L7'])
  })

  it('still serves a no-rate slot when there is anything left', () => {
    const { assignments, bySlot } = fixture([
      need('L7', 52, 3, { rate: null }),
      need('L8', 52, 3, { rate: 4 }),
    ])

    const result = allocate(assignments, bySlot, new Map([['coke', 99]]), LEVELS)

    expect(totalAllocated(result.lines)).toBe(6)
    expect(result.cutAfter).toBeNull()
  })

  // Leaving units on the trolley to honour the fill-to-capacity rule helps
  // nobody, and the operator is going to put them in the machine anyway.
  it('gives the slot at the cut line a partial allocation', () => {
    const { assignments, bySlot } = fixture([
      need('L7', 52, 6, { rate: 4 }),
      need('L8', 52, 7, { rate: 2 }),
    ])

    const result = allocate(assignments, bySlot, new Map([['coke', 10]]), LEVELS)

    expect(result.lines[0].allocated).toBe(6)
    expect(result.lines[1].need).toBe(7)
    expect(result.lines[1].allocated).toBe(4)
  })

  it('reports the cut line so the screen can draw it', () => {
    const { assignments, bySlot } = fixture([
      need('L7', 52, 4, { rate: 5 }),
      need('L7', 53, 4, { rate: 4 }),
      need('L8', 52, 4, { rate: 3 }),
      need('L8', 53, 4, { rate: 2 }),
      need('L12', 41, 4, { rate: 1 }),
    ])

    const result = allocate(assignments, bySlot, new Map([['coke', 13]]), LEVELS)

    // Three served in full, the fourth short, the fifth not at all.
    expect(result.cutAfter).toBe(2)
    expect(result.lines.map((l) => l.allocated)).toEqual([4, 4, 4, 1, 0])
  })

  it('has no cut line when everything is covered', () => {
    const { assignments, bySlot } = fixture([
      need('L7', 52, 4, { rate: 5 }),
      need('L8', 52, 4, { rate: 3 }),
    ])

    const result = allocate(assignments, bySlot, new Map([['coke', 8]]), LEVELS)

    expect(result.cutAfter).toBeNull()
    expect(result.lines.every((l) => l.allocated === l.need)).toBe(true)
  })

  it('puts the cut line above everything when even the first slot goes short', () => {
    const { assignments, bySlot } = fixture([
      need('L7', 52, 4, { rate: 5 }),
      need('L8', 52, 4, { rate: 3 }),
    ])

    const result = allocate(assignments, bySlot, new Map([['coke', 2]]), LEVELS)

    expect(result.cutAfter).toBe(-1)
    expect(result.lines.map((l) => l.allocated)).toEqual([2, 0])
  })

  it('allocates nothing beyond what was taken', () => {
    const { assignments, bySlot } = fixture([
      need('L7', 52, 10, { rate: 5 }),
      need('L8', 52, 10, { rate: 3 }),
      need('L12', 41, 10, { rate: 1 }),
    ])

    const result = allocate(assignments, bySlot, new Map([['coke', 7]]), LEVELS)

    expect(totalAllocated(result.lines)).toBe(7)
  })

  it('allocates nothing for an item that was not taken at all', () => {
    const { assignments, bySlot } = fixture([need('L7', 52, 6, { rate: 5 })])

    const result = allocate(assignments, bySlot, new Map(), LEVELS)

    expect(result.lines[0].allocated).toBe(0)
    expect(result.cutAfter).toBe(-1)
  })

  // The trolley carries several items and each has its own supply; one item
  // running out must not eat another's.
  it('keeps each item\'s supply to itself', () => {
    const coke = fixture([need('L7', 52, 8, { rate: 5 })], 'coke')
    const water = fixture([need('L8', 52, 4, { rate: 1 })], 'water')

    const result = allocate(
      [...coke.assignments, ...water.assignments],
      new Map([...coke.bySlot, ...water.bySlot]),
      new Map([['coke', 3], ['water', 4]]),
      LEVELS,
    )

    const byItem = new Map(result.lines.map((l) => [l.itemId, l]))
    expect(byItem.get('coke')?.allocated).toBe(3)
    expect(byItem.get('water')?.allocated).toBe(4)
  })

  it('serves two slots of the same item from one pool, in rank order', () => {
    const { assignments, bySlot } = fixture([
      need('L7', 52, 5, { rate: 5 }),
      need('L8', 52, 5, { rate: 3 }),
    ])

    const result = allocate(assignments, bySlot, new Map([['coke', 6]]), LEVELS)

    expect(result.lines.map((l) => l.allocated)).toEqual([5, 1])
  })

  it('produces nothing from no assignments', () => {
    expect(allocate([], new Map(), new Map([['coke', 9]]), LEVELS))
      .toEqual({ lines: [], cutAfter: null })
  })

  // Advisory only, spec §6.2 and design §3.9: every number is overridable and
  // the allocation is stored nowhere. The inputs must come back unchanged.
  it('writes nothing into what it was given', () => {
    const { assignments, bySlot } = fixture([need('L7', 52, 6, { rate: 5 })])
    const taken = new Map([['coke', 2]])

    allocate(assignments, bySlot, taken, LEVELS)

    expect(taken.get('coke')).toBe(2)
    expect(assignments[0].units).toBe(6)
  })
})
