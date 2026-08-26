import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, ItemPlacement, PlacementScope } from '../../domain/types'

export function listPlacements(): Promise<ItemPlacement[]> {
  return db.placements.toArray()
}

/** The item's placement across every machine, as set from the item screen. */
export async function getBasePlacement(itemId: Id): Promise<ItemPlacement | undefined> {
  const forItem = await db.placements.where('itemId').equals(itemId).toArray()
  return forItem.find((p) => p.scope.kind === 'base')
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
  return db.transaction('rw', db.placements, async () => {
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
  })
}
