import { describe, it, expect } from 'vitest'
import { slotNeed } from './forecast'
import type { SlotNeedInput } from './forecast'

const input = (over: Partial<SlotNeedInput> = {}): SlotNeedInput => ({
  machineId: 'L7', slotNumber: 52, capacity: 10, lastLevel: 8,
  rate: 1.5, daysSince: 4, ranDryLastPeriod: false,
  ...over,
})

describe('slotNeed', () => {
  it('projects the level down at the rate and asks for the difference', () => {
    // 8 left, 1.5/day, 4 days → projected 2 → need 8.
    const result = slotNeed(input())

    expect(result.projected).toBeCloseTo(2)
    expect(result.need).toBe(8)
    expect(result.basis).toBe('rate')
  })

  // Spec §6.1's stated fallback, "which assumes nothing sold" — and it falls
  // out of the same expression rather than a branch, so there is one formula
  // to test and one to explain on the screen.
  it('falls back to capacity minus the last level when there is no rate', () => {
    const result = slotNeed(input({ rate: null }))

    expect(result.projected).toBe(8)
    expect(result.need).toBe(2)
    expect(result.basis).toBe('no-rate')
  })

  // null is not zero: a slot known to sell nothing keeps its stock, a slot
  // nobody has data for gets topped up.
  it('separates no rate from a rate of zero', () => {
    expect(slotNeed(input({ rate: 0, lastLevel: 8 })).need).toBe(2)
    expect(slotNeed(input({ rate: null, lastLevel: 8 })).need).toBe(2)
    // …and they differ the moment the projection has room to move.
    expect(slotNeed(input({ rate: 0, lastLevel: 8 })).basis).toBe('rate')
    expect(slotNeed(input({ rate: null, lastLevel: 8 })).basis).toBe('no-rate')
  })

  // Spec §6.1: "over-picking costs trolley space while under-picking costs a
  // trip down fifteen floors".
  it('rounds the need up, because under-picking costs a trip', () => {
    // capacity 5, left 5, 0.4/day, 3 days → projected 3.8 → need 2, not 1.
    const result = slotNeed(input({ capacity: 5, lastLevel: 5, rate: 0.4, daysSince: 3 }))

    expect(result.projected).toBeCloseTo(3.8)
    expect(result.need).toBe(2)
  })

  it('never projects below zero and never needs more than capacity', () => {
    const result = slotNeed(input({ capacity: 5, lastLevel: 2, rate: 9, daysSince: 7 }))

    expect(result.projected).toBe(0)
    expect(result.need).toBe(5)
  })

  // Reachable: the count cells deliberately do not clamp (interface §3.3), so
  // a slot can be recorded above its configured capacity.
  it('never returns a negative need when the slot is over capacity', () => {
    const result = slotNeed(input({ capacity: 5, lastLevel: 7, rate: null }))

    expect(result.need).toBe(0)
  })

  it('needs nothing from a full slot that has had no time to drain', () => {
    expect(slotNeed(input({ capacity: 10, lastLevel: 10, daysSince: 0 })).need).toBe(0)
  })

  it('asks for a whole capacity when the slot was left empty', () => {
    expect(slotNeed(input({ capacity: 10, lastLevel: 0, rate: 2 })).need).toBe(10)
  })

  // §7.1: a machine skipped last run has been drawing down for a week while
  // its neighbours have had three days, and skipped machines are the ones
  // most likely to be empty.
  it('projects a longer drawdown for a machine that was skipped', () => {
    const counted = slotNeed(input({ rate: 1, daysSince: 3 }))
    const skipped = slotNeed(input({ rate: 1, daysSince: 7 }))

    expect(counted.need).toBe(5)
    expect(skipped.need).toBe(9)
  })

  it('carries its inputs through so the screen can print the workings', () => {
    const result = slotNeed(input({ ranDryLastPeriod: true }))

    expect(result.machineId).toBe('L7')
    expect(result.slotNumber).toBe(52)
    expect(result.capacity).toBe(10)
    expect(result.lastLevel).toBe(8)
    expect(result.rate).toBe(1.5)
    expect(result.daysSince).toBe(4)
    expect(result.ranDryLastPeriod).toBe(true)
  })

  it('needs a whole capacity for a slot that ran dry and has no rate', () => {
    const result = slotNeed(input({
      capacity: 6, lastLevel: 0, rate: null, ranDryLastPeriod: true,
    }))

    expect(result.need).toBe(6)
    expect(result.basis).toBe('no-rate')
  })
})
