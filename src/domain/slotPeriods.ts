import { daysBetween } from './date'
import type { CensoredReason, SalesLine } from './sales'
import type { Id } from './types'

/** Why a period is not usable for the demand rate (design §3.4).
 *
 * `CensoredReason` is reused whole rather than paralleled: the residual
 * already decides what it cannot measure, and a second censoring vocabulary
 * would be two definitions of the same idea, free to drift. Only two
 * exclusions are new, and both are properties of the slot rather than of one
 * `(slot, item)` line. */
export type RateExclusion = CensoredReason | 'ran-dry' | 'residual-clamped'

/** One slot's demand over one period — the unit the rate is measured in. */
export interface SlotPeriod {
  machineId: Id
  slotNumber: number
  /** The CLOSING run's date. Orders the rate window, newest first. */
  runDate: string
  /** Calendar days the period spanned, never below 1. */
  days: number
  /** The slot's total across every item in it, or null when excluded. */
  sold: number | null
  /** The slot's total level at the close. Zero means the channel ran dry. */
  closingTotal: number
  exclusion?: RateExclusion
}

/** Aggregate one machine's residual for one period from `(slot, item)` lines
 * up to the slot, and decide whether the slot's period is usable.
 *
 * **This is the step spec §6 never names** (design §3.2). §3.4 is emphatic
 * that "demand is measured and forecast per slot", but `salesForPeriod` pairs
 * on `(slotNumber, itemId)` — it has to, because opening and closing levels
 * are per item and a mixed slot holds two of them. Summing here, once, is
 * what keeps every downstream figure per slot.
 *
 * It matters most for censoring. `SalesLine.ranDry` is `closing === 0` for
 * one line: in a slot holding 0 Coke and 4 Fanta the Coke line is "dry" while
 * the channel dispensed perfectly well all period. Censoring on the line
 * would throw away a usable period, and would censor an incoming item's every
 * early period through a changeover. The slot's TOTAL closing at zero is what
 * the physical channel actually did, and is spec §6.1's own wording.
 *
 * Pure: plain data in, plain data out. */
export function slotPeriods(
  machineId: Id,
  runDate: string,
  previousRunDate: string | null,
  lines: SalesLine[],
): SlotPeriod[] {
  // No opening visit is no period at all — not a period of unknown length.
  // `salesForPeriod` already censors these lines as `no-previous-visit`; a
  // period with no measurable span has nothing to contribute either way.
  if (previousRunDate === null) return []

  // Two runs on one calendar day is a correction, not a zero-length period,
  // and the rate divides by this.
  const days = Math.max(1, daysBetween(previousRunDate, runDate))

  const bySlot = new Map<number, SalesLine[]>()
  for (const line of lines) {
    const group = bySlot.get(line.slotNumber) ?? []
    group.push(line)
    bySlot.set(line.slotNumber, group)
  }

  const periods: SlotPeriod[] = []

  for (const [slotNumber, group] of bySlot) {
    const closingTotal = group.reduce((sum, l) => sum + l.closing, 0)
    const exclusion = exclusionFor(group, closingTotal)

    periods.push({
      machineId,
      slotNumber,
      runDate,
      days,
      sold: exclusion ? null : group.reduce((sum, l) => sum + (l.sold ?? 0), 0),
      closingTotal,
      exclusion,
    })
  }

  return periods.sort((a, b) => a.slotNumber - b.slotNumber)
}

/** Precedence, highest first: the residual's own reason, then a clamp, then
 * the slot running dry.
 *
 * The order is the order of specificity. A censored line has no residual at
 * all, so it cannot also have clamped; a clamped period's numbers did not
 * reconcile, which explains more than "it ended empty" does. Reporting the
 * most specific reason is what lets the screen say which runs were skipped
 * and why — spec §6.1 chose a mean over anything cleverer precisely because
 * the operator has to be able to check it. */
function exclusionFor(
  group: SalesLine[],
  closingTotal: number,
): RateExclusion | undefined {
  const censored = group.find((l) => l.censoredReason !== undefined)
  if (censored?.censoredReason) return censored.censoredReason
  if (group.some((l) => l.clamped)) return 'residual-clamped'
  if (closingTotal === 0) return 'ran-dry'
  return undefined
}
