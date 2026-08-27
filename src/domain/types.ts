export type Id = string

export interface Item {
  id: Id
  name: string
  price: number       // dollars, e.g. 4.5
  basePar: number     // operator-set; seeds SlotConfig.capacity on first assignment
  boxSize: number     // units per supplier box; used from Phase 2
  size?: string        // optional display label, e.g. "375ml", "27g" — not computed with
  remark?: string      // optional free-text note on the catalogue entry itself
  updatedAt: number
}

export interface Machine {
  id: Id
  label: string       // e.g. "Lift lobby"
  level: number       // 2..16 — orders the walk
  updatedAt: number
}

export type PlacementScope =
  | { kind: 'base' }
  | { kind: 'machine'; machineId: Id }

export interface ItemPlacement {
  id: Id
  itemId: Id
  scope: PlacementScope
  slots: number[]     // empty array = explicitly not stocked
  updatedAt: number
}

export interface SlotConfig {
  id: Id
  machineId: Id
  slotNumber: number
  capacity: number    // operator-set; physical depth, shared across a mixed slot
  accepts: Id[]       // itemIds in preference order
  updatedAt: number
}

/** A slot of one machine, after base/override resolution. */
export interface ResolvedSlot {
  slotNumber: number
  capacity: number
  accepts: Id[]       // ordered, always at least one entry
}

export type MachineMap = ResolvedSlot[]   // ascending by slotNumber

export interface Run {
  id: Id
  date: string        // ISO yyyy-mm-dd
  createdAt: number
  updatedAt: number
}

export type VisitStatus = 'draft' | 'finalized'

export interface Visit {
  id: Id
  runId: Id
  machineId: Id
  status: VisitStatus
  finalizedAt?: number
  updatedAt: number
}

export interface CountLine {
  id: Id
  visitId: Id
  slotNumber: number
  itemId: Id
  before: number
  after: number
  touched: boolean    // true once the operator alters `before`
  filled: boolean     // true once Fill has been tapped for this slot; shared
                       // by every line of the slot (mild denormalisation)
  updatedAt: number
}

/** Per item: units on hand at the storeroom, and when that figure was last
 * confirmed by an actual count (spec §6.5). One row per item. */
export interface StoreroomBalance {
  id: Id
  itemId: Id
  units: number
  updatedAt: number
  verifiedAt: number
}
