import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, StoreroomBalance } from '../../domain/types'

export function listStoreroomBalances(): Promise<StoreroomBalance[]> {
  return db.storeroomBalances.toArray()
}

export function getStoreroomBalance(itemId: Id): Promise<StoreroomBalance | undefined> {
  return db.storeroomBalances.where('itemId').equals(itemId).first()
}

/** A manual count: sets the storeroom's units-on-hand for one item to an
 * observed figure, verified right now (spec §6.5 — "a manual count is
 * available at any time and resets the estimate to truth"). Upserts on
 * itemId, same shape as `setSlotConfig` — one row per item, never a second
 * row for a repeat count. */
export async function setStoreroomBalance(itemId: Id, units: number): Promise<StoreroomBalance> {
  return db.transaction('rw', db.storeroomBalances, async () => {
    const existing = await db.storeroomBalances.where('itemId').equals(itemId).first()
    const timestamp = now()

    const balance: StoreroomBalance = {
      id: existing?.id ?? newId(),
      itemId,
      units,
      updatedAt: timestamp,
      verifiedAt: timestamp,
    }

    await db.storeroomBalances.put(balance)
    return balance
  })
}
