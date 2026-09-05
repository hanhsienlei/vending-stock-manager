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
    expect(bySlot.get(62)).toEqual(['Sour Puss Grape RTD', "Matso's Ginger Beer"])
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

  it('carries the Size column from the transcription verbatim, including the known-wrong 600ml at slot 44', () => {
    const byName = new Map(STARTER_ITEMS.map((i) => [i.name, i.size]))

    expect(byName.get("Smith's Salt & Vinegar Chips")).toBe('27g')
    expect(byName.get('Extra Gum Spearmint')).toBe('ea')
    // Slot 44's Red Bull / Mother pair reads 600ml on the sheet — the
    // colleague's known error, kept as written rather than corrected here.
    expect(byName.get('Red Bull Energy Drink')).toBe('600ml')
    expect(byName.get('Mother Energy Drink')).toBe('600ml')
    // Slot 45's pair reads 500ml, the same kind of odd-but-as-written value.
    expect(byName.get('Red Bull No Sugar')).toBe('500ml')
    expect(byName.get('Mother No Sugar')).toBe('500ml')
    expect(byName.get('Coke')).toBe('375ml')
  })
})

// Review defect #4: nothing previously asserted a single price end to end, and
// name<->slot was only spot-checked for the seven mixed slots. A transposed
// price ($4.50 -> $45.00), a swapped size, or two adjacent single-item rows
// swapped (Sprite/Pepsi Max) all passed the whole suite. This table is typed
// independently from docs/catalogue-transcription.md — not derived from
// STARTER_ITEMS — so it catches exactly that regression class. Verbose on
// purpose: 63 rows, one per slot/item pair (60 items, 3 of which occupy two
// slots each: Nu Pure Water Bottles at 48/49, Coke No Sugar at 56/57, Coke at
// 58/59).
describe('every slot/item pair against the transcription, table-driven', () => {
  const rows: { slot: number; name: string; size: string; price: number }[] = [
    // Tray 10 — chips
    { slot: 10, name: "Smith's Salt & Vinegar Chips", size: '27g', price: 3.5 },
    { slot: 11, name: 'Red Rock Deli Chips Honey Soy Chicken', size: '28g', price: 3.5 },
    { slot: 12, name: 'Natural Con Snakes', size: '190g', price: 7 },
    { slot: 13, name: 'Doritos Cheese Supreme', size: '45g', price: 4 },
    { slot: 14, name: 'Peanut Pretzel Boodles', size: '30g', price: 5 },

    // Tray 20 — sundries
    { slot: 20, name: 'Extra Gum Spearmint', size: 'ea', price: 4 },
    { slot: 21, name: 'Cranberry and Almond Granola Slice', size: 'ea', price: 5 },
    { slot: 22, name: 'Tampon', size: 'ea', price: 9 },
    { slot: 23, name: 'Dove', size: '30g', price: 8 },
    { slot: 24, name: 'Rexona', size: '30g', price: 8 },
    { slot: 25, name: 'Panadol Paracetamol Tablets', size: 'ea', price: 8 },
    { slot: 26, name: 'Ansell L-STY Condom REG', size: 'ea', price: 9 },
    { slot: 27, name: 'Accor Shaving Kit — Wood Midscale', size: 'ea', price: 3.5 },
    { slot: 28, name: 'Accor Dental Kit — Bamboo Generic', size: 'ea', price: 2.5 },
    { slot: 29, name: 'Lemon Slice', size: '25g', price: 3 },

    // Tray 30 — chocolate
    { slot: 30, name: 'Go Natural Almond & Cashew', size: '45g', price: 5 },
    { slot: 31, name: 'Turkish Delight', size: '50g', price: 5 },
    { slot: 32, name: 'Mondelez Cherry Ripe', size: '44g', price: 5 },
    { slot: 33, name: 'Cadbury Dream', size: '50g', price: 5 },
    { slot: 34, name: 'Cadbury Boost', size: '50g', price: 5 },
    { slot: 35, name: 'Snickers', size: '53g', price: 5 },
    { slot: 36, name: 'Mars', size: '47g', price: 5 },
    { slot: 37, name: 'Twix', size: '50g', price: 5 },
    { slot: 38, name: 'KitKat', size: '48g', price: 5 },
    { slot: 39, name: 'Cadbury Picnic', size: '46g', price: 5 },

    // Tray 40 — juice, energy, water
    { slot: 40, name: 'Chicken Noodles Cup', size: '250ml', price: 5 },
    { slot: 41, name: 'Apple Juice', size: '300ml', price: 5.5 },
    { slot: 42, name: 'Orange Juice', size: '250ml', price: 5.5 },
    { slot: 43, name: 'Fuze Peach Lemon Tea', size: '250ml', price: 6 },
    { slot: 44, name: 'Red Bull Energy Drink', size: '600ml', price: 5.5 },
    { slot: 44, name: 'Mother Energy Drink', size: '600ml', price: 5.5 },
    { slot: 45, name: 'Red Bull No Sugar', size: '500ml', price: 5.5 },
    { slot: 45, name: 'Mother No Sugar', size: '500ml', price: 5.5 },
    { slot: 46, name: 'Powerade Blue', size: '500ml', price: 5 },
    { slot: 47, name: 'Nu Pure Sparkling Water', size: '500ml', price: 6 },
    { slot: 48, name: 'Nu Pure Water Bottles', size: '600ml', price: 4 },
    { slot: 49, name: 'Nu Pure Water Bottles', size: '600ml', price: 4 },

    // Tray 50 — cans
    { slot: 50, name: 'Coopers Pale Ale', size: '330ml', price: 8 },
    { slot: 51, name: 'Coopers XPA', size: '330ml', price: 10 },
    { slot: 51, name: 'Prancing Pony XPA', size: '330ml', price: 10 },
    { slot: 52, name: 'Sunkist', size: '375ml', price: 4.5 },
    { slot: 52, name: 'Fanta', size: '375ml', price: 4.5 },
    { slot: 53, name: 'Pepsi', size: '375ml', price: 4.5 },
    { slot: 53, name: 'Kirks Ginger Beer', size: '375ml', price: 4.5 },
    { slot: 54, name: 'Pepsi Max', size: '375ml', price: 4.5 },
    { slot: 55, name: 'Sprite', size: '375ml', price: 4.5 },
    { slot: 56, name: 'Coke No Sugar', size: '375ml', price: 4.5 },
    { slot: 57, name: 'Coke No Sugar', size: '375ml', price: 4.5 },
    { slot: 58, name: 'Coke', size: '375ml', price: 4.5 },
    { slot: 59, name: 'Coke', size: '375ml', price: 4.5 },

    // Tray 60 — alcohol
    { slot: 60, name: 'Hahn Super Dry', size: '375ml', price: 10 },
    { slot: 61, name: 'Spiked Iced Tea Peach RTD', size: '375ml', price: 12 },
    { slot: 62, name: 'Sour Puss Grape RTD', size: '375ml', price: 12 },
    { slot: 62, name: "Matso's Ginger Beer", size: '375ml', price: 12 },
    { slot: 63, name: 'Vodka Cruiser Zero Sugar Mixed Berry', size: '275ml', price: 12 },
    { slot: 63, name: 'Vodka Cruiser Lime', size: '275ml', price: 12 },
    { slot: 63, name: 'Tequila', size: '275ml', price: 12 },
    { slot: 64, name: 'Smirnoff Lime Seltzer', size: '375ml', price: 12 },
    { slot: 65, name: "Gordon's London Dry Gin & Tonic 4.5%", size: '375ml', price: 12 },
    {
      slot: 66,
      name: 'Johnnie Walker Blended Scotch Whisky & Cola (Cube)',
      size: '375ml',
      price: 12,
    },
    {
      slot: 67,
      name: 'Canadian Club Canadian Whiskey & Cola 4.8%',
      size: '375ml',
      price: 12,
    },
    { slot: 68, name: 'Bundaberg Rum & Cola UP 4.6% (Cube)', size: '375ml', price: 12 },
    {
      slot: 69,
      name: 'Jim Beam White Label Bourbon Whiskey & Cola 4.8% (Cube)',
      size: '375ml',
      price: 12,
    },
  ]

  it('has exactly 63 rows — 60 items, 3 of which occupy two slots each', () => {
    expect(rows).toHaveLength(63)
  })

  it.each(rows)('slot $slot — $name', ({ slot, name, size, price }) => {
    const item = STARTER_ITEMS.find((i) => i.name === name && i.slots.includes(slot))
    expect(item, `no STARTER_ITEMS entry named "${name}" placed at slot ${slot}`).toBeTruthy()
    expect(item?.size).toBe(size)
    expect(item?.price).toBe(price)
  })
})
