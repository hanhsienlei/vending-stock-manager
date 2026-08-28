/** The context header (§2). Scrolls away under the tab bar, which does not —
 * which is why this is rendered by each screen inside `ScreenLayout` rather
 * than hoisted into `App`: the screen owns the data the header states, and the
 * DOM order (header, then tabs) is what makes the scroll behaviour fall out
 * without a sticky-offset calculation. */
export function ScreenHeader({
  eyebrow, back, state, title, subtitle, figure,
}: {
  /** The run context, e.g. `RUN · THU 27 AUG`. A top-level screen passes this. */
  eyebrow?: string
  /** A nested screen (map, count, receipt) passes this instead — never both. */
  back?: { label: string; onClick: () => void }
  /** Right of the back line on the count screen: `COUNTING`, `READ ONLY`. */
  state?: string
  title: string
  /** The distinct machine label, beside the title at 16px/500. */
  subtitle?: string
  /** The one figure the screen is about: `3 / 15`, `22 / 54`. */
  figure?: string
}) {
  return (
    <header className="bg-ground px-4 pb-3 pt-2.5">
      <div className="flex items-baseline justify-between">
        {back ? (
          <button
            type="button"
            onClick={back.onClick}
            className="text-[11px] font-semibold uppercase tracking-[0.10em] text-neutral-600"
          >
            {back.label}
          </button>
        ) : (
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
            {eyebrow}
          </span>
        )}
        {state && (
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
            {state}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <h1 className="flex items-baseline gap-2 truncate text-[27px] font-extrabold tracking-[-0.02em]">
          {title}
          {subtitle && (
            <span className="text-[16px] font-medium text-neutral-700">{subtitle}</span>
          )}
        </h1>
        {figure && (
          <span className="shrink-0 text-[19px] font-extrabold tabular-nums">{figure}</span>
        )}
      </div>
    </header>
  )
}
