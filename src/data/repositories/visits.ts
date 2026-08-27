import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { CountLine, Id, Visit } from '../../domain/types'

export async function openVisit(runId: Id, machineId: Id): Promise<Visit> {
  return db.transaction('rw', db.visits, async () => {
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
  })
}

export function getCountLines(visitId: Id): Promise<CountLine[]> {
  return db.countLines.where('visitId').equals(visitId).toArray()
}

/** Spec §7, amended 2026-08-27: finishing a machine is a marker, not a lock.
 * A finalized visit no longer rejects writes — kept here, unused by
 * `putCountLine` / `putCountLines`, for Phase 2, which "must decide how late
 * an edit may arrive before the period it closes is considered settled" and
 * may want a genuine immutability lock on top of the marker. Call this
 * explicitly wherever that lock should apply. */
export function assertVisitNotFinalized(visit: Visit): void {
  if (visit.status === 'finalized') {
    throw new Error(`Visit ${visit.id} is finalized and cannot be modified`)
  }
}

/** Spec §7, amended 2026-08-27: "an edit re-stamps updatedAt." That applied
 * to `finalizeVisit` from the start; a single count-line write (every
 * stepper tap and Fill, via `useCounting`'s `persist`) did not, so an edit
 * made after finishing a machine left `Visit.updatedAt` stale — weaker
 * visit-level traceability than the spec claims, right where it matters most
 * now that a finalized visit can still be edited. Re-stamps the visit
 * regardless of its status, in the same transaction as the line write, so a
 * draft's `updatedAt` also tracks its latest edit rather than only its
 * finalize. Does not touch `status` or `finalizedAt` — an edit is not a
 * re-finish. */
export async function putCountLine(line: CountLine): Promise<void> {
  await db.transaction('rw', db.visits, db.countLines, async () => {
    const visit = await db.visits.get(line.visitId)
    if (!visit) throw new Error(`Unknown visit ${line.visitId}`)

    const existing = (await db.countLines
      .where('[visitId+slotNumber]')
      .equals([line.visitId, line.slotNumber])
      .toArray())
      .find((l) => l.itemId === line.itemId)

    await db.countLines.put({ ...line, id: existing?.id ?? line.id })
    await db.visits.put({ ...visit, updatedAt: now() })
  })
}

/** Upserts a whole machine's worth of count lines in one transaction — one
 * index read for the visit plus a single bulk write, rather than ~54 awaited
 * round trips. Same key as `putCountLine`: an existing row for
 * (visitId, slotNumber, itemId) keeps its id, so re-recording a row the
 * operator already touched updates it rather than duplicating it.
 *
 * Used at finalize, where every slot in the machine is recorded whether it was
 * touched or not, so the next visit always finds a level for every slot and
 * Phase 2's sales residual has an opening and a closing for each. */
export async function putCountLines(lines: CountLine[]): Promise<void> {
  if (lines.length === 0) return

  await db.transaction('rw', db.visits, db.countLines, async () => {
    const visitIds = [...new Set(lines.map((l) => l.visitId))]

    for (const visitId of visitIds) {
      const visit = await db.visits.get(visitId)
      if (!visit) throw new Error(`Unknown visit ${visitId}`)
    }

    const existing = await db.countLines.where('visitId').anyOf(visitIds).toArray()
    const idFor = new Map(
      existing.map((l) => [`${l.visitId}:${l.slotNumber}:${l.itemId}`, l.id]),
    )

    await db.countLines.bulkPut(
      lines.map((line) => ({
        ...line,
        id: idFor.get(`${line.visitId}:${line.slotNumber}:${line.itemId}`) ?? line.id,
      })),
    )
  })
}

/** Always re-stamps `finalizedAt`/`updatedAt`, even when the visit is already
 * finalized — spec §7, amended 2026-08-27: "finalizedAt records that the
 * operator considers the machine done; it does not prevent editing, and an
 * edit re-stamps updatedAt." Re-finishing after an edit must work and record
 * the fact, not silently no-op. */
export async function finalizeVisit(visitId: Id): Promise<Visit> {
  const visit = await db.visits.get(visitId)
  if (!visit) throw new Error(`Unknown visit ${visitId}`)

  const finalized: Visit = {
    ...visit, status: 'finalized', finalizedAt: now(), updatedAt: now(),
  }
  await db.visits.put(finalized)
  return finalized
}

/** Newest-first, bounded. Count lines are only read for the visits that
 * survive the bound — unbounded history would grow at ~5,600 rows per machine
 * per year and is re-read on every screen entry, which spec §8 forbids on the
 * latency-critical path. Four is the window Phase 3's demand rate needs
 * (`mean over the last 4 non-censored periods`), and `lastRecordedLevels`
 * only ever consumes the newest value per key. */
export const HISTORY_LIMIT = 4

export async function historyForMachine(
  machineId: Id,
  limit: number = HISTORY_LIMIT,
): Promise<{ visit: Visit; lines: CountLine[] }[]> {
  const visits = (await db.visits.where('machineId').equals(machineId).toArray())
    .filter((v) => v.status === 'finalized')
    .sort((a, b) => (b.finalizedAt ?? 0) - (a.finalizedAt ?? 0))
    .slice(0, Math.max(0, limit))

  return Promise.all(
    visits.map(async (visit) => ({ visit, lines: await getCountLines(visit.id) })),
  )
}

/** Every visit opened against one run, whatever its status. Used by the
 * machine list to mark which machines are already finished today — an
 * indexed lookup on `runId`, at most fifteen rows, so it costs nothing
 * noticeable next to `listMachines`. */
export function listVisitsForRun(runId: Id): Promise<Visit[]> {
  return db.visits.where('runId').equals(runId).toArray()
}
