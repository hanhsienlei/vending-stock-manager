import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveMachine } from '../../data/repositories/machines'
import { createRun, getRun, listRuns } from '../../data/repositories/runs'
import { openVisit, putCountLine, finalizeVisit } from '../../data/repositories/visits'
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

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)
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

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)
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
  // machine must still open it.
  it('marks a machine whose visit in today\'s run is finalized, and only that one', async () => {
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await saveMachine({ label: 'Pool corridor', level: 9 })
    const run = await createRun(today())
    const visit = await openVisit(run.id, l7.id)
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: 58, itemId: newId(),
      before: 2, after: 5, touched: true, filled: false, price: 0, updatedAt: now(),
    })
    await finalizeVisit(visit.id)

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)
    await screen.findByText('L7')

    const l7Row = screen.getByRole('button', { name: /^L7/ }).closest('li')
    const l9Row = screen.getByRole('button', { name: /^L9/ }).closest('li')
    expect(l7Row).toHaveTextContent(/finished/i)
    expect(l9Row).not.toHaveTextContent(/finished/i)
  })

  it('still lets a finished machine be re-opened for counting', async () => {
    const user = userEvent.setup()
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun(today())
    const visit = await openVisit(run.id, l7.id)
    await finalizeVisit(visit.id)

    const onCount = vi.fn()
    render(<MachineListScreen onCount={onCount} onViewMap={vi.fn()} />)
    await screen.findByText('L7')

    await user.click(screen.getByRole('button', { name: /^L7/ }))
    await vi.waitFor(() => expect(onCount).toHaveBeenCalledWith(l7.id, run.id))
  })

  it('does not mark a machine with no visit in today\'s run', async () => {
    await saveMachine({ label: 'Lift lobby', level: 7 })

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)
    const l7Row = (await screen.findByRole('button', { name: 'L7 Lift lobby' })).closest('li')

    expect(l7Row).not.toHaveTextContent(/finished/i)
  })

  // The seed writes "Level 2" as machine L2's label, so the grey location
  // text duplicated the bold "L2" chip on every row
  // (devs/debug/machine-list-page-no-need-location.png). Spec §4.1 still
  // defines a machine as being at a location (e.g. "L7 · Lift lobby"), so a
  // genuinely distinct label must keep showing.
  it("hides a machine's label when it just restates the level", async () => {
    await saveMachine({ label: 'Level 2', level: 2 })

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)
    await screen.findByText('L2')

    expect(screen.queryByText('Level 2')).not.toBeInTheDocument()
  })

  it("keeps showing a machine's label when it differs from the level", async () => {
    await saveMachine({ label: 'Lift lobby', level: 7 })

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)

    expect(await screen.findByText('Lift lobby')).toBeInTheDocument()
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

      render(<MachineListScreen onCount={onCount} onViewMap={vi.fn()} />)
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

      render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)
      const l7Row = (await screen.findByRole('button', { name: /^L7/ })).closest('li')
      expect(l7Row).toHaveTextContent(/finished/i)
    })
  })

  // Until now a run was created silently, the first time a machine was
  // tapped, and nothing ever showed that it had happened. The header makes
  // today's run visible: which day the app thinks it is, whether the run has
  // started, and how far through the estate it is.
  describe('the run header', () => {
    it("shows today's date", async () => {
      await saveMachine({ label: 'Lift lobby', level: 7 })

      render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)

      expect(await screen.findByLabelText('run header')).toHaveTextContent(
        formatRunDate(today()),
      )
    })

    it('offers to start the run when today has none', async () => {
      await saveMachine({ label: 'Lift lobby', level: 7 })

      render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)

      expect(await screen.findByRole('button', { name: 'Start run' })).toBeInTheDocument()
    })

    it('creates the run for the local day when tapped', async () => {
      const user = userEvent.setup()
      await saveMachine({ label: 'Lift lobby', level: 7 })

      render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)
      await user.click(await screen.findByRole('button', { name: 'Start run' }))

      await waitFor(async () => {
        expect((await listRuns()).map((r) => r.date)).toEqual([today()])
      })
    })

    it('replaces the button with progress once the run exists', async () => {
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      await saveMachine({ label: 'Gym', level: 8 })
      const run = await createRun(today())
      const visit = await openVisit(run.id, l7.id)
      await finalizeVisit(visit.id)

      render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)

      expect(await screen.findByLabelText('run header')).toHaveTextContent('1 of 2 counted')
      expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument()
    })

    // Starting a run and then tapping a machine must not produce two runs for
    // one day — `getOrCreateRun` is idempotent per date, and this pins it
    // across the two entry points now that both exist.
    it('reuses the run it just started when a machine is then counted', async () => {
      const user = userEvent.setup()
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      const onCount = vi.fn()

      render(<MachineListScreen onCount={onCount} onViewMap={vi.fn()} />)
      await user.click(await screen.findByRole('button', { name: 'Start run' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Start run' })).toBeNull())

      await user.click(screen.getByRole('button', { name: /^L7/ }))

      await waitFor(() => expect(onCount).toHaveBeenCalled())
      const runs = await listRuns()
      expect(runs).toHaveLength(1)
      expect(onCount).toHaveBeenCalledWith(l7.id, runs[0].id)
    })
  })
})
