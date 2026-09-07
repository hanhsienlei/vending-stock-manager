import { db } from '../db'
import { listItems } from './items'
import { listMachines } from './machines'
import { listPlacements } from './placements'
import { listSlotConfigs } from './slotConfigs'
import { historyForMachine } from './visits'
import { daysBetween } from '../../domain/date'
import { slotNeed, type SlotNeed } from '../../domain/forecast'
import { levelKey } from '../../domain/levels'
import { resolveMachineMap } from '../../domain/placement'
import { demandRate, RATE_WINDOW, type DemandRate } from '../../domain/rate'
import { salesForPeriod } from '../../domain/sales'
import { slotPeriods, type SlotPeriod } from '../../domain/slotPeriods'
import type { Adjustment, CountLine, Id, Run, Visit } from '../../domain/types'

/** Twelve finalized visits per machine — about six weeks at a Tue/Fri
 * cadence, bounding eleven candidate periods in which to find the four usable
 * ones the rate window wants (design §6.4).
 *
 * `HISTORY_LIMIT = 4` in `visits.ts` used to claim four was "the window Phase
 * 3's demand rate needs". **It is off by one before censoring is counted at
 * all**: a period is bounded by two visits, so four visits bound three
 * periods, and any censored period pushes the search back further still. That
 * comment is corrected rather than the constant changed — `HISTORY_LIMIT`'s
 * real job is the counting screen's carry-forward, which is unaffected and
 * which is on the latency-critical path this window is not.
 *
 * A slot that cannot find two usable periods in six weeks has no rate, which
 * is the honest answer for a slot that has been dry or unreconciled that
 * long. */
export const RATE_SEARCH_VISITS = 12

/** One slot's need, with everything the load screen must print beside it.
 *
 * `rateDetail` is carried whole rather than reduced to a number because spec
 * §6.1's argument for a plain mean is that the operator has to be able to
 * check it: the units, the days, the periods used and the ones skipped are
 * the check. `itemIds` is the slot's `accepts` in preference order, which is
 * what `buildPickList` resolves the need against.
 *
 * `level` and `unmoved` are the two inputs `buildPickList` requires that a
 * `SlotNeed` cannot carry — a need knows its machine's id, not its floor, and
 * nothing outside this module holds the period history. **Both are supplied
 * here rather than assembled at the screen, and neither is optional**: an
 * omitted `unmovedSlots` reads as "nothing is quiet", which is a wrong answer
 * wearing the clothes of a missing one. */
export interface ForecastRow extends SlotNeed {
  rateDetail: DemandRate
  itemIds: Id[]
  /** The machine's floor level — the walk order, for `buildPickList` and for
   * allocation's tiebreak. */
  level: number
  /** The slot's total level has not moved across the rate window: design
   * §4.4's other half, and useless without the rate of zero beside it. */
  unmoved: boolean
}

/** Every slot in the estate, with what it is expected to want on
 * `plannedDate` — the whole input to the pick list.
 *
 * The only place that knows how far back the rate looks. Fifteen machines ×
 * twelve visits × ~54 slots is a few thousand rows, read once. It runs on the
 * load screen, which spec §7 calls unhurried desk work at G, and never during
 * the walk (spec §8.1: "there are no queries at all during counting").
 *
 * Reads levels, run dates and adjustments — never `CountLine.touched`, which
 * is untrustworthy on every visit finalized on or before 2026-09-04 (design
 * §3.1, and `purity.test.ts` fails the build on it in the domain layer). */
export async function forecastForRun(plannedDate: string): Promise<ForecastRow[]> {
  const [items, machines, placements, slotConfigs, runs, adjustments] =
    await Promise.all([
      listItems(),
      listMachines(),
      listPlacements(),
      listSlotConfigs(),
      db.runs.toArray(),
      db.adjustments.toArray(),
    ])

  const runById = new Map(runs.map((r) => [r.id, r]))
  const adjustmentsByMachine = new Map<Id, Adjustment[]>()
  for (const a of adjustments) {
    if (!a.machineId) continue
    const list = adjustmentsByMachine.get(a.machineId) ?? []
    list.push(a)
    adjustmentsByMachine.set(a.machineId, list)
  }

  const perMachine = await Promise.all(machines.map(async (machine) => {
    const map = resolveMachineMap(machine.id, items, placements, slotConfigs)
    if (map.length === 0) return []

    // Newest first. `historyForMachine` bounds the read; this re-sorts it on
    // the run calendar, which is what actually orders periods — `finalizedAt`
    // is re-stamped by a late edit, and two visits finalized in the same
    // millisecond (routine with scripted writes) would otherwise pair
    // backwards. `salesForRange` sorts the same way, for the same reason.
    const history = sortByRunDate(
      await historyForMachine(machine.id, RATE_SEARCH_VISITS),
      runById,
    )

    const periodsBySlot = ratePeriods(
      machine.id, history, runById, adjustmentsByMachine.get(machine.id) ?? [],
    )
    const levels = lastSlotTotals(history)
    const still = stillSlots(history)

    const lastRunDate = history[0] ? runDateOf(history[0].visit, runById) : null
    // No visit at all is not "zero days ago": with no rate there is nothing
    // to multiply the span by, and the fallback need is the whole slot.
    const daysSince = lastRunDate ? daysBetween(lastRunDate, plannedDate) : 0

    return map.map((slot): ForecastRow => {
      const periods = periodsBySlot.get(slot.slotNumber) ?? []
      const rateDetail = demandRate(periods)

      return {
        ...slotNeed({
          machineId: machine.id,
          slotNumber: slot.slotNumber,
          capacity: slot.capacity,
          lastLevel: levels.get(slot.slotNumber) ?? 0,
          rate: rateDetail.rate,
          daysSince,
          // The newest period, usable or not: a slot found empty last visit
          // has proven unmet demand whether or not its numbers reconciled.
          ranDryLastPeriod: periods[0]?.closingTotal === 0,
        }),
        rateDetail,
        itemIds: slot.accepts,
        level: machine.level,
        unmoved: still.has(slot.slotNumber),
      }
    })
  }))

  // Walk order — machine level, then slot number — the order the operator
  // physically meets the slots, and the order `buildPickList` re-establishes.
  const byLevel = new Map(machines.map((m) => [m.id, m.level]))
  return perMachine.flat().sort((a, b) =>
    (byLevel.get(a.machineId) ?? 0) - (byLevel.get(b.machineId) ?? 0) ||
    a.machineId.localeCompare(b.machineId) ||
    a.slotNumber - b.slotNumber)
}

type VisitRecord = { visit: Visit; lines: CountLine[] }

function runDateOf(visit: Visit, runById: Map<Id, Run>): string {
  return runById.get(visit.runId)?.date ?? ''
}

function sortByRunDate(
  history: VisitRecord[],
  runById: Map<Id, Run>,
): VisitRecord[] {
  return [...history].sort((a, b) =>
    runDateOf(b.visit, runById).localeCompare(runDateOf(a.visit, runById)) ||
    (b.visit.finalizedAt ?? 0) - (a.visit.finalizedAt ?? 0))
}

/** Pair consecutive visits into periods and aggregate each to the slot,
 * newest first — the order `demandRate` requires, since only the caller knows
 * the run calendar.
 *
 * The pairing is `salesForRange`'s, deliberately: a period is bounded by two
 * consecutive finalized visits to one machine, so a machine skipped in a run
 * has one longer period rather than two, and the days come from the run dates
 * at both ends. */
function ratePeriods(
  machineId: Id,
  history: VisitRecord[],
  runById: Map<Id, Run>,
  adjustments: Adjustment[],
): Map<number, SlotPeriod[]> {
  const bySlot = new Map<number, SlotPeriod[]>()

  for (const [index, current] of history.entries()) {
    // The oldest visit in the window opens a period whose other end was not
    // read. `slotPeriods` returns nothing for it rather than guessing a span.
    const previous = history[index + 1]

    const lines = salesForPeriod(previous ?? null, current, adjustments)
    const periods = slotPeriods(
      machineId,
      runDateOf(current.visit, runById),
      previous ? runDateOf(previous.visit, runById) : null,
      lines,
    )

    for (const period of periods) {
      const list = bySlot.get(period.slotNumber) ?? []
      list.push(period)
      bySlot.set(period.slotNumber, list)
    }
  }

  return bySlot
}

/** Slots whose total level has not moved across the rate window (design
 * §4.4) — the second half of the `Nothing expected` list, and meaningless
 * without the rate of zero the pick list pairs it with.
 *
 * **Every reading is compared, `before` and `after`, at each of the last
 * `RATE_WINDOW + 1` visits** — the visits that bound four periods. Comparing
 * the periods' closing totals instead would be wrong in the case that matters
 * most: a slot found at 3 and refilled to 10 every week closes at exactly 3
 * every period, so its closings are identical while its level plainly moves.
 * What §4.4 is looking for is a slot nobody has sold from AND nobody has put
 * anything into — a dead line waiting to be pulled, or a tray being scrolled
 * past — and that is a slot whose every reading is the same number.
 *
 * Fewer than `RATE_WINDOW + 1` visits, or a slot missing from any of them, is
 * **not** unmoved. "Not yet known" keeps the slot on the pick list, which is
 * the conservative direction: under-picking costs a trip down fifteen
 * floors. */
function stillSlots(history: VisitRecord[]): Set<number> {
  const window = history.slice(0, RATE_WINDOW + 1)
  if (window.length <= RATE_WINDOW) return new Set()

  const readings = new Map<number, number[]>()
  const visitsSeen = new Map<number, number>()

  for (const { lines } of window) {
    const before = new Map<number, number>()
    const after = new Map<number, number>()
    for (const line of lines) {
      before.set(line.slotNumber, (before.get(line.slotNumber) ?? 0) + line.before)
      after.set(line.slotNumber, (after.get(line.slotNumber) ?? 0) + line.after)
    }
    for (const [slotNumber, openingTotal] of before) {
      const list = readings.get(slotNumber) ?? []
      list.push(openingTotal, after.get(slotNumber) ?? 0)
      readings.set(slotNumber, list)
      visitsSeen.set(slotNumber, (visitsSeen.get(slotNumber) ?? 0) + 1)
    }
  }

  const still = new Set<number>()
  for (const [slotNumber, list] of readings) {
    if (visitsSeen.get(slotNumber) !== window.length) continue
    if (list.every((reading) => reading === list[0])) still.add(slotNumber)
  }
  return still
}

/** Each slot's total level at its last visit, across every item in it
 * (design §3.2 — the slot, not the `(slot, item)` line).
 *
 * First value seen per `(slot, item)` wins, over the whole window rather than
 * the newest visit alone: that is `lastRecordedLevels`' carry-forward, and it
 * is what the count screen seeds `before` from, so the forecast's `lastLevel`
 * is the figure the operator will actually see on the slot. */
function lastSlotTotals(history: VisitRecord[]): Map<number, number> {
  const seen = new Set<string>()
  const totals = new Map<number, number>()

  for (const { lines } of history) {
    for (const line of lines) {
      const key = levelKey(line.slotNumber, line.itemId)
      if (seen.has(key)) continue
      seen.add(key)
      totals.set(line.slotNumber, (totals.get(line.slotNumber) ?? 0) + line.after)
    }
  }

  return totals
}
