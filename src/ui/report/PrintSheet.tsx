import { useReport } from './useReport'
import { StockMatrix } from './StockMatrix'
import { buildOrderRows, orderCell, useOrderPreferences, useOrderOverrides } from './OrderSection'
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
 * navigates. This one is opened once, read, and closed — the matrix and one
 * line saying when it was true and on what horizon. */
export function PrintSheet() {
  const { matrixRows, machines, orderInputs, loading } = useReport(today(), today())
  const { horizon, safety } = useOrderPreferences()
  const { overrides } = useOrderOverrides()

  if (loading) return null

  // The order rows both the report and this sheet render — built here from
  // the same `buildOrderRows` the report uses (Task 2), so the two can never
  // disagree about what the app is suggesting.
  const orderRows = buildOrderRows(orderInputs, matrixRows, horizon, safety)
  const orderByItem = new Map(
    orderRows.flatMap((row) => {
      const cell = orderCell(row, overrides[row.itemId])
      return cell === null ? [] : [[row.itemId, cell] as const]
    }),
  )

  return (
    <main data-print-sheet className="bg-paper">
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
