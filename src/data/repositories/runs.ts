import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, Run } from '../../domain/types'

export async function createRun(date: string): Promise<Run> {
  const stamp = now()
  const run: Run = { id: newId(), date, createdAt: stamp, updatedAt: stamp }
  await db.runs.put(run)
  return run
}

/** The only safe way to start a day's run from the UI. Check-then-act across
 * two awaited round trips (list, then create) lets a double-tap open two runs
 * for the same date, splitting one day's fifteen visits across both — the
 * `date` index is not unique, so nothing downstream catches it. One `rw`
 * transaction over `runs` makes the lookup and the insert atomic. */
export async function getOrCreateRun(date: string): Promise<Run> {
  return db.transaction('rw', db.runs, async () => {
    const existing = await db.runs.where('date').equals(date).first()
    if (existing) return existing

    const stamp = now()
    const run: Run = { id: newId(), date, createdAt: stamp, updatedAt: stamp }
    await db.runs.put(run)
    return run
  })
}

export async function listRuns(): Promise<Run[]> {
  const runs = await db.runs.toArray()
  return runs.sort((a, b) => b.date.localeCompare(a.date))
}

export function getRun(id: Id): Promise<Run | undefined> {
  return db.runs.get(id)
}
