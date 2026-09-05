import { describe, it, expect } from 'vitest'
import {
  orderSuggestion, slotRatesByItem, ORDER_HORIZON_DAYS, ORDER_SAFETY_DAYS,
} from './order'
import type { OrderInput } from './order'

const item = (over: Partial<OrderInput> = {}): OrderInput => ({
  itemId: 'coke', boxSize: 24, onHand: 0, slotRates: [], flags: [],
  ...over,
})

const only = (inputs: OrderInput[], horizon?: number, safety?: number) =>
  orderSuggestion(inputs, horizon, safety)[0]

describe('orderSuggestion', () => {
  it('defaults to this route\'s horizon and safety buffer', () => {
    // D2: seven covers a full week (both runs); three covers the longer
    // Fri→Tue gap, so a missed run does not empty a machine.
    expect(ORDER_HORIZON_DAYS).toBe(7)
    expect(ORDER_SAFETY_DAYS).toBe(3)
  })

  it('forecasts the horizon plus the safety buffer and nets off what is on hand', () => {
    // 3/day × (7 + 3) = 30, on hand 6 → suggested 24.
    const line = only([item({ slotRates: [2, 1], onHand: 6 })])

    expect(line.ratePerDay).toBe(3)
    expect(line.forecast).toBe(30)
    expect(line.onHand).toBe(6)
    expect(line.suggested).toBe(24)
  })

  it('honours an edited horizon and safety', () => {
    const line = only([item({ slotRates: [3], onHand: 0 })], 14, 0)

    expect(line.forecast).toBe(42)
    expect(line.suggested).toBe(42)
  })

  it('rounds up to whole boxes', () => {
    expect(only([item({ slotRates: [2.4], onHand: 0 })]).suggested).toBe(24)
    expect(only([item({ slotRates: [2.4], onHand: 0 })]).boxes).toBe(1)

    // One more unit needed than a box holds is two boxes, not one.
    expect(only([item({ slotRates: [2.5], onHand: 0 })]).suggested).toBe(25)
    expect(only([item({ slotRates: [2.5], onHand: 0 })]).boxes).toBe(2)
  })

  it('reports the units a whole-box order actually delivers', () => {
    const line = only([item({ slotRates: [2.5], onHand: 0 })])

    expect(line.boxes).toBe(2)
    expect(line.units).toBe(48)
  })

  it('rounds a fractional shortfall up to a whole unit', () => {
    // 1.11/day × 10 = 11.1, nothing on hand: you cannot order a tenth.
    const line = only([item({ boxSize: 1, slotRates: [1.11] })])

    expect(line.forecast).toBeCloseTo(11.1)
    expect(line.suggested).toBe(12)
  })

  // The fourteen loose sundries in the catalogue sit at boxSize 1, where
  // `packs.ts` degrades to plain units. Nothing special-cases them.
  it('reads in units at box size 1', () => {
    const line = only([item({ boxSize: 1, slotRates: [3], onHand: 6 })])

    expect(line.suggested).toBe(24)
    expect(line.boxes).toBe(24)
    expect(line.boxes).toBe(line.units)
  })

  it('suggests nothing when the storeroom already covers the horizon', () => {
    const line = only([item({ slotRates: [3], onHand: 40 })])

    expect(line.suggested).toBe(0)
    expect(line.boxes).toBe(0)
    expect(line.units).toBe(0)
  })

  it('suggests nothing for an item nothing sells', () => {
    const line = only([item({ slotRates: [0, 0] })])

    expect(line.ratePerDay).toBe(0)
    expect(line.suggested).toBe(0)
  })

  // null contributes no slot to the sum. It is not a zero-rate slot dragging
  // an average down, and it is not a hole that makes the whole figure NaN.
  it('treats a slot with no rate as contributing nothing, not as zero demand', () => {
    const line = only([item({ boxSize: 1, slotRates: [2, null] })])

    expect(line.ratePerDay).toBe(2)          // a sum, not a mean of 1
    expect(line.forecast).toBe(20)
    expect(Number.isNaN(line.forecast)).toBe(false)
  })

  it('suggests nothing for an item whose every slot is unrated', () => {
    const line = only([item({ slotRates: [null, null] })])

    expect(line.ratePerDay).toBe(0)
    expect(line.suggested).toBe(0)
  })

  it('carries the flags through so the report can mark the costly items', () => {
    const line = only([item({ flags: ['ran-dry', 'none-left'] })])

    expect(line.flags).toEqual(['ran-dry', 'none-left'])
  })

  it('keeps a line per item, in the order it was given them', () => {
    const lines = orderSuggestion([
      item({ itemId: 'coke', slotRates: [1] }),
      item({ itemId: 'water', slotRates: [2] }),
    ])

    expect(lines.map((l) => l.itemId)).toEqual(['coke', 'water'])
  })

  // Design §10: the machines are full at the start of the horizon and drain
  // over it, and every unit that drains is replaced from the storeroom — so
  // the storeroom supplies the whole horizon regardless of what is sitting in
  // the machines. There is no machine-stock input here, and there must not be.
  it('nets off the storeroom only', () => {
    const line = only([item({ slotRates: [3], onHand: 6 })])

    expect(line.suggested).toBe(30 - 6)
  })

  it('produces nothing from no items', () => {
    expect(orderSuggestion([])).toEqual([])
  })
})

describe('slotRatesByItem', () => {
  // THE test for design §3.8. Spec §6.4's "Σ over slots accepting this item"
  // counts a two-item slot in both forecasts and over-orders — and every slot
  // that has ever had a second item added, which is how a changeover is
  // recorded, is double-counted for as long as both remain listed.
  it('counts a slot accepting two items towards exactly ONE of them', () => {
    const rates = slotRatesByItem([{ accepts: ['coke', 'fanta'], rate: 1.4 }])

    expect(rates.get('coke')).toEqual([1.4])
    expect(rates.get('fanta')).toBeUndefined()
  })

  it('attributes each slot to the item it will actually be filled with', () => {
    const rates = slotRatesByItem([
      { accepts: ['coke'], rate: 2 },
      { accepts: ['coke', 'fanta'], rate: 1 },
      { accepts: ['fanta', 'coke'], rate: 3 },
    ])

    expect(rates.get('coke')).toEqual([2, 1])
    expect(rates.get('fanta')).toEqual([3])
  })

  it('partitions the slot rates — every slot lands in exactly one item', () => {
    const slots = [
      { accepts: ['coke', 'fanta'], rate: 1 },
      { accepts: ['fanta'], rate: 2 },
      { accepts: ['water', 'coke'], rate: 3 },
    ]

    const rates = slotRatesByItem(slots)
    const counted = [...rates.values()].reduce((sum, list) => sum + list.length, 0)

    expect(counted).toBe(slots.length)
  })

  it('keeps an unrated slot as a null rather than dropping it', () => {
    const rates = slotRatesByItem([{ accepts: ['coke'], rate: null }])

    expect(rates.get('coke')).toEqual([null])
  })

  it('ignores a slot that accepts nothing', () => {
    expect(slotRatesByItem([{ accepts: [], rate: 4 }]).size).toBe(0)
  })

  it('feeds the order suggestion directly, without double-counting', () => {
    const rates = slotRatesByItem([
      { accepts: ['coke', 'fanta'], rate: 1.5 },
      { accepts: ['coke'], rate: 1.5 },
    ])

    const lines = orderSuggestion([
      { itemId: 'coke', boxSize: 1, onHand: 0, slotRates: rates.get('coke') ?? [], flags: [] },
      { itemId: 'fanta', boxSize: 1, onHand: 0, slotRates: rates.get('fanta') ?? [], flags: [] },
    ])

    expect(lines[0].suggested).toBe(30)
    expect(lines[1].suggested).toBe(0)   // not 15 — the slot belongs to Coke
  })
})
