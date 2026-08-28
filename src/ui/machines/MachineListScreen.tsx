import { useEffect, useState } from 'react'
import { listMachines } from '../../data/repositories/machines'
import { getOrCreateRun, getRunForDate } from '../../data/repositories/runs'
import { listVisitsForRun } from '../../data/repositories/visits'
import { distinctLabel } from './machineLabel'
import { today, formatRunDate } from '../../domain/date'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
import type { Id, Machine, Run } from '../../domain/types'

export function MachineListScreen({
  onCount, onViewMap,
}: {
  onCount: (machine: Machine, runId: Id) => void
  onViewMap: (machine: Machine) => void
}) {
  const [machines, setMachines] = useState<Machine[]>([])
  // Today's run, or null if it has not been started. Held so the header can
  // say which day the app thinks it is and how far through the estate the
  // run has got — until now a run was created silently on the first machine
  // tap and nothing ever showed that it had happened.
  const [todaysRun, setTodaysRun] = useState<Run | null>(null)
  // Without this the header paints before the first read finishes, so a run
  // that already exists shows "Start run" for a frame. Harmless to tap —
  // `getOrCreateRun` is idempotent — but this screen's job is now to tell the
  // operator what state the run is in, and briefly telling them the wrong
  // thing is the opposite of that.
  const [loading, setLoading] = useState(true)
  // Status indicator only, never a gate — the amended spec §7 makes a
  // finished machine editable again, so this set only decides what a row
  // shows, never whether `startCount` below is allowed to run.
  const [finishedMachineIds, setFinishedMachineIds] = useState<Set<Id>>(new Set())

  async function reload() {
    setMachines(await listMachines())

    // A read-only lookup — never getOrCreateRun — so merely viewing this
    // screen can't mint an empty run before the operator starts counting.
    const run = await getRunForDate(today())
    setTodaysRun(run ?? null)
    if (!run) {
      setFinishedMachineIds(new Set())
      setLoading(false)
      return
    }
    const visits = await listVisitsForRun(run.id)
    setFinishedMachineIds(
      new Set(visits.filter((v) => v.status === 'finalized').map((v) => v.machineId)),
    )
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  async function startRun() {
    await getOrCreateRun(today())
    await reload()
  }

  async function startCount(machine: Machine) {
    const run = await getOrCreateRun(today())
    onCount(machine, run.id)
  }

  // Title-only for now (task 3): this screen's own spec section — eyebrow,
  // figure, progress rule — belongs to a later task. See task-3-brief.md
  // decision #1.
  const header = <ScreenHeader title="Machines" />

  if (loading) {
    return (
      <ScreenLayout header={header}>
        <div className="p-4">Loading…</div>
      </ScreenLayout>
    )
  }

  return (
    <ScreenLayout header={header}>
      <div className="p-4">
        <h2 className="mb-3 text-lg font-semibold">Machines</h2>

        <div
          aria-label="run header"
          className="mb-3 flex items-center gap-2 rounded-lg border bg-gray-50 p-3"
        >
          <span className="flex-1 text-sm font-semibold">{formatRunDate(today())}</span>
          {todaysRun ? (
            <span className="text-sm text-gray-500">
              {finishedMachineIds.size} of {machines.length} counted
            </span>
          ) : (
            // Explicit, but not a gate: tapping a machine still starts the run
            // on its own. `getOrCreateRun` is idempotent per date, so both
            // entry points land on the same run.
            <button
              type="button"
              onClick={() => void startRun()}
              className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white"
            >
              Start run
            </button>
          )}
        </div>

        <ul className="flex flex-col gap-2">
          {machines.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg border p-3">
              <button
                type="button"
                onClick={() => void startCount(m)}
                className="flex-1 text-left"
              >
                <span className="font-semibold">L{m.level}</span>
                {distinctLabel(m) && (
                  <span className="ml-2 text-gray-500">{distinctLabel(m)}</span>
                )}
                {finishedMachineIds.has(m.id) && (
                  <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold uppercase text-green-700">
                    Finished
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={`View map for L${m.level}`}
                onClick={() => onViewMap(m)}
                className="text-xs font-bold text-blue-600"
              >
                Map
              </button>
            </li>
          ))}
        </ul>
      </div>
    </ScreenLayout>
  )
}
