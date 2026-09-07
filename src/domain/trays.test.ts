import { describe, it, expect } from 'vitest'
import {
  trayOf, TRAYS, slotsInTray, allSlotsInTray, isSlotNumber, parseSlotNumbers, trayLabel,
  trayHeading,
} from './trays'

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

describe('allSlotsInTray', () => {
  // The slot picker (fix-plan item 13) offers exactly these and nothing else,
  // which is what makes an invalid slot number unreachable rather than merely
  // rejected after the fact.
  it('lists the short first tray as 10 to 14', () => {
    expect(allSlotsInTray(10)).toEqual([10, 11, 12, 13, 14])
  })

  it('lists a full tray as its ten slots, ascending', () => {
    expect(allSlotsInTray(50)).toEqual([50, 51, 52, 53, 54, 55, 56, 57, 58, 59])
  })

  it('agrees with isSlotNumber across every tray', () => {
    const offered = TRAYS.flatMap(allSlotsInTray)
    expect(offered.filter((s) => !isSlotNumber(s))).toEqual([])
    expect(offered).toHaveLength(55)
  })

  it('has no slots for a number that is not a tray', () => {
    expect(allSlotsInTray(70)).toEqual([])
  })
})

describe('isSlotNumber', () => {
  it('accepts every physical slot number', () => {
    const physical = [10, 11, 12, 13, 14, 20, 29, 30, 39, 40, 49, 50, 59, 60, 69]
    expect(physical.filter((s) => !isSlotNumber(s))).toEqual([])
  })

  it('rejects numbers outside the trays', () => {
    expect(isSlotNumber(9)).toBe(false)
    expect(isSlotNumber(70)).toBe(false)
    expect(isSlotNumber(0)).toBe(false)
    expect(isSlotNumber(-58)).toBe(false)
    expect(isSlotNumber(580)).toBe(false)
  })

  it('rejects the short first tray beyond 14', () => {
    expect(isSlotNumber(15)).toBe(false)
    expect(isSlotNumber(19)).toBe(false)
  })

  it('rejects non-integers', () => {
    expect(isSlotNumber(58.5)).toBe(false)
    expect(isSlotNumber(Number.NaN)).toBe(false)
  })
})

describe('trayLabel', () => {
  // Physically these are the first through sixth tray; 10/20/…/60 are
  // slot-number prefixes, not tray names
  // (devs/debug/tray-name-should-be-tray1-tray2-etc.png). Display only —
  // slot numbers themselves stay 10–69 everywhere.
  it('reads the six physical trays as Tray 1 through Tray 6', () => {
    expect(TRAYS.map(trayLabel)).toEqual([
      'Tray 1', 'Tray 2', 'Tray 3', 'Tray 4', 'Tray 5', 'Tray 6',
    ])
  })
})

describe('parseSlotNumbers', () => {
  it('reads a comma-separated list, sorted and de-duplicated', () => {
    expect(parseSlotNumbers('59, 58, 58')).toEqual({ slots: [58, 59], invalid: [] })
  })

  it('tolerates spacing and a trailing comma', () => {
    expect(parseSlotNumbers(' 58 ,59, ')).toEqual({ slots: [58, 59], invalid: [] })
  })

  it('reads an empty string as no slots', () => {
    expect(parseSlotNumbers('   ')).toEqual({ slots: [], invalid: [] })
  })

  it('reports entries that are not physical slot numbers', () => {
    expect(parseSlotNumbers('58, 99, cola')).toEqual({
      slots: [58], invalid: ['99', 'cola'],
    })
  })
})

describe('trayHeading', () => {
  it('names the tray and its category word', () => {
    expect(trayHeading(10)).toBe('TRAY 1 · CHIPS')
    expect(trayHeading(30)).toBe('TRAY 3 · CHOCOLATE')
    expect(trayHeading(60)).toBe('TRAY 6 · ALCOHOL')
  })

  it('falls back to the bare tray label where there is no category word', () => {
    expect(trayHeading(70)).toBe('TRAY 7')
  })
})
