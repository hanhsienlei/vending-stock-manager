import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, Run } from '../../domain/types'

export async function createRun(date: string): Promise<Run> {
  const stamp = now()
  const run: Run = { id: newId(), date, createdAt: stamp, updatedAt: stamp }
  await db.runs.put(run)
  return run
}

export async function listRuns(): Promise<Run[]> {
  const runs = await db.runs.toArray()
  return runs.sort((a, b) => b.date.localeCompare(a.date))
}

export function getRun(id: Id): Promise<Run | undefined> {
  return db.runs.get(id)
}
