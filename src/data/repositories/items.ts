import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, Item } from '../../domain/types'

export function listItems(): Promise<Item[]> {
  return db.items.orderBy('name').toArray()
}

export function getItem(id: Id): Promise<Item | undefined> {
  return db.items.get(id)
}

export async function saveItem(
  draft: Omit<Item, 'id' | 'updatedAt'> & { id?: Id },
): Promise<Item> {
  const item: Item = { ...draft, id: draft.id ?? newId(), updatedAt: now() }
  await db.items.put(item)
  return item
}

/** Deletes an item and everything that exists only to describe where it
 * lives: its `ItemPlacement` rows (base and every machine override), its
 * itemId in any `SlotConfig.accepts` preference list (the config row itself
 * stays — capacity is physical and shared with whatever else is in the
 * slot), and its `storeroomBalances` row. All in one transaction, so a
 * failure partway leaves nothing removed rather than a half-deleted item.
 *
 * Deliberately NOT cascaded: `CountLine` rows. A finalized visit is
 * immutable and its `CountLine`s are the historical record spec §7 promises
 * ("later corrections are Adjustment records, never edits to history"), and
 * Phase 2's sales reconciliation (spec §1, §3.3) reads that record. Deleting
 * an item from the catalogue removes it from *future* counts; it must not
 * rewrite what it actually sold in the past. A dangling itemId left in old
 * history is inert: `resolveMachineMap` already resolves a machine's current
 * map by walking the live item list (see `domain/placement.ts` — a
 * placement or SlotConfig entry for an item that no longer exists is simply
 * never reached), and every place the UI resolves an item name already
 * tolerates a miss (`items.get(id)?.name`). */
export async function deleteItem(id: Id): Promise<void> {
  await db.transaction(
    'rw', db.items, db.placements, db.slotConfigs, db.storeroomBalances,
    async () => {
      await db.items.delete(id)
      await db.placements.where('itemId').equals(id).delete()
      await db.slotConfigs
        .filter((config) => config.accepts.includes(id))
        .modify((config) => {
          config.accepts = config.accepts.filter((itemId) => itemId !== id)
          config.updatedAt = now()
        })
      await db.storeroomBalances.where('itemId').equals(id).delete()
    },
  )
}
