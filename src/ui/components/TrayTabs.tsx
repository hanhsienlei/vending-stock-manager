import { TRAYS, trayLabel } from '../../domain/trays'

/** The same flush-left underline pattern as the main tab bar (§3.7), with a
 * tick after a completed tray's number and the active tray spelled out:
 * `1 ✓  2 ✓  Tray 3  4  5  6`. */
export function TrayTabs({
  active, onSelect, present, complete = new Set<number>(),
}: {
  active: number
  onSelect: (tray: number) => void
  present: Set<number>
  /** Trays with every slot counted — rendered with a tick. */
  complete?: Set<number>
}) {
  return (
    <div className="flex gap-5 overflow-x-auto border-b-2 border-rule-strong bg-ground px-4">
      {TRAYS.filter((t) => present.has(t)).map((tray) => (
        <button
          key={tray}
          type="button"
          aria-current={tray === active ? 'true' : undefined}
          onClick={() => onSelect(tray)}
          className={`shrink-0 py-2 text-[13px] ${
            tray === active
              ? 'font-extrabold text-ink shadow-[inset_0_-3px_0_var(--color-accent)]'
              : 'font-medium text-neutral-600'
          }`}
        >
          {tray === active ? trayLabel(tray) : String(tray / 10)}
          {complete.has(tray) && ' ✓'}
        </button>
      ))}
    </div>
  )
}
