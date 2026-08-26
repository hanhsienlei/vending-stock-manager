import { describe, it, expect } from 'vitest'
import { levelKey, lastRecordedLevels } from './levels'
import type { CountLine, Visit } from './types'

const visit = (id: string, finalizedAt: number): Visit => ({
  id, runId: 'r1', machineId: 'L7', status: 'finalized', finalizedAt, updatedAt: finalizedAt,
})

const line = (
  visitId: string, slotNumber: number, itemId: string, after: number,
): CountLine => ({
  id: `${visitId}-${slotNumber}-${itemId}`,
  visitId, slotNumber, itemId, before: 0, after, touched: true, updatedAt: 1,
})

describe('levelKey', () => {
  it('joins slot and item', () => {
    expect(levelKey(58, 'coke')).toBe('58:coke')
  })
})

describe('lastRecordedLevels', () => {
  it('returns the after count from the newest visit', () => {
    const history = [
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 8)] },
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3)] },
    ]
    expect(lastRecordedLevels(history).get('58:coke')).toBe(8)
  })

  it('falls back to an older visit for a slot the newest did not cover', () => {
    const history = [
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 8)] },
      { visit: visit('v1', 100), lines: [line('v1', 52, 'sunkist', 1)] },
    ]
    const levels = lastRecordedLevels(history)
    expect(levels.get('58:coke')).toBe(8)
    expect(levels.get('52:sunkist')).toBe(1)
  })

  it('keeps mixed-slot items separate', () => {
    const history = [{
      visit: visit('v1', 100),
      lines: [line('v1', 52, 'sunkist', 3), line('v1', 52, 'fanta', 2)],
    }]
    const levels = lastRecordedLevels(history)
    expect(levels.get('52:sunkist')).toBe(3)
    expect(levels.get('52:fanta')).toBe(2)
  })

  it('returns an empty map for a machine with no history', () => {
    expect(lastRecordedLevels([]).size).toBe(0)
  })
})
