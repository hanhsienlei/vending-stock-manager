import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, StoreroomBalance, TrolleyLine } from '../../domain/types'

export type TrolleyLoadDraft =
  Pick<TrolleyLine, 'runId' | 'itemId' | 'needed' | 'taken' | 'noneLeftInG'>

/** Every line the trolley carried on one run, load order irrelevant — the
 * screen orders them by the pick list. Indexed lookup on `runId`. */
export function trolleyForRun(runId: Id): Promise<TrolleyLine[]> {
  return db.trolleyLines.where('runId').equals(runId).toArray()
}

/** Every run's lines. The ledger needs them all: `storeroomMovements` filters
 * by item and `ledgerBalance` by timestamp, and a line from a run three weeks
 * ago is still a movement the current anchor may not have superseded. */
export function listTrolleyLines(): Promise<TrolleyLine[]> {
  return db.trolleyLines.toArray()
}

/** Upserts on `(runId, itemId)` — design §5.1: re-typing the taken figure
 * before leaving G corrects the row rather than appending one. This is the
 * one place a correction is an edit rather than an opposing entry, and it
 * differs from `Adjustment` deliberately: an adjustment records a movement
 * that happened, a trolley line records a state that is still true.
 *
 * `None left in G` additionally writes `StoreroomBalance { units: 0 }`
 * (design §3.6) — an ordinary manual count of zero, not a special case inside
 * the balance. **`verifiedAt` is the line's own `loadedAt`, to the
 * millisecond**, and that identity is load-bearing: `ledgerBalance` excludes
 * movements at exactly `verifiedAt`, so the load's own `−taken` is correctly
 * not applied on top of the zero. Calling `setStoreroomBalance` here would
 * stamp its own clock and could land a millisecond earlier, which reads the
 * shelf as `0 − taken`, clamped to 0 — indistinguishable until the next
 * delivery arrives.
 *
 * Both writes go in **one transaction**, following `recordTransfer`: either
 * both land or neither does. A trolley row claiming an empty shelf with the
 * old balance still standing is worse than no row at all. */
export async function recordTrolleyLoad(draft: TrolleyLoadDraft): Promise<TrolleyLine> {
  return db.transaction('rw', db.trolleyLines, db.storeroomBalances, async () => {
    const existing = await db.trolleyLines
      .where('[runId+itemId]')
      .equals([draft.runId, draft.itemId])
      .first()

    const stamp = now()
    const line: TrolleyLine = {
      ...existing,
      ...draft,
      id: existing?.id ?? newId(),
      loadedAt: stamp,
      updatedAt: stamp,
    }

    await db.trolleyLines.put(line)

    if (draft.noneLeftInG) {
      const anchor = await db.storeroomBalances
        .where('itemId').equals(draft.itemId).first()

      const zeroed: StoreroomBalance = {
        id: anchor?.id ?? newId(),
        itemId: draft.itemId,
        units: 0,
        updatedAt: stamp,
        verifiedAt: stamp,
      }
      await db.storeroomBalances.put(zeroed)
    }

    return line
  })
}

/** What came back down. Recorded against the line the run already has — a
 * return with no load is a reconciliation problem, not a new trolley line, and
 * the operator is told rather than having a phantom load invented for them. */
export async function recordTrolleyReturn(
  runId: Id,
  itemId: Id,
  returned: number,
): Promise<TrolleyLine> {
  return db.transaction('rw', db.trolleyLines, async () => {
    const existing = await db.trolleyLines
      .where('[runId+itemId]')
      .equals([runId, itemId])
      .first()

    if (!existing) {
      throw new Error(`No trolley line for ${itemId} on run ${runId}`)
    }

    const stamp = now()
    const line: TrolleyLine = {
      ...existing, returned, returnedAt: stamp, updatedAt: stamp,
    }

    await db.trolleyLines.put(line)
    return line
  })
}
