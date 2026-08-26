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

export async function deleteItem(id: Id): Promise<void> {
  await db.items.delete(id)
}
