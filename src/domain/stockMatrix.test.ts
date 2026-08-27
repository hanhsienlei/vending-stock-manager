import { describe, it, expect } from 'vitest'
import { buildStockMatrix } from './stockMatrix'
import type { Item } from './types'

const item = (id: string, name: string, size?: string): Item => ({
  id, name, price: 4.5, basePar: 5, boxSize: 1, size, updatedAt: 1,
})

describe('buildStockMatrix', () => {
  it('gives a single-item slot an unsuffixed key', () => {
    const [row] = buildStockMatrix({
      items: [item('coke', 'Coke')],
      machineIds: ['L7'],
      levelsByMachine: new Map([['L7', new Map([['58:coke', 4]])]]),
      slotsByItem: new Map([['coke', [58]]]),
      storeroomOnHand: new Map([['coke', 100]]),
    })

    expect(row.key).toBe('58')
    expect(row.perMachine.get('L7')).toBe(4)
  })

  // The notes' decision: you order Fanta, not slot 52, so the row has to sit
  // beside the thing being ordered — never a split cell.
  it('splits a mixed slot into 52-1 and 52-2, one row each', () => {
    const rows = buildStockMatrix({
      items: [item('sunkist', 'Sunkist'), item('fanta', 'Fanta')],
      machineIds: ['L7'],
      levelsByMachine: new Map([
        ['L7', new Map([['52:sunkist', 3], ['52:fanta', 2]])],
      ]),
      slotsByItem: new Map([['sunkist', [52]], ['fanta', [52]]]),
      storeroomOnHand: new Map(),
    })

    expect(rows.map((r) => r.key)).toEqual(['52-1', '52-2'])
    expect(rows.map((r) => r.itemName)).toEqual(['Fanta', 'Sunkist'])
  })

  // `starterCatalogue` seeds three items that live in two slots each — Nu
  // Pure Water 48/49, Coke No Sugar 56/57, Coke 58/59. One row per
  // (slot, item) gave EACH row the item's entire storeroom balance and added
  // it into that row's total, so a Coke holding of 120 at G plus 4 in slot 58
  // and 6 in slot 59 read as GF 120 twice, and totals of 124 and 126, for a
  // real holding of 130. This is the sheet the supplier order is written
  // against.
  it('gives an item in two slots one row, counting its storeroom stock once', () => {
    const rows = buildStockMatrix({
      items: [item('coke', 'Coke')],
      machineIds: ['L7'],
      levelsByMachine: new Map([
        ['L7', new Map([['58:coke', 4], ['59:coke', 6]])],
      ]),
      slotsByItem: new Map([['coke', [58, 59]]]),
      storeroomOnHand: new Map([['coke', 120]]),
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('58, 59')
    expect(rows[0].perMachine.get('L7')).toBe(10)
    expect(rows[0].storeroom).toBe(120)
    expect(rows[0].total).toBe(130)
  })

  // The one splitting rule stays what the notes specify: a mixed slot, where
  // two different items share the locator — and each of those is still one
  // row, because each is one item.
  it('keeps a two-slot item on one row even when one of those slots is mixed', () => {
    const rows = buildStockMatrix({
      items: [item('coke', 'Coke'), item('fanta', 'Fanta')],
      machineIds: ['L7'],
      levelsByMachine: new Map([
        ['L7', new Map([['52:coke', 1], ['52:fanta', 2], ['58:coke', 3]])],
      ]),
      slotsByItem: new Map([['coke', [52, 58]], ['fanta', [52]]]),
      storeroomOnHand: new Map([['coke', 100]]),
    })

    expect(rows.map((r) => r.key)).toEqual(['52-1, 58', '52-2'])
    expect(rows[0].perMachine.get('L7')).toBe(4)
    expect(rows[0].total).toBe(104)
  })

  it('totals the machines plus the storeroom', () => {
    const [row] = buildStockMatrix({
      items: [item('coke', 'Coke')],
      machineIds: ['L2', 'L7'],
      levelsByMachine: new Map([
        ['L2', new Map([['58:coke', 3]])],
        ['L7', new Map([['58:coke', 4]])],
      ]),
      slotsByItem: new Map([['coke', [58]]]),
      storeroomOnHand: new Map([['coke', 100]]),
    })

    expect(row.storeroom).toBe(100)
    expect(row.total).toBe(107)
  })

  it('reads a machine that has never counted the slot as zero, not missing', () => {
    const [row] = buildStockMatrix({
      items: [item('coke', 'Coke')],
      machineIds: ['L2', 'L7'],
      levelsByMachine: new Map([['L7', new Map([['58:coke', 4]])]]),
      slotsByItem: new Map([['coke', [58]]]),
      storeroomOnHand: new Map(),
    })

    expect(row.perMachine.get('L2')).toBe(0)
    expect(row.total).toBe(4)
  })

  it('carries the size through for the Qty column', () => {
    const [row] = buildStockMatrix({
      items: [item('coke', 'Coke', '375ml')],
      machineIds: ['L7'],
      levelsByMachine: new Map(),
      slotsByItem: new Map([['coke', [58]]]),
      storeroomOnHand: new Map(),
    })

    expect(row.size).toBe('375ml')
  })

  it('omits an item that is stocked nowhere', () => {
    expect(buildStockMatrix({
      items: [item('coke', 'Coke')],
      machineIds: ['L7'],
      levelsByMachine: new Map(),
      slotsByItem: new Map(),
      storeroomOnHand: new Map(),
    })).toEqual([])
  })
})
