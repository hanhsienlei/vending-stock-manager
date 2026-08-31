/** Nothing in `src/` imports this file. It was orphaned when spec §3.3
 * replaced the counting steppers with typed cells, and it is deliberately
 * retained rather than deleted: the design spec's "Directions not taken"
 * section (`docs/design/2026-08-28-interface-refinement.md`) describes a
 * "stacked ledger" layout that keeps the `±` steppers, and names it as the
 * fallback if typed cells prove worse in the field than they sound — see also
 * `docs/handover.md` (~lines 103-108), which points back at that fallback.
 *
 * For that reason it is NOT restyled to the current tokens (`rounded-lg`,
 * `bg-gray-200`, `text-emerald-700`, `text-gray-400` and `text-gray-900` all
 * still stand below): §3.3 replaced this component's whole interaction model,
 * not just its palette, so reviving the fallback would mean redesigning it
 * against whatever the run screen looks like at that point, not resurrecting
 * this file verbatim. This is why a legacy-palette grep over `src/ui/`
 * returns exactly one file. */
export function Stepper({
  value, onChange, min = 0, max = 99, label, dimmed = false, emerald = false,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  label: string
  /** Greys the value to mark it as carried forward, not yet confirmed. */
  dimmed?: boolean
  /** Colours the value emerald, distinguishing an after-count stepper from a
   * before-count one sitting beside it (spec §3.2). Takes precedence over
   * `dimmed`, matching the always-emerald readout this stepper replaced. */
  emerald?: boolean
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`${label} decrease`}
        className="h-9 w-9 rounded-lg bg-gray-200 text-lg font-semibold"
        onClick={() => onChange(clamp(value - 1))}
      >
        −
      </button>
      <span
        aria-label={label}
        className={`min-w-8 text-center text-lg font-bold ${
          emerald ? 'text-emerald-700' : dimmed ? 'text-gray-400' : 'text-gray-900'
        }`}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`${label} increase`}
        className="h-9 w-9 rounded-lg bg-gray-200 text-lg font-semibold"
        onClick={() => onChange(clamp(value + 1))}
      >
        +
      </button>
    </div>
  )
}
