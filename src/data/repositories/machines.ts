import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, Machine } from '../../domain/types'

export function listMachines(): Promise<Machine[]> {
  return db.machines.orderBy('level').toArray()
}

export async function saveMachine(
  draft: Omit<Machine, 'id' | 'updatedAt'> & { id?: Id },
): Promise<Machine> {
  const machine: Machine = { ...draft, id: draft.id ?? newId(), updatedAt: now() }
  await db.machines.put(machine)
  return machine
}

/** Deletes a machine and everything that exists only to describe it: its
 * machine-scoped `ItemPlacement` rows (base placements are estate-wide and
 * are left alone), its `SlotConfig` rows, and any *draft* `Visit` for it
 * along with that visit's `CountLine`s. All in one transaction, so a
 * failure partway leaves nothing removed.
 *
 * Deliberately NOT cascaded: a *finalized* `Visit` and its `CountLine`s.
 * Spec §7 calls a finalized visit immutable — "later corrections are
 * Adjustment records, never edits to history" — and that promise does not
 * carve out an exception for the machine being retired afterwards. A draft
 * is different: spec §7 calls it a draft precisely because it is not yet
 * the historical record, so a draft against a machine that no longer exists
 * has nothing left to become and is cleaned up rather than left stranded. */
export async function deleteMachine(id: Id): Promise<void> {
  await db.transaction(
    'rw', db.machines, db.placements, db.slotConfigs, db.visits, db.countLines,
    async () => {
      await db.machines.delete(id)

      await db.placements
        .filter((p) => p.scope.kind === 'machine' && p.scope.machineId === id)
        .delete()

      await db.slotConfigs.where('machineId').equals(id).delete()

      const draftVisitIds = (await db.visits.where('machineId').equals(id).toArray())
        .filter((v) => v.status === 'draft')
        .map((v) => v.id)

      if (draftVisitIds.length > 0) {
        await db.countLines.where('visitId').anyOf(draftVisitIds).delete()
        await db.visits.bulkDelete(draftVisitIds)
      }
    },
  )
}
