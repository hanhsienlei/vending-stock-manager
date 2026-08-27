import Dexie, { type EntityTable } from 'dexie'
import type {
  Adjustment, CountLine, Item, ItemPlacement, Machine, Run, SlotConfig, StoreroomBalance, Visit,
} from '../domain/types'

export const db = new Dexie('vending-stock-manager') as Dexie & {
  items: EntityTable<Item, 'id'>
  machines: EntityTable<Machine, 'id'>
  placements: EntityTable<ItemPlacement, 'id'>
  slotConfigs: EntityTable<SlotConfig, 'id'>
  runs: EntityTable<Run, 'id'>
  visits: EntityTable<Visit, 'id'>
  countLines: EntityTable<CountLine, 'id'>
  storeroomBalances: EntityTable<StoreroomBalance, 'id'>
  adjustments: EntityTable<Adjustment, 'id'>
}

db.version(1).stores({
  items: 'id, name',
  machines: 'id, level',
  placements: 'id, itemId',
  slotConfigs: 'id, [machineId+slotNumber]',
  runs: 'id, date',
  visits: 'id, runId, [runId+machineId]',
  countLines: 'id, visitId, [visitId+slotNumber]',
})

// v2 — additive, three changes:
//  1a. `countLines` gains `filled`, stored rather than inferred from
//      `after > before` (misclassifies a slot filled while already at
//      capacity). Existing rows have no `filled`; the upgrade derives it
//      with the very inference it replaces, which is exactly what those old
//      rows already meant.
//  1b. `visits` gains a `machineId` index, so `historyForMachine` can query
//      instead of scanning the whole table.
//  1c. New `storeroomBalances` table, one row per item.
// `countLines`/`visits` are redeclared in full (Dexie requires the whole
// index list per table on every version, not a diff) even though
// `countLines`'s indexes are unchanged — `filled` is a stored field, not an
// index.
db.version(2).stores({
  items: 'id, name',
  machines: 'id, level',
  placements: 'id, itemId',
  slotConfigs: 'id, [machineId+slotNumber]',
  runs: 'id, date',
  visits: 'id, runId, [runId+machineId], machineId',
  countLines: 'id, visitId, [visitId+slotNumber]',
  storeroomBalances: 'id, itemId',
}).upgrade(async (tx) => {
  await tx.table('countLines').toCollection().modify((line: CountLine) => {
    if (line.filled === undefined) {
      line.filled = line.after > line.before
    }
  })
})

// v3 — additive, two changes:
//  1. New `adjustments` table (design §4.1). Its location is three flat
//     columns, so every query Phase 2 makes is an index lookup rather than
//     the full scan `ItemPlacement.scope` forces.
//  2. `countLines` gains `price`, the item's price at count time, so a later
//     price change cannot re-price past runs (design §3.6). Existing rows are
//     backfilled from the item's current price — the best figure available,
//     and exactly right for every line recorded before any price moved.
//
// Unlike v2, this migration runs against real data: the first restock run has
// been recorded. Its tests write through the v2 schema before opening v3.
db.version(3).stores({
  items: 'id, name',
  machines: 'id, level',
  placements: 'id, itemId',
  slotConfigs: 'id, [machineId+slotNumber]',
  runs: 'id, date',
  visits: 'id, runId, [runId+machineId], machineId',
  countLines: 'id, visitId, [visitId+slotNumber]',
  storeroomBalances: 'id, itemId',
  adjustments:
    'id, itemId, occurredAt, machineId, transferId, [machineId+slotNumber]',
}).upgrade(async (tx) => {
  // Read every item once rather than per line: a machine's worth of lines all
  // reference the same handful of items, and `modify` runs per row.
  const items = await tx.table('items').toArray()
  const priceById = new Map<string, number>(
    items.map((i: Item) => [i.id, i.price]),
  )

  await tx.table('countLines').toCollection().modify((line: CountLine) => {
    if (line.price !== undefined) return
    // An item deleted since the count has no price to recover. `deleteItem`
    // deliberately leaves CountLine rows alone so past counts are not
    // rewritten, so this is reachable. Zero revenue is the honest answer;
    // the units still count.
    line.price = priceById.get(line.itemId) ?? 0
  })
})
