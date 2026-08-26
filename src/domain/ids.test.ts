import { describe, it, expect } from 'vitest'
import { newId, now } from './ids'

describe('newId', () => {
  it('returns a distinct string each call', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()))
    expect(ids.size).toBe(1000)
  })

  it('returns a non-empty string', () => {
    expect(typeof newId()).toBe('string')
    expect(newId().length).toBeGreaterThan(10)
  })
})

describe('now', () => {
  it('returns epoch milliseconds', () => {
    const t = now()
    expect(Number.isInteger(t)).toBe(true)
    expect(t).toBeGreaterThan(1_700_000_000_000)
  })
})
