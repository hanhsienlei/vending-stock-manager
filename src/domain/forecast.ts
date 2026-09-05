import type { Id } from './types'

/** Everything the projection needs about one slot, and nothing else.
 *
 * It reads levels, dates and a rate. It does **not** read `CountLine.touched`
 * — see `purity.test.ts` for why that is a rule and not a preference. */
export interface SlotNeedInput {
  machineId: Id
  slotNumber: number
  capacity: number
  /** The slot's TOTAL left at its last visit, across every item in it. */
  lastLevel: number
  /** Units a day, or null when there is not enough history. Never conflate
   * null with 0 — see `rate.ts`. */
  rate: number | null
  /** Calendar days from **this machine's** last finalized visit to the
   * planned run. Per machine, not per run: a machine skipped last Friday has
   * been drawing down for a week while its neighbours have had three days,
   * and skipped machines are the ones most likely to be empty (design §7.1,
   * §16.3 — spec §6.2's "days since last run" is wrong for exactly them). */
  daysSince: number
  /** For allocation's first ranking rule (spec §6.2): proven unmet demand. */
  ranDryLastPeriod: boolean
}

export interface SlotNeed extends SlotNeedInput {
  /** What the slot is expected to be down to when the run reaches it. */
  projected: number
  /** Units to bring, an integer in `[0, capacity]`. */
  need: number
  /** Which arm of the projection produced it — printed on the load screen so
   * a need with no history behind it says so. */
  basis: 'rate' | 'no-rate'
}

/** What a slot will be down to when the run reaches it, and what it wants.
 *
 *     projected = rate === null ? lastLevel : max(0, lastLevel − rate × daysSince)
 *     need      = clamp(ceil(capacity − projected), 0, capacity)
 *
 * **One expression, not a branch.** With `rate === null` the projection is
 * simply the last level, so `need = capacity − lastLevel` — spec §6.1's
 * stated fallback, "which assumes nothing sold", falls out of the same
 * formula. One formula is one thing to test and one thing to explain.
 *
 * **`ceil`, deliberately.** The projection is fractional and the need is an
 * integer. Rounding up over-picks by at most one unit per slot, and spec §6.1
 * is explicit about which way to err: over-picking costs trolley space, while
 * under-picking costs a trip down fifteen floors.
 *
 * **Clamped at both ends.** Above capacity is not reachable by arithmetic but
 * the floor at zero is: the count cells deliberately do not clamp (interface
 * refinement §3.3), so a slot can be recorded holding more than its
 * configured capacity, and a negative need is not a thing.
 *
 * No reference to storeroom stock anywhere — the need is what the slot wants,
 * not what the shelf can supply (design §3.7). Rationing against an estimate
 * is `pick.ts`'s refusal to make.
 *
 * Pure: plain data in, plain data out. */
export function slotNeed(input: SlotNeedInput): SlotNeed {
  const { capacity, lastLevel, rate, daysSince } = input

  const projected = rate === null
    ? lastLevel
    : Math.max(0, lastLevel - rate * daysSince)

  return {
    ...input,
    projected,
    need: Math.min(capacity, Math.max(0, Math.ceil(capacity - projected))),
    basis: rate === null ? 'no-rate' : 'rate',
  }
}
