import Dexie, { type EntityTable } from 'dexie'
import type {
  CountLine, Item, ItemPlacement, Machine, Run, SlotConfig, Visit,
} from '../domain/types'

export const db = new Dexie('vending-stock-manager') as Dexie & {
  items: EntityTable<Item, 'id'>
  machines: EntityTable<Machine, 'id'>
  placements: EntityTable<ItemPlacement, 'id'>
  slotConfigs: EntityTable<SlotConfig, 'id'>
  runs: EntityTable<Run, 'id'>
  visits: EntityTable<Visit, 'id'>
  countLines: EntityTable<CountLine, 'id'>
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
