import type { RateExclusion, SlotPeriod } from './slotPeriods'

/** How many usable periods the rate pools over (spec §6.1, decision D3).
 *
 * Four at a Tue/Fri cadence is about a fortnight — long enough to average
 * out a quiet week, short enough that a genuine change in what a slot sells
 * reaches the forecast within two runs. */
export const RATE_WINDOW = 4

/** Below this, there is no rate at all — `null`, never zero (spec §6.1). */
export const MIN_PERIODS_FOR_RATE = 2

/** The rate, and everything needed to justify it on screen (design §6.3).
 *
 * Every field here exists to be shown. Spec §6.1's argument for a plain mean
 * over anything cleverer is that the operator has to trust the number, and a
 * number they cannot check is not trusted:
 *
 *     1.4 / day — 21 sold over 15 days, 4 periods.
 *     2 skipped: 22 Aug ran dry, 15 Aug ran dry.
 */
export interface DemandRate {
  /** Units a day, or null when there is not enough history.
   *
   * **`null` is not zero.** Zero means "this slot sells nothing"; null means
   * "I don't know yet". They produce different needs (`forecast.ts`) and must
   * never be collapsed, in code or in a fixture. */
  rate: number | null
  /** Σ sold over the window — the numerator, printed beside the rate. */
  unitsSold: number
  /** Σ days over the window — the denominator. */
  days: number
  periodsUsed: number
  /** Every period skipped *within the range actually scanned*, newest first.
   * Periods past the point the window filled were never consulted and are
   * not reported as skipped — claiming otherwise would be a lie about what
   * the figure was built from. */
  excluded: { runDate: string; reason: RateExclusion }[]
}

/** How many a day this slot sells, pooled over its last few clean periods.
 *
 *     rate = Σ units sold / Σ days   over the first RATE_WINDOW usable periods
 *          = null                    when fewer than MIN_PERIODS_FOR_RATE
 *
 * **Pooled, not a mean of per-period rates** (design §3.3, §16.1). Spec §6.1
 * writes "mean(units sold per day) over the last 4 non-censored periods",
 * which read literally is a mean of four quotients. Periods are 3 and 4 days
 * alternately, so a mean of quotients weights a short period more heavily per
 * unit sold than a long one, and the two answers differ by a few percent.
 * Pooled is chosen for two reasons, the second deciding: it is the
 * arithmetically correct answer to "how many a day does this slot sell", and
 * it is one division on one line that the operator can check by hand.
 *
 * `periods` must be **newest first** — the caller orders them, because only
 * the caller knows the run calendar.
 *
 * Pure: plain data in, plain data out. */
export function demandRate(periods: SlotPeriod[]): DemandRate {
  const window: SlotPeriod[] = []
  const excluded: DemandRate['excluded'] = []

  for (const period of periods) {
    if (window.length >= RATE_WINDOW) break
    if (period.exclusion) {
      excluded.push({ runDate: period.runDate, reason: period.exclusion })
      continue
    }
    // A usable period always carries a figure — `slotPeriods` nulls `sold`
    // exactly when it sets an exclusion. Guarded anyway, because the one
    // thing that must never happen is a missing figure being summed as a
    // zero and taught to the forecast as "sells nothing".
    if (period.sold === null) continue
    window.push(period)
  }

  const unitsSold = window.reduce((sum, p) => sum + (p.sold ?? 0), 0)
  const days = window.reduce((sum, p) => sum + p.days, 0)

  return {
    rate: window.length >= MIN_PERIODS_FOR_RATE && days > 0
      ? unitsSold / days
      : null,
    unitsSold,
    days,
    periodsUsed: window.length,
    excluded,
  }
}
