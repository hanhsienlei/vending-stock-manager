import Dexie, { type EntityTable } from 'dexie'
import type {
  CountLine, Item, ItemPlacement, Machine, Run, SlotConfig, StoreroomBalance, Visit,
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
