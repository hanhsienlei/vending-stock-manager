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
        <div className="p-4">Loading…</div>
      </ScreenLayout>
    )
  }

  // Same header on every one of this screen's states, including the two
  // levels of drill-down below: the nested back affordance those states
  // deserve (§2) is a later task's work (task-3-brief.md decision #1), so
  // for now they keep the top-level `History` chrome and their own existing
  // inline "← Back" control rather than losing the tab bar altogether.
  const header = <ScreenHeader eyebrow={`${runs.length} RUNS RECORDED`} title="History" />

  const machineById = new Map(machines.map((m) => [m.id, m]))

  const toggle = (
    <div className="mb-3 flex gap-2">
      <button
        type="button"
        onClick={() => setView('receipts')}
        className={`flex-1 rounded-lg border p-2 text-sm font-semibold ${
          view === 'receipts' ? 'bg-blue-600 text-white' : 'text-gray-700'
        }`}
      >
        Receipts
      </button>
      <button
        type="button"
        onClick={() => setView('report')}
        className={`flex-1 rounded-lg border p-2 text-sm font-semibold ${
          view === 'report' ? 'bg-blue-600 text-white' : 'text-gray-700'
        }`}
      >
        Report
      </button>
    </div>
  )

  if (view === 'report') {
    return (
      <ScreenLayout header={header}>
        <div className="p-4">
          {toggle}
          <ReportScreen />
        </div>
      </ScreenLayout>
    )
  }

  if (openRun && openVisit) {
    const machine = machineById.get(openVisit.machineId)
    if (machine) {
      return (
        <ScreenLayout header={header}>
          <VisitReceipt
            visitId={openVisit.id}
            machine={machine}
            onBack={() => setOpenVisit(null)}
          />
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
      <ScreenLayout header={header}>
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setOpenRun(null)}
              className="text-blue-600"
            >
              ← Back
            </button>
            <span className="text-sm font-semibold">{formatRunDate(openRun.date)}</span>
          </div>

          {visits.length === 0 ? (
            <p className="text-sm text-gray-500">No machines were counted in this run.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visits.map((visit) => {
                const machine = machineById.get(visit.machineId)
                return (
                  <li key={visit.id}>
                    <button
                      type="button"
                      aria-label={`visit to L${machine?.level ?? '?'}`}
                      onClick={() => setOpenVisit(visit)}
                      className="flex w-full items-center gap-2 rounded-lg border p-3 text-left"
                    >
                      <span className="font-semibold">L{machine?.level ?? '?'}</span>
                      {machine && distinctLabel(machine) && (
                        <span className="text-gray-500">{distinctLabel(machine)}</span>
                      )}
                      <span className="flex-1" />
                      {visit.status === 'finalized' ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold uppercase text-green-700">
                          Finished
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase text-amber-700">
                          In progress
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </ScreenLayout>
    )
  }

  return (
    <ScreenLayout header={header}>
      <div className="p-4">
        <h2 className="mb-3 text-lg font-semibold">History</h2>
        {toggle}

        {runs.length === 0 ? (
          <p className="text-sm text-gray-500">No runs recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {runs.map((run) => {
              const finished = (visitsByRun.get(run.id) ?? [])
                .filter((v) => v.status === 'finalized').length
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    aria-label={`run ${run.date}`}
                    onClick={() => setOpenRun(run)}
                    className="flex w-full items-center gap-2 rounded-lg border p-3 text-left"
                  >
                    <span className="flex-1 font-semibold">{formatRunDate(run.date)}</span>
                    <span className="text-sm text-gray-500">
                      {finished} of {machines.length} counted
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </ScreenLayout>
  )
}
