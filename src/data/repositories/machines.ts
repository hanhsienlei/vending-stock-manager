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
