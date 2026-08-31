import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { saveItem, listItems } from './items'
import { backfillBoxSizes } from './backfillBoxSizes'
import { PACKAGE_SIZES } from '../packageSizes'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

/** The catalogue was seeded with `boxSize: 1` for every item — a placeholder
 * that was never filled in, so the storeroom's boxes+loose split has never
 * had a real carton size to work with and the report's Box column would read
 * `1` sixty times.
 *
 * The real sizes exist only on the operator's paper stocktake sheets
 * (`docs/user-context/stocktake-sheet-*.heic`). This backfill carries them
 * into a catalogue that already exists on the operator's phone, where
 * re-seeding is not an option: the seed refuses to run once any item is
 * present, by design.
 *
 * The rule that makes it safe to run against live data: it only ever writes
 * to an item still sitting at the placeholder `1`. A size the operator has
 * set by hand is never overwritten. */
describe('backfillBoxSizes', () => {
  it('sets a matched item from the stocktake sheet', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })

    await backfillBoxSizes()

    const [coke] = await listItems()
    expect(coke.boxSize).toBe(24)
  })

  it('never overwrites a size the operator has already set by hand', async () => {
    // 30 is not what the sheet says for Coke (24). It is the operator's own
    // figure, and their figure wins — they have seen the actual carton.
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 30 })

    await backfillBoxSizes()

    const [coke] = await listItems()
    expect(coke.boxSize).toBe(30)
  })

  it('leaves an item the sheet does not cover at the placeholder', async () => {
    // The sheet's Package column is blank for the sundries.
    await saveItem({ name: 'Tampon', price: 3, basePar: 5, boxSize: 1 })

    await backfillBoxSizes()

    const [tampon] = await listItems()
    expect(tampon.boxSize).toBe(1)
  })

  it('reports what it changed and what it could not match', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    await saveItem({ name: 'Tampon', price: 3, basePar: 5, boxSize: 1 })

    const result = await backfillBoxSizes()

    expect(result.updated).toEqual([{ name: 'Coke', boxSize: 24 }])
    expect(result.unmatched).toEqual(['Tampon'])
  })

  it('changes nothing on a second run', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })

    await backfillBoxSizes()
    const second = await backfillBoxSizes()

    expect(second.updated).toEqual([])
    const [coke] = await listItems()
    expect(coke.boxSize).toBe(24)
  })

  it('leaves every other field of the item untouched', async () => {
    await saveItem({
      name: 'Coke', price: 4.5, basePar: 7, boxSize: 1,
      size: '375ml', remark: 'check the date codes',
    })

    await backfillBoxSizes()

    const [coke] = await listItems()
    expect(coke.price).toBe(4.5)
    expect(coke.basePar).toBe(7)
    expect(coke.size).toBe('375ml')
    expect(coke.remark).toBe('check the date codes')
  })
})

describe('PACKAGE_SIZES', () => {
  // Transcribed from the two paper sheets. A wrong figure here feeds the
  // ordering decision, so the table is asserted rather than trusted.
  it('carries the sizes read off the stocktake sheets', () => {
    expect(PACKAGE_SIZES["Smith's Salt & Vinegar Chips"]).toBe(21)
    expect(PACKAGE_SIZES['Cranberry and Almond Granola Slice']).toBe(100)
    expect(PACKAGE_SIZES['Accor Shaving Kit — Wood Midscale']).toBe(200)
    expect(PACKAGE_SIZES['Sunkist']).toBe(30)
    expect(PACKAGE_SIZES['Coke']).toBe(24)
  })

  // Every entry must name an item that actually exists, or the backfill
  // silently does nothing for it and nobody finds out.
  it('names only items that exist in the starter catalogue', async () => {
    const { STARTER_ITEMS } = await import('../starterCatalogue')
    const names = new Set(STARTER_ITEMS.map((i) => i.name))
    const strays = Object.keys(PACKAGE_SIZES).filter((n) => !names.has(n))
    expect(strays).toEqual([])
  })

  it('holds no placeholder sizes — a 1 would be indistinguishable from unset', () => {
    const ones = Object.entries(PACKAGE_SIZES).filter(([, size]) => size <= 1)
    expect(ones).toEqual([])
  })
})
