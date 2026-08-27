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
  /** The item's price when this line was recorded. Snapshotted so a later
   * price change cannot re-price past runs and break reconciliation against
   * machine takings (design §3.6). */
  price: number
  updatedAt: number
}

export type AdjustmentReason =
  | 'transfer'   // no loss — leaves one location, arrives at another
  | 'expired'    // write-off
  | 'damaged'    // write-off
  | 'missing'    // shrinkage
  | 'delivery'   // the only reason that increases total stock
  | 'miscount'   // a data fix, NOT a stock movement — never enters the residual

export type AdjustmentLocationKind = 'machine' | 'storeroom'

/** A stock movement with a reason, at a machine slot or the storeroom
 * (spec §4.1, §5.3).
 *
 * The location is three flat columns rather than a nested object, and that is
 * deliberate: `ItemPlacement.scope` is nested, cannot be indexed, and forces a
 * full scan on every map resolution — known-gaps.md calls it "the likeliest
 * painful migration in the current schema". This does not repeat it. */
export interface Adjustment {
  id: Id
  itemId: Id
  locationKind: AdjustmentLocationKind
  machineId?: Id
  slotNumber?: number
  reason: AdjustmentReason
  /** Signed, relative to this location: negative leaves, positive arrives. */
  units: number
  /** Links the two rows of one transfer. */
  transferId?: Id
  note?: string
  /** When the adjustment was logged. Set from the clock at write time; there
   * is no field to change it, so nothing can be backdated (design §4.1). */
  occurredAt: number
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
