import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { CountLine, Id, Visit } from '../../domain/types'

export async function openVisit(runId: Id, machineId: Id): Promise<Visit> {
  const existing = await db.visits
    .where('[runId+machineId]')
    .equals([runId, machineId])
    .first()
  if (existing) return existing

  const visit: Visit = {
    id: newId(), runId, machineId, status: 'draft', updatedAt: now(),
  }
  await db.visits.put(visit)
  return visit
}

export function getCountLines(visitId: Id): Promise<CountLine[]> {
  return db.countLines.where('visitId').equals(visitId).toArray()
}

export async function putCountLine(line: CountLine): Promise<void> {
  const visit = await db.visits.get(line.visitId)
  if (!visit) throw new Error(`Unknown visit ${line.visitId}`)
  if (visit.status === 'finalized') {
    throw new Error(`Visit ${line.visitId} is finalized and cannot be modified`)
  }
  await db.countLines.put(line)
}

export async function finalizeVisit(visitId: Id): Promise<Visit> {
  const visit = await db.visits.get(visitId)
  if (!visit) throw new Error(`Unknown visit ${visitId}`)
  const finalized: Visit = {
    ...visit, status: 'finalized', finalizedAt: now(), updatedAt: now(),
  }
  await db.visits.put(finalized)
  return finalized
}

export async function historyForMachine(
  machineId: Id,
): Promise<{ visit: Visit; lines: CountLine[] }[]> {
  const visits = (await db.visits.toArray())
    .filter((v) => v.machineId === machineId && v.status === 'finalized')
    .sort((a, b) => (b.finalizedAt ?? 0) - (a.finalizedAt ?? 0))

  return Promise.all(
    visits.map(async (visit) => ({ visit, lines: await getCountLines(visit.id) })),
  )
}
