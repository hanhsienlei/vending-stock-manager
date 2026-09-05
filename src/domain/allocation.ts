import type { SlotNeed } from './forecast'
import { slotKey } from './pick'
import type { PickAssignment } from './pick'
import type { Id } from './types'

export interface AllocationLine {
  machineId: Id
  slotNumber: number
  itemId: Id
  /** Units this slot asked for. */
  need: number
  /** Units the trolley can actually give it — `min(need, what is left)`. */
  allocated: number
  /** Position in rank order, from 0. */
  rank: number
}

export interface Allocation {
  /** Every assignment, in rank order. */
  lines: AllocationLine[]
  /** Where to draw the cut line: the index of the last line that is served in
   * full **before the first line that is not**. `null` when every line is
   * covered and there is no line to draw; `-1` when even the first line goes
   * short, so nothing below the header is covered.
   *
   * Defined against the FIRST shortfall rather than the last full serve so it
   * is a true divider — the screen's bar reads `CUT LINE · NOTHING BELOW IS
   * COVERED`, and that has to be true of everything below it, including a
   * later line of a different item that happens to be fully supplied. */
  cutAfter: number | null
}

/** Rank the shortfall and say who goes short, spec §6.2.
 *
 * 1. Slots that **ran dry in the previous period** first — proven unmet
 *    demand outranks a higher rate that was being met.
 * 2. Then by **demand rate**, descending. A slot with no rate ranks below
 *    every rated slot, including one rated zero: `null` is not a high rate
 *    and it is not a low one, and a slot nobody has data for should not
 *    outrank a slot known to sell four a day. It still gets served if
 *    anything is left.
 * 3. Ties break in **walk order** — machine level ascending, then slot
 *    number. It has to be deterministic for the arithmetic to be testable,
 *    and walk order is the one the operator can read: the cut line becomes
 *    "everything from L12 up goes short".
 *
 * Each item's `taken` is its own pool; one item running out never eats
 * another's. The slot at the cut line gets `min(need, remaining)` rather than
 * being skipped to preserve the fill-to-capacity rule — leaving units on the
 * trolley to honour a rule helps nobody, and the operator is going to put
 * them in the machine anyway.
 *
 * **Advisory, and it writes nothing** (spec §6.2, design §3.9). Every number
 * is overridable, the result is stored nowhere, and the inputs come back
 * untouched. Its whole job is to surface the trade-off at G rather than on
 * level 12.
 *
 * Pure: plain data in, plain data out. */
export function allocate(
  assignments: PickAssignment[],
  needsBySlot: Map<string, SlotNeed>,
  taken: Map<Id, number>,
  levelOf: Map<Id, number>,
): Allocation {
  const ranked = [...assignments].sort((a, b) => {
    const needA = needsBySlot.get(slotKey(a.machineId, a.slotNumber))
    const needB = needsBySlot.get(slotKey(b.machineId, b.slotNumber))

    const dryA = needA?.ranDryLastPeriod ? 0 : 1
    const dryB = needB?.ranDryLastPeriod ? 0 : 1
    if (dryA !== dryB) return dryA - dryB

    // A missing rate sorts after every present one. `-Infinity` rather than a
    // separate branch keeps the comparator one expression, and it is only
    // ever compared against real rates, which are finite and non-negative.
    const rateA = needA?.rate ?? -Infinity
    const rateB = needB?.rate ?? -Infinity
    if (rateA !== rateB) return rateB - rateA

    return (levelOf.get(a.machineId) ?? 0) - (levelOf.get(b.machineId) ?? 0) ||
      a.machineId.localeCompare(b.machineId) ||
      a.slotNumber - b.slotNumber
  })

  const remaining = new Map(taken)
  const lines: AllocationLine[] = []
  let cutAfter: number | null = null

  ranked.forEach((assignment, rank) => {
    const left = remaining.get(assignment.itemId) ?? 0
    const allocated = Math.max(0, Math.min(assignment.units, left))
    remaining.set(assignment.itemId, left - allocated)

    if (allocated < assignment.units && cutAfter === null) cutAfter = rank - 1

    lines.push({
      machineId: assignment.machineId,
      slotNumber: assignment.slotNumber,
      itemId: assignment.itemId,
      need: assignment.units,
      allocated,
      rank,
    })
  })

  return { lines, cutAfter }
}
