import { useEffect, useState } from 'react'
import { listMachines } from '../../data/repositories/machines'
import { listRuns } from '../../data/repositories/runs'
import { listVisitsForRun } from '../../data/repositories/visits'
import { formatRunDate } from '../../domain/date'
import { distinctLabel } from '../machines/machineLabel'
import { ReportScreen } from '../report/ReportScreen'
import { VisitReceipt } from './VisitReceipt'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
import type { Id, Machine, Run, Visit } from '../../domain/types'

/** Read-only history, three levels deep: runs → the machines in a run → the
 * numbers recorded at one machine.
 *
 * This exists for confidence rather than for work. Phase 1 records
 * everything and shows none of it back, so there is no way to confirm the
 * app kept what was typed except by re-opening a machine for counting —
 * which invites accidental edits to settled data. Nothing here is editable.
 *
 * The drill-down is held as local state rather than added to `App`'s screen
 * union: the three levels are one feature, and `App` should not have to know
 * how deep into it the operator is. */
export function HistoryScreen() {
  const [view, setView] = useState<'receipts' | 'report'>('receipts')
  const [runs, setRuns] = useState<Run[]>([])
  const [visitsByRun, setVisitsByRun] = useState<Map<Id, Visit[]>>(new Map())
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)

  const [openRun, setOpenRun] = useState<Run | null>(null)
  const [openVisit, setOpenVisit] = useState<Visit | null>(null)

  useEffect(() => {
    void (async () => {
      const [allRuns, allMachines] = await Promise.all([listRuns(), listMachines()])
      // One indexed lookup per run rather than a full scan of `visits`. The
      // estate produces a handful of runs a month, so this stays cheap and
      // reuses the query the machine list already relies on.
      const visits = await Promise.all(allRuns.map((r) => listVisitsForRun(r.id)))

      setRuns(allRuns)
      setMachines(allMachines)
      setVisitsByRun(new Map(allRuns.map((r, i) => [r.id, visits[i]])))
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return (
      <ScreenLayout header={<ScreenHeader title="History" />}>
        <div className="px-4 py-3 text-[13px]">Loading…</div>
      </ScreenLayout>
    )
  }

  const listHeader = (
    <ScreenHeader eyebrow={`${runs.length} RUNS RECORDED`} title="History" />
  )

  const machineById = new Map(machines.map((m) => [m.id, m]))

  const toggle = (
    <div className="flex border-b-2 border-rule-strong">
      {(['receipts', 'report'] as const).map((name) => (
        <button
          key={name}
          type="button"
          aria-pressed={view === name}
          onClick={() => setView(name)}
          className={`flex-1 px-4 py-2.5 text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] ${
            view === name ? 'bg-ink text-ground' : 'bg-ground text-neutral-700'
          }`}
        >
          {name === 'receipts' ? 'Receipts' : 'Report'}
        </button>
      ))}
    </div>
  )

  if (view === 'report') {
    // Landscape hands the whole screen to the stock sheet. Rotating back to
    // portrait is the way out — see ScreenLayout's `fullScreenInLandscape`.
    return (
      <ScreenLayout header={listHeader} stickyExtra={toggle} fullScreenInLandscape>
        <ReportScreen />
      </ScreenLayout>
    )
  }

  if (openRun && openVisit) {
    const machine = machineById.get(openVisit.machineId)
    if (machine) {
      return (
        <ScreenLayout
          header={
            <ScreenHeader
              back={{ label: `← ${formatRunDate(openRun.date)}`, onClick: () => setOpenVisit(null) }}
              state="READ ONLY"
              title={`L${machine.level}`}
              subtitle={distinctLabel(machine)}
            />
          }
        >
          <VisitReceipt visitId={openVisit.id} machine={machine} />
        </ScreenLayout>
      )
    }
  }

  if (openRun) {
    // Machine order, not insertion order — the operator walked the levels in
    // order and reads them back the same way.
    const visits = [...(visitsByRun.get(openRun.id) ?? [])].sort(
      (a, b) =>
        (machineById.get(a.machineId)?.level ?? 0) -
        (machineById.get(b.machineId)?.level ?? 0),
    )

    return (
      <ScreenLayout
        header={
          <ScreenHeader
            back={{ label: '← RUNS', onClick: () => setOpenRun(null) }}
            title={formatRunDate(openRun.date)}
            figure={`${visits.filter((v) => v.status === 'finalized').length} / ${machines.length}`}
          />
        }
      >
        {visits.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-neutral-500">
            No machines were counted in this run.
          </p>
        ) : (
          <ul>
            {visits.map((visit) => {
              const machine = machineById.get(visit.machineId)
              return (
                <li key={visit.id} className="border-b border-rule-light bg-paper">
                  <button
                    type="button"
                    aria-label={`visit to L${machine?.level ?? '?'}`}
                    onClick={() => setOpenVisit(visit)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  >
                    <span className="text-[15px] font-extrabold tabular-nums">
                      L{machine?.level ?? '?'}
                    </span>
                    {machine && distinctLabel(machine) && (
                      <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-700">
                        {distinctLabel(machine)}
                      </span>
                    )}
                    <span className="flex-1" />
                    {visit.status === 'finalized' ? (
                      <span
                        aria-label="Finished"
                        className="flex h-5 w-5 items-center justify-center bg-ink text-[11px] font-extrabold text-ground"
                      >
                        ✓
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent-700">
                        In progress
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ScreenLayout>
    )
  }

  return (
    <ScreenLayout header={listHeader} stickyExtra={toggle}>
      {runs.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-neutral-500">No runs recorded yet.</p>
      ) : (
        <ul>
          {runs.map((run) => {
            const finished = (visitsByRun.get(run.id) ?? [])
              .filter((v) => v.status === 'finalized').length
            const inProgress = finished < machines.length
            return (
              <li
                key={run.id}
                data-testid={`run-row-${run.date}`}
                className={`border-b border-rule-light bg-paper ${
                  inProgress ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''
                }`}
              >
                <button
                  type="button"
                  aria-label={`run ${run.date}`}
                  onClick={() => setOpenRun(run)}
                  className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-extrabold">
                      {formatRunDate(run.date)}
                    </span>
                    <span
                      className={`block text-[11px] font-medium ${
                        inProgress ? 'text-accent-700' : 'text-neutral-700'
                      }`}
                    >
                      {inProgress
                        ? `In progress · ${finished} of ${machines.length} counted`
                        : 'Complete'}
                    </span>
                  </span>
                  <span className="shrink-0 text-[19px] font-extrabold tabular-nums">
                    {finished} / {machines.length}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </ScreenLayout>
  )
}
