import { useEffect, useState } from 'react'
import { useReport, latestRunDate } from './useReport'
import { StockMatrix } from './StockMatrix'
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

/** Design §7.2. Scoped to a run by default — which is what close-out wants and
 * needs no input — with a start and end date for the questions a single run
 * cannot answer. Both are the same computation: §5.1 attributes each period to
 * the run of its closing visit, so a run is a range covering one date. */
export function ReportScreen() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      const latest = await latestRunDate()
      setFrom(latest)
      setTo(latest)
      setReady(true)
    })()
  }, [])

  const { reports, items, machines, storeroomOnHand, levelsByMachine, matrixRows, loading } =
    useReport(from, to)

  if (!ready || loading) return <div className="p-4">Loading…</div>

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

  return (
    <div className="p-4">
      <div className="mb-3 flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase text-gray-500">From</span>
          <input
            aria-label="From"
            type="date"
            className="rounded-lg border p-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase text-gray-500">To</span>
          <input
            aria-label="To"
            type="date"
            className="rounded-lg border p-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nothing to report yet — a period closes when a machine is finished for
          a second time.
        </p>
      ) : (
        <>
          <div
            aria-label="report totals"
            className="mb-3 rounded-lg border bg-gray-50 p-3"
          >
            <div className="text-sm text-gray-500">Sold this period</div>
            <div className="text-lg font-semibold">
              {units} units · ${money(revenue)}
            </div>
            {censoredLines > 0 && (
              <div className="mt-1 text-xs font-semibold text-amber-700">
                {censoredLines} {censoredLines === 1 ? 'line' : 'lines'} not
                counted — no figure exists for {censoredLines === 1 ? 'it' : 'them'},
                so {censoredLines === 1 ? 'it is' : 'they are'} not in the total above
              </div>
            )}
          </div>

          <div
            aria-label="stock on hand"
            className="mb-3 rounded-lg border p-3 text-sm"
          >
            <div className="font-semibold">Stock on hand — now</div>
            <div className="text-gray-500">
              Machines {inMachines} · Storeroom {inStoreroom} ·
              Total {inMachines + inStoreroom}
            </div>
          </div>

          <ul className="flex flex-col gap-1">
            {reports.flatMap((report) =>
              report.lines.map((line) => {
                const level = machineById.get(report.machineId)?.level ?? '?'
                return (
                  <li
                    key={`${report.visit.id}-${line.slotNumber}-${line.itemId}`}
                    aria-label={`L${level} slot ${line.slotNumber} sales`}
                    className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                  >
                    <span className="w-10 font-bold text-gray-500">L{level}</span>
                    <span className="w-8 text-gray-500">{line.slotNumber}</span>
                    <span className="flex-1">
                      {items.get(line.itemId)?.name ?? 'Deleted item'}
                    </span>
                    {line.ranDry && (
                      <span className="font-bold text-red-600">RAN DRY</span>
                    )}
                    {report.editedLate && (
                      <span className="text-xs font-bold uppercase text-amber-600">
                        Edited late
                      </span>
                    )}
                    {line.sold === null ? (
                      <span className="text-right text-xs text-gray-500">
                        not counted —{' '}
                        {line.censoredReason
                          ? CENSORED_REASONS[line.censoredReason]
                          : 'reason not recorded'}
                      </span>
                    ) : (
                      <span className="font-semibold tabular-nums">
                        {line.sold} · ${money(line.revenue ?? 0)}
                      </span>
                    )}
                  </li>
                )
              }),
            )}
          </ul>

          <div className="mt-4">
            <div className="mb-2 font-semibold">Stock matrix</div>
            <StockMatrix rows={matrixRows} machines={machines} />
          </div>
        </>
      )}
    </div>
  )
}
