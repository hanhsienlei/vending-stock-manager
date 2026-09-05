import { describe, it, expect } from 'vitest'
import { ledgerBalance, storeroomMovements } from './storeroom'
import type { Adjustment, StoreroomBalance, TrolleyLine } from './types'

const anchor = (units: number, verifiedAt: number): StoreroomBalance => ({
  id: 'b1', itemId: 'coke', units, updatedAt: verifiedAt, verifiedAt,
})

const movement = (units: number, at: number) => ({ units, at })

const delivery = (units: number, occurredAt: number): Adjustment => ({
  id: `m${occurredAt}`, itemId: 'coke', locationKind: 'storeroom',
  reason: 'delivery', units, occurredAt, updatedAt: occurredAt,
})

const miscount = (units: number, occurredAt: number): Adjustment => ({
  id: `c${occurredAt}`, itemId: 'coke', locationKind: 'storeroom',
  reason: 'miscount', units, occurredAt, updatedAt: occurredAt,
})

const load = (taken: number, loadedAt: number): TrolleyLine => ({
  id: `t${loadedAt}`, runId: 'r1', itemId: 'coke',
  needed: taken, taken, noneLeftInG: false, loadedAt, updatedAt: loadedAt,
})

describe('ledgerBalance', () => {
  // Spec §6.5: "an estimate maintained by a ledger, not a stocktake."
  it('adds movements since the last verified count', () => {
    expect(ledgerBalance(anchor(100, 50), [movement(24, 60), movement(-10, 70)]))
      .toBe(114)
  })

  it('ignores movements from before the count that superseded them', () => {
    expect(ledgerBalance(anchor(100, 50), [movement(24, 40)])).toBe(100)
  })

  it('ignores a movement logged at the same instant as the count', () => {
    // The count is the later truth: it observed the shelf after that movement
    // had already happened.
    expect(ledgerBalance(anchor(100, 50), [movement(24, 50)])).toBe(100)
  })

  it('counts every movement when nothing has ever been verified', () => {
    expect(ledgerBalance(undefined, [movement(24, 10), movement(-4, 20)])).toBe(20)
  })

  it('never reports negative stock', () => {
    expect(ledgerBalance(anchor(5, 50), [movement(-10, 60)])).toBe(0)
  })
})

describe('storeroomMovements', () => {
  // The regression guard for Phase 3: every historical run had no trolley at
  // all, and the balance it produced must not move by a unit.
  it('gives the same answer as before when there is no trolley', () => {
    const adjustments = [delivery(24, 60), delivery(-10, 70)]

    expect(storeroomMovements(adjustments, []))
      .toEqual([movement(24, 60), movement(-10, 70)])
    expect(ledgerBalance(anchor(100, 50), storeroomMovements(adjustments, [])))
      .toBe(114)
  })

  it('takes the load off the balance and puts the return back on', () => {
    const line: TrolleyLine = {
      ...load(6, 60), returned: 2, returnedAt: 80, updatedAt: 80,
    }

    expect(storeroomMovements([], [line]))
      .toEqual([movement(-6, 60), movement(2, 80)])
    expect(ledgerBalance(anchor(40, 50), storeroomMovements([], [line]))).toBe(36)
  })

  // `returned` is undefined until the run closes: the units are on the
  // trolley, not on the shelf, and not back in the storeroom either.
  it('leaves an unreturned trolley line off the balance', () => {
    expect(storeroomMovements([], [load(6, 60)])).toEqual([movement(-6, 60)])
    expect(ledgerBalance(anchor(40, 50), storeroomMovements([], [load(6, 60)])))
      .toBe(34)
  })

  // The invariant Phase 2's 99e7a91 fixed. It has ONE owner and keeps it:
  // types.ts documents `miscount` as "a data fix, NOT a stock movement", and
  // the filter that enforces it moved here whole rather than being copied.
  it('still excludes a miscount', () => {
    expect(storeroomMovements([miscount(24, 60)], [])).toEqual([])
    expect(ledgerBalance(anchor(100, 50), storeroomMovements([miscount(24, 60)], [])))
      .toBe(100)
  })

  it('still applies a delivery of the same size', () => {
    expect(ledgerBalance(anchor(100, 50), storeroomMovements([delivery(24, 60)], [])))
      .toBe(124)
  })

  // A returned figure of zero is a real observation — the trolley came back
  // empty — and must not be mistaken for "not yet returned".
  it('treats a return of zero as a return, not as an open line', () => {
    const line: TrolleyLine = {
      ...load(6, 60), returned: 0, returnedAt: 80, updatedAt: 80,
    }

    expect(storeroomMovements([], [line]))
      .toEqual([movement(-6, 60), movement(0, 80)])
  })
})
