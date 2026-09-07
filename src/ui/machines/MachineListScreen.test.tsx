import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveMachine } from '../../data/repositories/machines'
import { createRun, getRun, listRuns } from '../../data/repositories/runs'
import { openVisit, putCountLine, finalizeVisit } from '../../data/repositories/visits'
import { recordTrolleyLoad } from '../../data/repositories/trolley'
import { newId, now } from '../../domain/ids'
import { today, formatRunDate } from '../../domain/date'
import { MachineListScreen } from './MachineListScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('MachineListScreen', () => {
  // Operator decision after the first device test (should-not-allow-deleting-
  // machines.png): the whole row is the "start count" tap target, Delete sat
  // at its right edge, and on confirm the row re-laid out so Confirm rendered
  // roughly where Delete just was — a fast double-tap deleted a machine and
  // cascaded its draft visit with no undo. The roster is fixed at fifteen,
  // created by the seed, so there is nothing to delete from the UI.
  it('offers no delete affordance for a machine', async () => {
    await saveMachine({ label: 'Lift lobby', level: 7 })

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)
    await screen.findByText('L7')

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
  })

  // The roster is fixed at fifteen machines, created once by the seed
  // (devs/debug/no-need-to-add-machine.png): hand-adding one invited the
  // duplicate-level problem the seed's own empty-roster guard exists to
  // prevent.
  it('offers no add-machine form', async () => {
    await saveMachine({ label: 'Lift lobby', level: 7 })

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)
    await screen.findByText('L7')

    expect(screen.queryByLabelText('Level')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Location')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
  })

  // The list never looked at visits, so a finished machine was
  // indistinguishable from an untouched one
  // (devs/debug/should-indicate-which-machine-is-finished.png) — the top
  // item in known-gaps.md. A status indicator, not a gate: the amended spec
  // §7 makes finishing a machine editable again, so re-entering a finished
  // machine must still open it. §4 drops the "Finished" pill in favour of a
  // `data-finished` marker on the row plus the filled tick in its third
  // column — see the dedicated test below.
  it('marks a machine whose visit in today\'s run is finalized, and only that one', async () => {
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const l9 = await saveMachine({ label: 'Pool corridor', level: 9 })
    const run = await createRun(today())
    const visit = await openVisit(run.id, l7.id)
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: 58, itemId: newId(),
      before: 2, after: 5, touched: true, filled: false, price: 0, updatedAt: now(),
    })
    await finalizeVisit(visit.id)

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)
    await screen.findByText('L7')

    expect(screen.getByTestId(`machine-row-${l7.id}`)).toHaveAttribute('data-finished', 'true')
    expect(screen.getByTestId(`machine-row-${l9.id}`)).not.toHaveAttribute('data-finished', 'true')
  })

  it('still lets a finished machine be re-opened for counting', async () => {
    const user = userEvent.setup()
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun(today())
    const visit = await openVisit(run.id, l7.id)
    await finalizeVisit(visit.id)

    const onCount = vi.fn()
    render(<MachineListScreen onCount={onCount} onViewMap={vi.fn()} onTrolley={vi.fn()} />)
    await screen.findByText('L7')

    await user.click(screen.getByRole('button', { name: /^L7/ }))
    await vi.waitFor(() => expect(onCount).toHaveBeenCalledWith(l7, run.id))
  })

  it('does not mark a machine with no visit in today\'s run', async () => {
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)
    await screen.findByText('L7')

    expect(screen.getByTestId(`machine-row-${l7.id}`)).not.toHaveAttribute('data-finished', 'true')
  })

  // The seed writes "Level 2" as machine L2's label, so the grey location
  // text duplicated the bold "L2" chip on every row
  // (devs/debug/machine-list-page-no-need-location.png). Spec §4.1 still
  // defines a machine as being at a location (e.g. "L7 · Lift lobby"), so a
  // genuinely distinct label must keep showing.
  it("hides a machine's label when it just restates the level", async () => {
    await saveMachine({ label: 'Level 2', level: 2 })

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)
    await screen.findByText('L2')

    expect(screen.queryByText('Level 2')).not.toBeInTheDocument()
  })

  // §4's state text folds a genuinely distinct label into the "not counted"
  // line itself (`Lift lobby · not counted`) rather than showing it as a
  // separate chip — it is the one state where knowing *where* the machine is
  // is worth the row's word count.
  it("keeps showing a machine's label when it differs from the level", async () => {
    await saveMachine({ label: 'Lift lobby', level: 7 })

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)

    expect(await screen.findByText('Lift lobby · not counted')).toBeInTheDocument()
  })

  // fix-plan 2026-08-27, item 1 (critical). Before the fix, `today()` used
  // `toISOString()` (UTC). At 2026-08-28T00:30 Australia/Adelaide — before
  // the operator's real 09:30 start, and a plausible time to open the app —
  // that is still 2026-08-27T15:00Z, so the broken version would start
  // (and look up finished machines against) the *previous* local day's run:
  // tonight's device-test run, not tomorrow's real one.
  describe('local calendar day, not UTC (fix-plan 2026-08-27, item 1)', () => {
    const originalTZ = process.env.TZ

    beforeEach(() => {
      process.env.TZ = 'Australia/Adelaide'
      // Only fake `Date` — leaving timers real lets the async IndexedDB
      // reads and `findBy*` polling underneath this screen resolve normally.
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-08-27T15:00:00Z')) // 2026-08-28T00:30 local
    })

    afterEach(() => {
      vi.useRealTimers()
      process.env.TZ = originalTZ
    })

    it('starts a run dated the local day, not the UTC day', async () => {
      const user = userEvent.setup()
      await saveMachine({ label: 'Lift lobby', level: 7 })
      const onCount = vi.fn()

      render(<MachineListScreen onCount={onCount} onViewMap={vi.fn()} onTrolley={vi.fn()} />)
      await screen.findByText('L7')

      await user.click(screen.getByRole('button', { name: /^L7/ }))
      await vi.waitFor(() => expect(onCount).toHaveBeenCalled())

      const run = await getRun(onCount.mock.calls[0][1])
      expect(run?.date).toBe('2026-08-28')
      expect(run?.date).not.toBe('2026-08-27')
    })

    it('marks a machine finished against the local day\'s run, not the UTC day\'s', async () => {
      // This is the dangerous half of the bug: a machine finalized under
      // tonight's *local* run date must still show as finished when the
      // list is viewed at this same local instant. A UTC-based lookup would
      // miss it (wrong run) and, worse, a UTC-based `startCount` would
      // resurrect *yesterday's* run and silently upsert into it instead.
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      const run = await createRun(today())
      const visit = await openVisit(run.id, l7.id)
      await finalizeVisit(visit.id)

      render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)
      await screen.findByText('L7')
      expect(screen.getByTestId(`machine-row-${l7.id}`)).toHaveAttribute('data-finished', 'true')
    })
  })

  // Until now a run was created silently, the first time a machine was
  // tapped, and nothing ever showed that it had happened. §4 absorbs the old
  // "run header" bar into the screen header itself: the date is the eyebrow,
  // the progress figure is the title-row figure, and "Start run" /
  // "Continue L{n} →" move into a footer action rather than living inline.
  describe('the header and footer', () => {
    it("shows NO RUN STARTED in the eyebrow when today has none", async () => {
      await saveMachine({ label: 'Lift lobby', level: 7 })

      render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)

      expect(await screen.findByText('NO RUN STARTED')).toBeInTheDocument()
    })

    it('offers Start run in the footer when no run exists', async () => {
      await saveMachine({ label: 'Lift lobby', level: 7 })

      render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)

      expect(await screen.findByRole('button', { name: 'Start run' })).toBeInTheDocument()
    })

    it('creates the run for the local day when Start run is tapped', async () => {
      const user = userEvent.setup()
      await saveMachine({ label: 'Lift lobby', level: 7 })

      render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)
      await user.click(await screen.findByRole('button', { name: 'Start run' }))

      // Fix round 2: wait for the screen's OWN re-render, not the DB write
      // underneath it. `startRun` awaits `getOrCreateRun` (the write commits)
      // and only then awaits `reload()`, which does its own further reads
      // before calling setState — so a direct `listRuns()` read can already
      // see the new run while this screen's footer has not yet re-rendered
      // without it. Asserting against the DB first and the UI second (via a
      // bare `expect` right after that `waitFor` resolved) raced those two
      // and was flaky ~1 run in 5. No machine is in progress yet, so once
      // the screen's own reload settles the footer has nothing left to
      // offer — it does not linger as a stale "Start run".
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument()
      })
      expect((await listRuns()).map((r) => r.date)).toEqual([today()])
    })

    // puts the run date in the eyebrow and the progress in the header
    // figure (task-7-brief.md step 1).
    it('puts the run date in the eyebrow and the progress in the header figure', async () => {
      const machines = []
      for (let level = 1; level <= 15; level++) {
        machines.push(await saveMachine({ label: `Level ${level}`, level }))
      }
      const run = await createRun(today())
      for (const m of machines.slice(0, 3)) {
        const visit = await openVisit(run.id, m.id)
        await finalizeVisit(visit.id)
      }

      render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)

      expect(await screen.findByText(new RegExp(`^RUN · ${formatRunDate(today()).toUpperCase()}$`)))
        .toBeInTheDocument()
      expect(screen.getByText('3 / 15')).toBeInTheDocument()
    })

    // marks a finished machine without a Finished pill (task-7-brief.md
    // step 1) — the row carries `data-finished` and the filled tick instead
    // of the pill defect #1 originally shipped as text.
    it('marks a finished machine without a Finished pill', async () => {
      const l7 = await saveMachine({ id: 'm7', label: 'Lift lobby', level: 7 })
      const run = await createRun(today())
      const visit = await openVisit(run.id, l7.id)
      await finalizeVisit(visit.id)

      render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />)

      expect(screen.queryByText('Finished')).not.toBeInTheDocument()
      expect(await screen.findByTestId('machine-row-m7')).toHaveAttribute('data-finished', 'true')
    })

    it('reuses the run it just started when a machine is then counted', async () => {
      const user = userEvent.setup()
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      const onCount = vi.fn()

      render(<MachineListScreen onCount={onCount} onViewMap={vi.fn()} onTrolley={vi.fn()} />)
      await user.click(await screen.findByRole('button', { name: 'Start run' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Start run' })).toBeNull())

      // Entering the machine (rather than tapping a footer that, with
      // nothing yet in progress, no longer offers anything) is the second
      // entry point into the same idempotent run.
      await user.click(screen.getByRole('button', { name: /^L7/ }))
      await waitFor(() => expect(onCount).toHaveBeenCalled())

      const runs = await listRuns()
      expect(runs).toHaveLength(1)
      expect(onCount).toHaveBeenCalledWith(l7, runs[0].id)
    })

    it('offers Continue L{n} in the footer once a machine is in progress, landing on the same run', async () => {
      const user = userEvent.setup()
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      const run = await createRun(today())
      // Entering a machine to count it opens a draft visit (useCounting's
      // mount effect, not this screen) before anything in it is touched —
      // simulated directly here since this screen never calls `openVisit`
      // itself.
      await openVisit(run.id, l7.id)

      const onCount = vi.fn()
      render(<MachineListScreen onCount={onCount} onViewMap={vi.fn()} onTrolley={vi.fn()} />)

      const resume = await screen.findByRole('button', { name: 'Continue L7 →' })
      expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument()

      await user.click(resume)
      await waitFor(() => expect(onCount).toHaveBeenCalledWith(l7, run.id))
    })

    // Design §12.6: the footer's third state. The trolley is loaded once, at
    // G, before the walk starts (D4) — so the moment the footer offers it is
    // the moment a run exists and nothing has been counted yet. It is reached
    // from here rather than from a fifth nav tab, which there is no room for
    // on a phone (design §12.1, Phase 2 §7.2).
    it('offers Load trolley on the machines footer before anything is counted', async () => {
      const user = userEvent.setup()
      await saveMachine({ label: 'Lift lobby', level: 7 })
      const run = await createRun(today())
      const onTrolley = vi.fn()

      render(
        <MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={onTrolley} />,
      )

      expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument()
      await user.click(await screen.findByRole('button', { name: 'Load trolley' }))

      expect(onTrolley).toHaveBeenCalledWith(run.id, 'load')
    })

    // Design §12.6 and spec §7 step 5: the last thing the run asks for. It
    // replaces `Load trolley` once every machine that is going to be counted
    // has been — at which point there is nothing left to load for.
    it('offers Return leftovers once every machine has been counted', async () => {
      const user = userEvent.setup()
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      const run = await createRun(today())
      await finalizeVisit((await openVisit(run.id, l7.id)).id)
      const onTrolley = vi.fn()

      render(
        <MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={onTrolley} />,
      )

      expect(screen.queryByRole('button', { name: 'Load trolley' })).not.toBeInTheDocument()
      await user.click(await screen.findByRole('button', { name: 'Return leftovers' }))

      expect(onTrolley).toHaveBeenCalledWith(run.id, 'return')
    })

    it('says in the eyebrow that the trolley is loaded, once it is', async () => {
      await saveMachine({ label: 'Lift lobby', level: 7 })
      const run = await createRun(today())
      await recordTrolleyLoad({
        runId: run.id, itemId: newId(), needed: 7, taken: 24, noneLeftInG: false,
      })

      render(
        <MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} onTrolley={vi.fn()} />,
      )

      expect(await screen.findByText(/TROLLEY LOADED$/)).toBeInTheDocument()
    })
  })
})
