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
          dimmed ? 'text-gray-400' : emerald ? 'text-emerald-700' : 'text-gray-900'
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
