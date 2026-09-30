import { useReport } from './useReport'
import { StockMatrix } from './StockMatrix'
import { buildOrderRows, buildOrderByItem, useOrderPreferences, useOrderOverrides } from './OrderSection'
import { formatRunDate, today } from '../../domain/date'

/** The stock sheet, alone on a page, for printing and carrying (design §4).
 *
 * A separate entry point rather than a mode of `ReportScreen`, because it is
 * opened in its own browser tab: that is how it escapes the installed app's
 * standalone mode, where `window.print()` is unreliable on iOS. A separate tab
 * shares the origin but not React state, which is why the overrides it prints
 * live in `localStorage` (design §2) — this component reads them fresh via
 * `useOrderOverrides` rather than receiving them as a prop.
 *
 * No nav, no tabs, no date pickers, no order section, no fold controls, no
 * landscape hint: those are screen furniture for a screen the operator
 * navigates. This one is opened once, read, and closed — the matrix, one line
 * saying when it was true and on what horizon, and (screen-only, per spec
 * §6.4) a way back to the app in case iOS never hands the tab to Safari at
 * all. */
export function PrintSheet() {
  const { matrixRows, machines, orderInputs, loading } = useReport(today(), today())
  const { horizon, safety, filled } = useOrderPreferences()
  const { overrides } = useOrderOverrides()

  if (loading) return null

  // The order rows both the report and this sheet render — built here from
  // the same `buildOrderRows` the report uses (Task 2), so the two can never
  // disagree about what the app is suggesting. `buildOrderByItem` reads
  // `filled` (D7) the same way `ReportScreen` does — the operator's "Order
  // column blank" toggle is a `localStorage` preference this tab reads fresh,
  // same as the overrides, and it must be honoured here too: the whole point
  // of the toggle is a column the operator can write on by hand, and a
  // printed sheet that ignores it hands back a pre-filled column regardless.
  const orderRows = buildOrderRows(orderInputs, matrixRows, horizon, safety)
  const orderByItem = buildOrderByItem(orderRows, overrides, filled)

  return (
    <main data-print-sheet className="bg-paper">
      {/* Spec §6.4's named risk: iOS may keep `?print=1` inside the installed
          app's own webview rather than handing it to Safari, and this screen
          has no `NavContext`, no tab bar, nothing — so if that happens the
          operator is standing on a chrome-less screen with no way off it but
          force-quitting. This is the way off.
          A plain link to `/`, not `window.close()`. `window.close()` only
          closes a window script actually opened, and that is exactly what is
          in doubt here: if iOS folds this into the app's own webview instead
          of a real new tab, there may be no separate closable window for it
          to act on, and the operator taps it for nothing. A same-tab
          navigation back to the app's own root has no such precondition — it
          works whether this landed in Safari or inside the shell, which is
          the one thing this affordance cannot afford to get wrong.
          `print:hidden`: screen-only, per Fix 3 — it has no business on
          paper. */}
      <a
        href="/"
        className="block px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-neutral-700 print:hidden"
      >
        Close
      </a>
      <p
        aria-label="sheet provenance"
        className="px-4 py-2 text-[11px] font-medium text-neutral-700"
      >
        Stock sheet · {formatRunDate(today())} · {machines.length} machines ·
        order covers {horizon} + {safety} days
      </p>
      <StockMatrix rows={matrixRows} machines={machines} orderByItem={orderByItem} />
    </main>
  )
}
