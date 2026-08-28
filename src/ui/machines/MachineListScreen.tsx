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
  // that already exists shows "no run started" for a frame. Harmless to tap —
  // `getOrCreateRun` is idempotent — but this screen's job is now to tell the
  // operator what state the run is in, and briefly telling them the wrong
  // thing is the opposite of that.
  const [loading, setLoading] = useState(true)
  // Status indicator only, never a gate — the amended spec §7 makes a
  // finished machine editable again, so this set only decides what a row
  // shows, never whether `startCount` below is allowed to run.
  const [finishedMachineIds, setFinishedMachineIds] = useState<Set<Id>>(new Set())
  // A visit exists for today's run but has not been finalized — the machine
  // has been entered this run but not finished. Derived from the same
  // `listVisitsForRun` read as `finishedMachineIds`, so this costs no extra
  // query.
  const [inProgressMachineIds, setInProgressMachineIds] = useState<Set<Id>>(new Set())

  async function reload() {
    setMachines(await listMachines())

    // A read-only lookup — never getOrCreateRun — so merely viewing this
    // screen can't mint an empty run before the operator starts counting.
    const run = await getRunForDate(today())
    setTodaysRun(run ?? null)
    if (!run) {
      setFinishedMachineIds(new Set())
      setInProgressMachineIds(new Set())
      setLoading(false)
      return
    }
    const visits = await listVisitsForRun(run.id)
    setFinishedMachineIds(
      new Set(visits.filter((v) => v.status === 'finalized').map((v) => v.machineId)),
    )
    setInProgressMachineIds(
      new Set(visits.filter((v) => v.status === 'draft').map((v) => v.machineId)),
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

  // The run header block from before this task is gone: the date is now the
  // eyebrow, the progress figure is the title-row figure (§4, §2). While the
  // first load is in flight neither is known yet, so both are withheld
  // rather than guessing "no run started" for a frame.
  const header = (
    <ScreenHeader
      eyebrow={
        loading ? undefined : todaysRun
          ? `RUN · ${formatRunDate(today()).toUpperCase()}`
          : 'NO RUN STARTED'
      }
      title="Machines"
      figure={!loading && todaysRun ? `${finishedMachineIds.size} / ${machines.length}` : undefined}
    />
  )

  if (loading) {
    return (
      <ScreenLayout header={header}>
        <div className="p-4">Loading…</div>
      </ScreenLayout>
    )
  }

  // The single machine the footer offers to jump back into — the first
  // (lowest-level) machine with an open, unfinished visit this run. When
  // more than one is open at once (the operator hopped away mid-count) the
  // footer can only ever point at one, so the walk order breaks the tie.
  const inProgressMachine = machines.find((m) => inProgressMachineIds.has(m.id))

  return (
    <ScreenLayout header={header}>
      <ul>
        {machines.map((m) => {
          const finished = finishedMachineIds.has(m.id)
          const inProgress = !finished && inProgressMachineIds.has(m.id)
          const label = distinctLabel(m)
          // §4's four state strings. Times like `08:14` and slot counts like
          // `54 slots` need `visit.updatedAt` / a count-line read this screen
          // does not otherwise do — 2026-08-28 decision: no screen may gain a
          // repository call for this, so the finished and in-progress states
          // render bare rather than adding one.
          const stateText = finished
            ? 'Counted'
            : inProgress
              ? 'In progress'
              : label
                ? `${label} · not counted`
                : 'Not counted'

          return (
            <li
              key={m.id}
              data-testid={`machine-row-${m.id}`}
              data-finished={finished ? 'true' : undefined}
              className={`grid grid-cols-[46px_1fr_auto] items-center gap-2 border-b border-rule-light bg-paper px-4 py-3.5 ${
                inProgress ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => void startCount(m)}
                className="contents text-left"
              >
                <span className="text-[22px] font-extrabold tabular-nums">{`L${m.level}`}</span>
                <span
                  className={`text-[14px] font-semibold ${
                    finished || inProgress ? '' : 'text-neutral-500'
                  }`}
                >
                  {stateText}
                </span>
              </button>
              {finished ? (
                <span
                  aria-label="Finished"
                  className="flex h-5 w-5 items-center justify-center bg-ink text-[12px] font-bold text-ground"
                >
                  ✓
                </span>
              ) : inProgress ? (
                <button
                  type="button"
                  onClick={() => void startCount(m)}
                  className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-accent"
                >
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={`View map for L${m.level}`}
                  onClick={() => onViewMap(m)}
                  className="text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-600"
                >
                  Map
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {!todaysRun ? (
        <div className="border-t-2 border-rule-strong">
          <button
            type="button"
            onClick={() => void startRun()}
            className="w-full bg-accent px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-ground"
          >
            Start run
          </button>
        </div>
      ) : (
        inProgressMachine && (
          <div className="border-t-2 border-rule-strong">
            <button
              type="button"
              onClick={() => void startCount(inProgressMachine)}
              className="w-full bg-accent px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-ground"
            >
              {`Continue L${inProgressMachine.level} →`}
            </button>
          </div>
        )
      )}
    </ScreenLayout>
  )
}
