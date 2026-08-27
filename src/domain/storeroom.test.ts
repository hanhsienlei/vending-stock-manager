import { describe, it, expect } from 'vitest'
import { ledgerBalance } from './storeroom'
import type { Adjustment, StoreroomBalance } from './types'

const anchor = (units: number, verifiedAt: number): StoreroomBalance => ({
  id: 'b1', itemId: 'coke', units, updatedAt: verifiedAt, verifiedAt,
})

const movement = (units: number, occurredAt: number): Adjustment => ({
  id: `m${occurredAt}`, itemId: 'coke', locationKind: 'storeroom',
  reason: 'delivery', units, occurredAt, updatedAt: occurredAt,
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
