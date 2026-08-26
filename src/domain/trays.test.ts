import { describe, it, expect } from 'vitest'
import { trayOf, TRAYS, slotsInTray } from './trays'

describe('trayOf', () => {
  it('maps a slot to its tray', () => {
    expect(trayOf(10)).toBe(10)
    expect(trayOf(14)).toBe(10)
    expect(trayOf(35)).toBe(30)
    expect(trayOf(69)).toBe(60)
  })
})

describe('TRAYS', () => {
  it('lists the six physical trays in order', () => {
    expect([...TRAYS]).toEqual([10, 20, 30, 40, 50, 60])
  })
})

describe('slotsInTray', () => {
  it('selects only the slots belonging to the tray, ascending', () => {
    expect(slotsInTray([35, 12, 31, 58, 10], 30)).toEqual([31, 35])
  })

  it('returns an empty array when the tray has no slots', () => {
    expect(slotsInTray([12, 58], 60)).toEqual([])
  })
})
