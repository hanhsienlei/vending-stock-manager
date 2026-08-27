import { db } from '../db'
import { salesForPeriod } from '../../domain/sales'
import type { SalesLine, VisitRecord } from '../../domain/sales'
import type { Id, Visit } from '../../domain/types'

export interface PeriodReport {
  runId: Id
  runDate: string
  machineId: Id
  visit: Visit
  /** The visit was edited after its period had already closed (design §3.2).
   * Derived from timestamps already stored — no extra state. */
  editedLate: boolean
  lines: SalesLine[]
}

/** The only place that knows a period spans two visits.
 *
 * A period is bounded by two consecutive finalized visits to one machine and
 * is attributed to the run of its **closing** visit (design §5.1). That makes
 * a run and a date range the same operation — a run is a range covering one
 * date — and means a machine skipped in a run contributes nothing to it rather
 * than a double-length period. */
export async function salesForRange(
  startDate: string,
  endDate: string,
): Promise<PeriodReport[]> {
  const [runs, visits, adjustments] = await Promise.all([
    db.runs.toArray(),
    db.visits.toArray(),
    db.adjustments.toArray(),
  ])

  const runById = new Map(runs.map((r) => [r.id, r]))

  // Sorted primarily by the run's date, not `finalizedAt` alone: Dexie
  // returns rows in primary-key order, not insertion order, so two visits
  // finalized in the same millisecond (routine with fast, scripted writes)
  // would otherwise land in an arbitrary relative order and could get paired
  // backwards below. A machine has at most one visit per run, so its date is
  // the true chronology; `finalizedAt` only breaks a same-date tie.
  const finalized = visits
    .filter((v) => v.status === 'finalized')
    .sort((a, b) => {
      const dateA = runById.get(a.runId)?.date ?? ''
      const dateB = runById.get(b.runId)?.date ?? ''
      return dateA.localeCompare(dateB) || (a.finalizedAt ?? 0) - (b.finalizedAt ?? 0)
    })

  // `nextFor` is `previousFor` inverted, built in the same date-ordered pass
  // rather than by re-scanning on raw `finalizedAt` — the same tie above
  // would otherwise stop `wasEditedLate` from ever finding "the next visit"
  // for a machine whose two periods happened to finalize in the same
  // millisecond.
  const previousFor = new Map<Id, Visit>()
  const nextFor = new Map<Id, Visit>()
  const seenPerMachine = new Map<Id, Visit>()
  for (const v of finalized) {
    const prior = seenPerMachine.get(v.machineId)
    if (prior) {
      previousFor.set(v.id, prior)
      nextFor.set(prior.id, v)
    }
    seenPerMachine.set(v.machineId, v)
  }

  const inRange = finalized.filter((v) => {
    const date = runById.get(v.runId)?.date
    return date !== undefined && date >= startDate && date <= endDate
  })

  const adjustmentsByMachine = new Map<Id, typeof adjustments>()
  for (const a of adjustments) {
    if (!a.machineId) continue
    const list = adjustmentsByMachine.get(a.machineId) ?? []
    list.push(a)
    adjustmentsByMachine.set(a.machineId, list)
  }

  const reports = await Promise.all(inRange.map(async (visit) => {
    const previous = previousFor.get(visit.id)
    const [lines, previousLines] = await Promise.all([
      linesFor(visit.id),
      previous ? linesFor(previous.id) : Promise.resolve([]),
    ])

    const previousRecord: VisitRecord | null =
      previous ? { visit: previous, lines: previousLines } : null

    return {
      runId: visit.runId,
      runDate: runById.get(visit.runId)?.date ?? '',
      machineId: visit.machineId,
      visit,
      editedLate: wasEditedLate(visit, nextFor.get(visit.id)),
      lines: salesForPeriod(
        previousRecord,
        { visit, lines },
        adjustmentsByMachine.get(visit.machineId) ?? [],
      ),
    }
  }))

  return reports.sort(
    (a, b) => a.runDate.localeCompare(b.runDate) || a.machineId.localeCompare(b.machineId),
  )
}

export async function salesForRun(runId: Id): Promise<PeriodReport[]> {
  const run = await db.runs.get(runId)
  if (!run) return []
  return salesForRange(run.date, run.date)
}

function linesFor(visitId: Id) {
  return db.countLines.where('visitId').equals(visitId).toArray()
}

/** The period closed when the machine's next visit was finalized. An edit
 * landing after that arrived too late to be part of the count it changes. */
function wasEditedLate(visit: Visit, next: Visit | undefined): boolean {
  if (!next) return false
  return visit.updatedAt > (next.finalizedAt ?? 0)
}
