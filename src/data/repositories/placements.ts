import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, ItemPlacement, PlacementScope } from '../../domain/types'

export function listPlacements(): Promise<ItemPlacement[]> {
  return db.placements.toArray()
}

function sameScope(a: PlacementScope, b: PlacementScope): boolean {
  if (a.kind === 'base' && b.kind === 'base') return true
  return a.kind === 'machine' && b.kind === 'machine' && a.machineId === b.machineId
}

export async function setPlacement(
  itemId: Id,
  scope: PlacementScope,
  slots: number[],
): Promise<ItemPlacement> {
  const existing = (await db.placements.where('itemId').equals(itemId).toArray())
    .find((p) => sameScope(p.scope, scope))

  const placement: ItemPlacement = {
    id: existing?.id ?? newId(),
    itemId,
    scope,
    slots: [...slots].sort((a, b) => a - b),
    updatedAt: now(),
  }

  await db.placements.put(placement)
  return placement
}
