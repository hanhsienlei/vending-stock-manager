import { describe, it, expect } from 'vitest'
import { trolleyRemaining, runsOutAt } from './trolley'
import type { CountLine } from './types'

const line = (
  visitId: string, slotNumber: number, itemId: string,
  before: number, after: number, extra: Partial<CountLine> = {},
): CountLine => ({
  id: `${visitId}-${slotNumber}-${itemId}`, visitId, slotNumber, itemId,
  before, after, touched: false, filled: false, price: 4.5, updatedAt: 1,
  ...extra,
})

describe('trolleyRemaining', () => {
  // Spec §6.3 says the balance "decrements with each Fill". That is obsolete
  // (design §16.5): since the after-count became editable a refill is
  // recorded by typing, and `Fill tray to par` sets a whole tray at once.
  // `after − before` covers every path, including ones that do not exist yet.
  it('decrements by what went into the machine, not by a Fill tap', () => {
    const remaining = trolleyRemaining(
      new Map([['coke', 24]]),
      [line('v1', 52, 'coke', 2, 10, { filled: false })],
    )

    expect(remaining.get('coke')).toBe(16)
  })

  it('decrements a hand-typed refill exactly as it does a Fill', () => {
    const byHand = trolleyRemaining(
      new Map([['coke', 24]]),
      [line('v1', 52, 'coke', 2, 10, { filled: false, touched: true })],
    )
    const byFill = trolleyRemaining(
      new Map([['coke', 24]]),
      [line('v1', 52, 'coke', 2, 10, { filled: true, touched: true })],
    )

    expect(byHand.get('coke')).toBe(byFill.get('coke'))
  })

  it('takes nothing off for a slot that was counted and left alone', () => {
    const remaining = trolleyRemaining(
      new Map([['coke', 24]]),
      [line('v1', 52, 'coke', 7, 7, { filled: true })],
    )

    expect(remaining.get('coke')).toBe(24)
  })

  // Spec §3.2's intra-run redistribution, for free: the sum is signed on
  // purpose, so stock pulled OUT of a machine and onto the trolley comes back
  // on the trolley figure.
  it('increments when stock is pulled OUT of a machine onto the trolley', () => {
    const remaining = trolleyRemaining(
      new Map([['coke', 24]]),
      [line('v1', 52, 'coke', 6, 2)],
    )

    expect(remaining.get('coke')).toBe(28)
  })

  it('follows an item pulled onto a trolley that never carried it', () => {
    const remaining = trolleyRemaining(new Map(), [line('v1', 52, 'fanta', 6, 2)])

    expect(remaining.get('fanta')).toBe(4)
  })

  it('sums every slot and every machine of the run', () => {
    const remaining = trolleyRemaining(
      new Map([['coke', 24]]),
      [
        line('v1', 52, 'coke', 2, 10),   // −8
        line('v1', 53, 'coke', 4, 10),   // −6
        line('v2', 52, 'coke', 9, 10),   // −1
      ],
    )

    expect(remaining.get('coke')).toBe(9)
  })

  it('keeps each item to its own figure', () => {
    const remaining = trolleyRemaining(
      new Map([['coke', 24], ['water', 12]]),
      [line('v1', 52, 'coke', 2, 10), line('v1', 58, 'water', 1, 6)],
    )

    expect(remaining.get('coke')).toBe(16)
    expect(remaining.get('water')).toBe(7)
  })

  it('reports an item taken but not yet used at its full load', () => {
    expect(trolleyRemaining(new Map([['coke', 24]]), []).get('coke')).toBe(24)
  })

  // Signed on purpose, and not floored: a negative figure means more went
  // into the machines than came off the trolley, which is a reconciliation
  // problem for the return screen to show rather than one to hide at zero.
  it('goes negative rather than pretending, when more went in than came off', () => {
    const remaining = trolleyRemaining(
      new Map([['coke', 4]]),
      [line('v1', 52, 'coke', 2, 10)],
    )

    expect(remaining.get('coke')).toBe(-4)
  })

  it('mentions no item that was neither taken nor moved', () => {
    const remaining = trolleyRemaining(
      new Map([['coke', 4]]),
      [line('v1', 58, 'water', 6, 6)],
    )

    expect([...remaining.keys()]).toEqual(['coke'])
  })
})

describe('runsOutAt', () => {
  const draw = (machineId: string, level: number, units: number, itemId = 'coke') =>
    ({ machineId, level, draw: new Map([[itemId, units]]) })

  it('names the level an item runs out at', () => {
    const result = runsOutAt(new Map([['coke', 6]]), [
      draw('L9', 9, 3),
      draw('L11', 11, 4),   // running total 7 > 6
      draw('L12', 12, 2),
    ])

    expect(result).toEqual([{ itemId: 'coke', level: 11, remaining: 6 }])
  })

  it('says nothing when everything ahead is covered', () => {
    const result = runsOutAt(new Map([['coke', 12]]), [draw('L9', 9, 3), draw('L11', 11, 4)])

    expect(result).toEqual([])
  })

  it('says nothing when the draw exactly exhausts the trolley', () => {
    const result = runsOutAt(new Map([['coke', 7]]), [draw('L9', 9, 3), draw('L11', 11, 4)])

    expect(result).toEqual([])
  })

  it('names the first machine when there is nothing left at all', () => {
    const result = runsOutAt(new Map([['coke', 0]]), [draw('L9', 9, 3), draw('L11', 11, 4)])

    expect(result).toEqual([{ itemId: 'coke', level: 9, remaining: 0 }])
  })

  it('reads the machines in level order however they arrive', () => {
    const result = runsOutAt(new Map([['coke', 6]]), [
      draw('L12', 12, 2),
      draw('L11', 11, 4),
      draw('L9', 9, 3),
    ])

    expect(result).toEqual([{ itemId: 'coke', level: 11, remaining: 6 }])
  })

  it('names each short item once, at its own level', () => {
    const result = runsOutAt(new Map([['coke', 2], ['water', 5]]), [
      { machineId: 'L9', level: 9, draw: new Map([['coke', 3], ['water', 2]]) },
      { machineId: 'L11', level: 11, draw: new Map([['coke', 3], ['water', 4]]) },
    ])

    expect(result).toEqual([
      { itemId: 'coke', level: 9, remaining: 2 },
      { itemId: 'water', level: 11, remaining: 5 },
    ])
  })

  it('says nothing when no machines are left to visit', () => {
    expect(runsOutAt(new Map([['coke', 0]]), [])).toEqual([])
  })

  it('treats an item with no trolley figure as having none left', () => {
    const result = runsOutAt(new Map(), [draw('L9', 9, 3)])

    expect(result).toEqual([{ itemId: 'coke', level: 9, remaining: 0 }])
  })

  it('ignores a machine that wants none of an item', () => {
    const result = runsOutAt(new Map([['coke', 3]]), [
      draw('L9', 9, 0),
      draw('L11', 11, 4),
    ])

    expect(result).toEqual([{ itemId: 'coke', level: 11, remaining: 3 }])
  })
})
