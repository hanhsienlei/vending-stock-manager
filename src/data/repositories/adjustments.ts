import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Adjustment, Id } from '../../domain/types'

export type AdjustmentDraft =
  Omit<Adjustment, 'id' | 'occurredAt' | 'updatedAt' | 'transferId'>

export type AdjustmentLocation =
  | { kind: 'storeroom' }
  | { kind: 'machine'; machineId: Id; slotNumber: number }

/** `occurredAt` is stamped here, from the clock, and is never taken from the
 * caller — design §4.1. The cost, recorded there: nothing can be backdated. */
export async function recordAdjustment(draft: AdjustmentDraft): Promise<Adjustment> {
  const stamp = now()
  const adjustment: Adjustment = {
    ...draft, id: newId(), occurredAt: stamp, updatedAt: stamp,
  }
  await db.adjustments.put(adjustment)
  return adjustment
}

function columnsFor(location: AdjustmentLocation) {
  return location.kind === 'storeroom'
    ? { locationKind: 'storeroom' as const }
    : {
        locationKind: 'machine' as const,
        machineId: location.machineId,
        slotNumber: location.slotNumber,
      }
}

function sameLocation(a: AdjustmentLocation, b: AdjustmentLocation): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'storeroom' || b.kind === 'storeroom') return true
  return a.machineId === b.machineId && a.slotNumber === b.slotNumber
}

export interface TransferParams {
  itemId: Id
  /** Positive magnitude. The signs are applied here, one per side. */
  units: number
  from: AdjustmentLocation
  to: AdjustmentLocation
  note?: string
}

/** Spec §5.3: "A transfer is a single action that updates both locations
 * atomically." One `bulkPut` inside one transaction, so a failure leaves
 * neither row — a half-written transfer is stock that left one place and
 * arrived nowhere, which the residual would silently book as shrinkage. */
export async function recordTransfer(
  params: TransferParams,
): Promise<[Adjustment, Adjustment]> {
  const { itemId, units, from, to, note } = params

  if (!Number.isFinite(units) || units < 1) {
    throw new Error('A transfer must move at least one unit')
  }
  if (sameLocation(from, to)) {
    throw new Error('A transfer must not start and end at the same location')
  }

  const stamp = now()
  const transferId = newId()
  const base = { itemId, reason: 'transfer' as const, transferId, note, occurredAt: stamp, updatedAt: stamp }

  const out: Adjustment = { ...base, ...columnsFor(from), id: newId(), units: -units }
  const into: Adjustment = { ...base, ...columnsFor(to), id: newId(), units }

  await db.transaction('rw', db.adjustments, async () => {
    await db.adjustments.bulkPut([out, into])
  })

  return [out, into]
}

export function listAdjustments(): Promise<Adjustment[]> {
  return db.adjustments.toArray()
}

export function adjustmentsForMachine(machineId: Id): Promise<Adjustment[]> {
  return db.adjustments.where('machineId').equals(machineId).toArray()
}

/** `locationKind` is not indexed — a storeroom row has no `machineId`, and
 * IndexedDB omits rows whose indexed key is undefined, so filtering the small
 * table in memory is simpler than a second index that only ever holds two
 * distinct values. */
export async function storeroomAdjustments(): Promise<Adjustment[]> {
  const all = await db.adjustments.toArray()
  return all.filter((a) => a.locationKind === 'storeroom')
}
