import { useEffect, useState } from 'react'
import { useReport, latestRunDate } from './useReport'
import { StockMatrix } from './StockMatrix'
import { OrderSection, orderCell, useOrderPreferences, type OrderRow } from './OrderSection'
import { orderSuggestion } from '../../domain/order'
import { formatRunDate } from '../../domain/date'
import type { CensoredReason } from '../../domain/sales'

const money = (n: number) => n.toFixed(2)

/** Design §7.2 asks for every censored period "with the reason it could not be
 * counted". A bare "not counted" leaves the operator no way to tell a slot
 * worth walking back to from one that simply has no history yet. */
const CENSORED_REASONS: Record<CensoredReason, string> = {
  'no-previous-visit': 'no previous visit',
  'left-slot-with-stock': 'left the slot holding stock',
  'visit-not-finalized': 'visit not finished',
}

/** The period as an eyebrow. `formatRunDate` carries a year the poster field
 * has no room for, so it is trimmed here rather than by adding a second
 * formatter to `src/domain/date.ts` — this is display copy for one field. */
function periodLabel(from: string, to: string): string {
  const short = (d: string) => formatRunDate(d).replace(/ \d{4}$/, '').toUpperCase()
  return from === to ? `SOLD · RUN OF ${short(from)}` : `SOLD · ${short(from)} – ${short(to)}`
}

/** Design §7.2. Scoped to a run by default — which is what close-out wants and
 * needs no input — with a start and end date for the questions a single run
 * cannot answer. Both are the same computation: §5.1 attributes each period to
 * the run of its closing visit, so a run is a range covering one date. */
export function ReportScreen() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [ready, setReady] = useState(false)
  const { horizon, safety, filled, setHorizon, setSafety, setFilled } =
    useOrderPreferences()

  useEffect(() => {
    void (async () => {
      const latest = await latestRunDate()
      setFrom(latest)
      setTo(latest)
      setReady(true)
    })()
  }, [])

  const {
    reports, items, machines, storeroomOnHand, levelsByMachine, matrixRows,
    orderInputs, loading,
  } = useReport(from, to)

  if (!ready || loading) return <div className="px-4 py-3 text-[13px]">Loading…</div>

  const allLines = reports.flatMap((r) => r.lines)
  const units = allLines.reduce((sum, l) => sum + (l.sold ?? 0), 0)
  const revenue = allLines.reduce((sum, l) => sum + (l.revenue ?? 0), 0)
  // A censored line has no figure, and `?? 0` above quietly folds it in as
  // zero. A range covering a machine's first-ever visit therefore reads
  // "0 units · $0.00" — indistinguishable from a period that genuinely sold
  // nothing, which is the confusion §5.2 exists to prevent. The totals stay
  // as they are (a censored line cannot contribute a number), but they are no
  // longer allowed to look complete when they are not.
  const censoredLines = allLines.filter((l) => l.sold === null).length

  // Stock on hand is a current figure, not a period one (design §7.2): it is
  // read from each machine's latest recorded levels — never from summing the
  // closing counts of every period in the selected range, which would count
  // a machine more than once across a range covering more than one of its
  // visits and would make a "now" figure vary with the dates picked above.
  const inMachines = [...levelsByMachine.values()]
    .reduce((sum, levels) => sum + [...levels.values()].reduce((s, n) => s + n, 0), 0)
  const inStoreroom = [...storeroomOnHand.values()].reduce((sum, n) => sum + n, 0)

  const machineById = new Map(machines.map((m) => [m.id, m]))

  // The arithmetic is `src/domain/order.ts`'s and is done here, not in
  // `useReport`, so that editing the horizon re-computes without re-reading
  // the estate. `orderSuggestion` preserves input order, so each line pairs
  // with the input it came from.
  const orderRows: OrderRow[] = orderSuggestion(orderInputs, horizon, safety)
    .map((line, index) => ({
      ...line,
      itemName: orderInputs[index].itemName,
      boxSize: orderInputs[index].boxSize,
      ratedSlots: orderInputs[index].ratedSlots,
      slotCount: orderInputs[index].slotCount,
    }))
    .sort((a, b) =>
      b.suggested - a.suggested ||
      b.flags.length - a.flags.length ||
      a.itemName.localeCompare(b.itemName))

  // One formatter for both places the figure appears (`orderCell`), and only
  // for items there is a figure for — an item with no rate keeps a blank cell
  // rather than a zero.
  const orderByItem = new Map(
    orderRows.flatMap((row) => {
      const cell = orderCell(row)
      return cell === null ? [] : [[row.itemId, cell] as const]
    }),
  )

  return (
    <div>
      {/* The master table leads the screen and is NOT gated on a closed sales
          period. It is built from current levels, storeroom balances and
          placements — none of which involve a period at all — and it is the
          thing the operator acts on BEFORE a run ("estimate what I should
          grab from the storeroom before going to these machines floor by
          floor"). It used to sit inside the `reports.length === 0` branch
          below, so the whole screen collapsed to "Nothing to report yet"
          until a machine had been finished for a second time, and the table
          could not be reached at all until after two runs. */}
      {/* Portrait only, and the copy says why: once the phone IS turned, a
          strip telling the operator to turn it is spending two rows of stock
          on advice they have already taken. */}
      <div className="flex items-baseline justify-between border-b-2 border-rule-strong bg-surface px-4 py-2.5 landscape:hidden">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          Stock on hand — {matrixRows.length} items × {machines.length} machines
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent-700">
          Turn phone ⟳
        </span>
      </div>
      {/* D7: filled from the suggestion, with the toggle in the section below
          handing the column back to the pen for a run where the operator
          would rather write. */}
      <StockMatrix
        rows={matrixRows}
        machines={machines}
        orderByItem={filled ? orderByItem : undefined}
      />

      {/* Everything below the sheet is portrait-only. In landscape the
          operator is holding a stock sheet, not reading a report: the table
          gets the whole screen and the totals and sales are a rotation away.
          They stay in the DOM rather than being unmounted, so rotating back
          costs no re-query. */}
      <div className="landscape:hidden">
      {/* The three totals belong with the table they total, and above the
          date pickers — they are a "now" figure that those dates have never
          governed (design §7.2). Sitting under the pickers implied they did. */}
      <div
        aria-label="stock on hand"
        className="grid grid-cols-3 gap-px border-y-2 border-rule-strong bg-rule-light"
      >
        {([
          ['In machines', inMachines, 'bg-paper'],
          ['Storeroom', inStoreroom, 'bg-paper'],
          ['On hand now', inMachines + inStoreroom, 'bg-surface'],
        ] as const).map(([label, value, fill]) => (
          <div key={label} className={`${fill} px-4 py-3`}>
            <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
              {label}
            </div>
            <div className="mt-0.5 text-[21px] font-extrabold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      {/* Everything below is the sales half, and it alone needs a closed
          period. */}
      <div className="bg-ink px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground">
        Sales
      </div>

      <div className="grid grid-cols-2 gap-px border-b-2 border-rule-strong bg-rule-light">
        {([['From', from, setFrom], ['To', to, setTo]] as const).map(([label, value, set]) => (
          <label key={label} className="flex flex-col gap-1 bg-paper px-4 py-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
              {label}
            </span>
            <input
              aria-label={label}
              type="date"
              className="w-full border-b-2 border-ink bg-transparent pb-1 text-[15px] font-bold tabular-nums outline-none"
              value={value}
              onChange={(e) => set(e.target.value)}
            />
          </label>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-neutral-500">
          Nothing to report yet — a period closes when a machine is finished for
          a second time.
        </p>
      ) : (
        <>
          {/* The one poster moment in the app. The eyebrow is at full
              opacity, never tinted: accent-to-ground is only 4.2:1 at full
              strength and any tint takes it below the floor. */}
          <div
            aria-label="report totals"
            className="bg-accent px-4 pb-5 pt-[18px] text-ground"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.12em]">
              {periodLabel(from, to)}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[50px] font-extrabold leading-none tabular-nums">
                {units}
              </span>
              <span className="text-[15px] font-semibold">units</span>
            </div>
            <div className="mt-1 text-[27px] font-extrabold tabular-nums">
              ${money(revenue)}
            </div>
          </div>

          {censoredLines > 0 && (
            <p
              aria-label="censored lines"
              className="bg-accent-200 px-4 py-2.5 text-[11px] font-bold text-accent-800"
            >
              {censoredLines} {censoredLines === 1 ? 'line' : 'lines'} not counted
              — no figure exists for {censoredLines === 1 ? 'it' : 'them'}, so{' '}
              {censoredLines === 1 ? 'it is' : 'they are'} not in the totals above.
            </p>
          )}

          <div className="grid grid-cols-[30px_26px_1fr_40px_62px] items-center gap-2 bg-ink px-3.5 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground">
            <span>LV</span>
            <span>SL</span>
            <span>Item</span>
            <span className="text-right">Sold</span>
            <span className="text-right">Revenue</span>
          </div>

          <ul>
            {reports.flatMap((report) =>
              report.lines.map((line) => {
                const level = machineById.get(report.machineId)?.level ?? '?'
                const censored = line.sold === null
                return (
                  <li
                    key={`${report.visit.id}-${line.slotNumber}-${line.itemId}`}
                    aria-label={`L${level} slot ${line.slotNumber} sales`}
                    className={`border-b border-rule-light ${
                      censored ? 'bg-neutral-100' : 'bg-paper'
                    } ${line.ranDry ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''}`}
                  >
                    <div className="grid grid-cols-[30px_26px_1fr_40px_62px] items-center gap-2 px-3.5 py-2">
                      <span className="text-[13px] font-extrabold tabular-nums">L{level}</span>
                      <span className="text-[13px] tabular-nums text-neutral-700">
                        {line.slotNumber}
                      </span>
                      <span className="min-w-0 truncate text-[13px] font-semibold">
                        {items.get(line.itemId)?.name ?? 'Deleted item'}
                        {line.ranDry && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-700">
                            Dry
                          </span>
                        )}
                        {report.editedLate && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-700">
                            Edited late
                          </span>
                        )}
                      </span>
                      {censored ? (
                        <span className="col-span-2 text-right text-[11px] font-medium text-accent-800">
                          Not counted —{' '}
                          {line.censoredReason
                            ? CENSORED_REASONS[line.censoredReason]
                            : 'reason not recorded'}
                        </span>
                      ) : (
                        <>
                          <span className="text-right text-[15px] font-extrabold tabular-nums">
                            {line.sold}
                          </span>
                          <span className="text-right text-[15px] font-extrabold tabular-nums">
                            ${money(line.revenue ?? 0)}
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                )
              }),
            )}
          </ul>

        </>
      )}

      {/* Below the sales lines, per design §12.4 — and outside the closed-period
          branch above, because the order depends on rates and balances, not on
          a period having closed. */}
      <OrderSection
        rows={orderRows}
        horizon={horizon}
        safety={safety}
        filled={filled}
        onHorizonChange={setHorizon}
        onSafetyChange={setSafety}
        onFilledChange={setFilled}
      />
      </div>
    </div>
  )
}
