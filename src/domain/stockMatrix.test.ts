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
