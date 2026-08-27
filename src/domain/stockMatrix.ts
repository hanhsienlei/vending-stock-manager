import { levelKey } from './levels'
import type { Id, Item } from './types'

export interface MatrixRow {
  /** The slot as locator: `58` for a single-item slot, `52-1` / `52-2` for a
   * mixed one. */
  key: string
  itemId: Id
  itemName: string
  size?: string
  perMachine: Map<Id, number>
  storeroom: number
  total: number
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

/** The paper sheet's layout: one row per item, a column per machine, then the
 * storeroom and a total.
 *
 * A mixed slot becomes two rows (`52-1 Fanta`, `52-2 Sunkist`), never a split
 * cell. The operator's reason, from the report notes: you order Fanta, not
 * slot 52, so the Order column has to sit beside the thing being ordered — a
 * split cell forces mental arithmetic while standing in the storeroom. */
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

  const rows: MatrixRow[] = []

  for (const [slot, occupants] of [...itemsInSlot].sort((a, b) => a[0] - b[0])) {
    const ordered = [...occupants].sort((a, b) => a.name.localeCompare(b.name))

    ordered.forEach((item, index) => {
      const perMachine = new Map<Id, number>()
      let inMachines = 0

      for (const machineId of machineIds) {
        const units = levelsByMachine.get(machineId)?.get(levelKey(slot, item.id)) ?? 0
        perMachine.set(machineId, units)
        inMachines += units
      }

      const storeroom = storeroomOnHand.get(item.id) ?? 0

      rows.push({
        key: ordered.length > 1 ? `${slot}-${index + 1}` : String(slot),
        itemId: item.id,
        itemName: item.name,
        size: item.size,
        perMachine,
        storeroom,
        total: inMachines + storeroom,
      })
    })
  }

  return rows
}
