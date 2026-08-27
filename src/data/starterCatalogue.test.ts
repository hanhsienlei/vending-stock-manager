import { describe, it, expect } from 'vitest'
import { STARTER_ITEMS, STARTER_MACHINE_LEVELS } from './starterCatalogue'

describe('starter catalogue data', () => {
  it('has all 60 items', () => {
    expect(STARTER_ITEMS).toHaveLength(60)
  })

  it('has fifteen machine levels, L2 through L16', () => {
    expect(STARTER_MACHINE_LEVELS).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ])
  })

  it('groups the seven mixed slots by shared slot number', () => {
    const bySlot = new Map<number, string[]>()
    for (const item of STARTER_ITEMS) {
      for (const slot of item.slots) {
        bySlot.set(slot, [...(bySlot.get(slot) ?? []), item.name])
      }
    }

    expect(bySlot.get(44)).toEqual(['Red Bull Energy Drink', 'Mother Energy Drink'])
    expect(bySlot.get(45)).toEqual(['Red Bull No Sugar', 'Mother No Sugar'])
    expect(bySlot.get(51)).toEqual(['Coopers XPA', 'Prancing Pony XPA'])
    expect(bySlot.get(52)).toEqual(['Sunkist', 'Fanta'])
    expect(bySlot.get(53)).toEqual(['Pepsi', 'Kirks Ginger Beer'])
    expect(bySlot.get(62)).toEqual(['Sour Puss Grape RTD', 'Ginger Beer (new)'])
    expect(bySlot.get(63)).toEqual([
      'Vodka Cruiser Zero Sugar Mixed Berry',
      'Vodka Cruiser Lime',
      'Tequila',
    ])
  })

  it('remarks the four Red Bull / Mother items in slots 44 and 45 as unverified', () => {
    const remarked = STARTER_ITEMS.filter((i) => i.remark).map((i) => i.name)
    expect(remarked.sort()).toEqual(
      [
        'Red Bull Energy Drink',
        'Mother Energy Drink',
        'Red Bull No Sugar',
        'Mother No Sugar',
      ].sort(),
    )
  })

  it('has no duplicate item names', () => {
    const names = STARTER_ITEMS.map((i) => i.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
