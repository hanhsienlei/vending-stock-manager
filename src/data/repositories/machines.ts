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

// `deleteMachine` was removed 2026-08-27, an operator decision after the
// first device test (docs/fix-plan-2026-08-27.md #7,
// devs/debug/should-not-allow-deleting-machines.png): the roster is fixed at
// fifteen machines, created once by the seed, and the delete affordance sat
// next to the "start count" tap target with no undo. There is no remaining
// caller. If a genuine admin need for it resurfaces, re-derive it from
// `deleteItem`'s cascade pattern in this file's git history rather than
// re-wiring a UI button to it without this context.
