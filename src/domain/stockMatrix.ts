import { levelKey } from './levels'
import type { Id, Item } from './types'

export interface MatrixRow {
  /** The slot as locator: `58` for a single-item slot, `52-1` / `52-2` for
   * the two occupants of a mixed one, and `58, 59` for an item that lives in
   * more than one slot — one row still, because it is one item. */
  key: string
  itemId: Id
  itemName: string
  size?: string
  /** Units per supplier carton — the paper sheet's `Package` column. `1` is
   * the placeholder every item was seeded with, and means "not known",
   * which is why the matrix renders it blank rather than as a carton of
   * one. */
  boxSize: number
  /** Units of this item in that machine, summed over every slot it occupies
   * there. */
  perMachine: Map<Id, number>
  storeroom: number
  total: number
  /** What this item's slots hold when every one of them is full: the item's
   * par, times the slots it occupies, times the machines. Par rather than a
   * pinned `SlotConfig` capacity, because this is the operator's own "what
   * should be out there" figure and par is the number they set. An item in
   * two slots is full at twice the par in each machine, which is what keeps
   * it comparable with `total` — that sums the slots too. */
  full: number
  /** `total − full`. Negative is the useful direction: the estate is short by
   * that many units, storeroom included. */
  balance: number
}

export interface StockMatrixInput {
  items: Item[]
  machineIds: Id[]
  /** Per machine: `levelKey(slot, item)` → units currently in that slot. */
  levelsByMachine: Map<Id, Map<string, number>>
  /** Which slots each item occupies, anywhere in the estate. */
  slotsByItem: Map<Id, number[]>
  storeroomOnHand: Map<Id, number>
}

/** The paper sheet's layout: **one row per item**, a column per machine, then
 * the storeroom and a total.
 *
 * One row per item, not per (slot, item): the storeroom holds a quantity of an
 * item, not a quantity per slot, so a row per slot has to either repeat that
 * figure — which is what it did, adding the whole balance into each row's
 * total, reading 124 and 126 for a real holding of 130 — or leave it blank on
 * all but the first, which asks the operator to add the rows up by hand while
 * standing in the storeroom. The `Order` column has to sit beside one honest
 * total, and there is one order per item.
 *
 * An item in several slots therefore lists them all in the `Slot` cell
 * (`58, 59`) and sums its machine columns across them. A mixed slot is still
 * the one thing that splits, and it splits because two *items* share the
 * locator (`52-1 Fanta`, `52-2 Sunkist`), never as a split cell — the
 * operator's reason, from the report notes: you order Fanta, not slot 52. */
export function buildStockMatrix(input: StockMatrixInput): MatrixRow[] {
  const { items, machineIds, levelsByMachine, slotsByItem, storeroomOnHand } = input

  const itemsInSlot = new Map<number, Item[]>()
  for (const item of items) {
    for (const slot of slotsByItem.get(item.id) ?? []) {
      const list = itemsInSlot.get(slot) ?? []
      list.push(item)
      itemsInSlot.set(slot, list)
    }
  }

  // Walking the slots in ascending order, alphabetically within a mixed one,
  // does two jobs at once: it builds each item's locator parts, and it fixes
  // the row order — an item takes the position of its lowest slot, which is
  // where the eye looks for it on the paper sheet.
  const locatorsByItem = new Map<Id, string[]>()
  const rowOrder: Item[] = []

  for (const [slot, occupants] of [...itemsInSlot].sort((a, b) => a[0] - b[0])) {
    const ordered = [...occupants].sort((a, b) => a.name.localeCompare(b.name))

    ordered.forEach((item, index) => {
      const locator = ordered.length > 1 ? `${slot}-${index + 1}` : String(slot)
      const existing = locatorsByItem.get(item.id)
      if (existing) {
        existing.push(locator)
      } else {
        locatorsByItem.set(item.id, [locator])
        rowOrder.push(item)
      }
    })
  }

  return rowOrder.map((item) => {
    const slots = slotsByItem.get(item.id) ?? []
    const perMachine = new Map<Id, number>()
    let inMachines = 0

    for (const machineId of machineIds) {
      const levels = levelsByMachine.get(machineId)
      let units = 0
      for (const slot of slots) units += levels?.get(levelKey(slot, item.id)) ?? 0
      perMachine.set(machineId, units)
      inMachines += units
    }

    const storeroom = storeroomOnHand.get(item.id) ?? 0
    const total = inMachines + storeroom
    const full = item.basePar * slots.length * machineIds.length

    return {
      key: (locatorsByItem.get(item.id) ?? []).join(', '),
      itemId: item.id,
      itemName: item.name,
      size: item.size,
      boxSize: item.boxSize,
      perMachine,
      storeroom,
      total,
      full,
      balance: total - full,
    }
  })
}
