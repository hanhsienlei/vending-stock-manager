import { describe, it, expect } from 'vitest'
import { slotTotal, fillToCapacity } from './fill'
import type { ResolvedSlot } from './types'

const single: ResolvedSlot = { slotNumber: 58, capacity: 8, accepts: ['coke'] }
const mixed: ResolvedSlot = { slotNumber: 52, capacity: 5, accepts: ['sunkist', 'fanta'] }

describe('slotTotal', () => {
  it('sums every item in the slot', () => {
    expect(slotTotal([{ itemId: 'sunkist', qty: 3 }, { itemId: 'fanta', qty: 2 }])).toBe(5)
  })

  it('is zero for an empty slot', () => {
    expect(slotTotal([])).toBe(0)
  })
})

describe('fillToCapacity', () => {
  it('tops a single-item slot up to capacity', () => {
    expect(fillToCapacity(single, [{ itemId: 'coke', qty: 3 }]))
      .toEqual([{ itemId: 'coke', qty: 8 }])
  })

  it('adds the preferred item to an empty slot', () => {
    expect(fillToCapacity(single, [])).toEqual([{ itemId: 'coke', qty: 8 }])
  })

  it('tops a mixed slot to the shared capacity, not per item', () => {
    const result = fillToCapacity(mixed, [
      { itemId: 'sunkist', qty: 3 }, { itemId: 'fanta', qty: 1 },
    ])
    expect(slotTotal(result)).toBe(5)
    // the shortfall of 1 goes to the preferred item
    expect(result).toEqual([{ itemId: 'sunkist', qty: 4 }, { itemId: 'fanta', qty: 1 }])
  })

  it('leaves a full slot untouched', () => {
    const contents = [{ itemId: 'coke', qty: 8 }]
    expect(fillToCapacity(single, contents)).toEqual(contents)
  })

  it('never removes stock from an over-full slot', () => {
    const contents = [{ itemId: 'coke', qty: 10 }]
    expect(fillToCapacity(single, contents)).toEqual(contents)
  })

  it('does not mutate its input', () => {
    const contents = [{ itemId: 'coke', qty: 3 }]
    fillToCapacity(single, contents)
    expect(contents).toEqual([{ itemId: 'coke', qty: 3 }])
  })
})
