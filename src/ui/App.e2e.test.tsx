import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { listMachines, saveMachine } from '../data/repositories/machines'
import { getOrCreateRun, listRuns } from '../data/repositories/runs'
import { historyForMachine, openVisit, finalizeVisit } from '../data/repositories/visits'
import { levelKey, lastRecordedLevels } from '../domain/levels'
import { today } from '../domain/date'
import App from './App'
import { CountScreen } from './run/CountScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

// Fix-plan item 11. The nav used to be pinned to the bottom of the viewport,
// which on a phone is exactly where the thumb rests while scrolling a
// fifty-slot machine. Hitting it mid-count loses no data — the count screen
// restores from the draft — but it throws the operator out of the machine
// they are standing in front of. Navigation is used three times a run; the
// scroll area is used constantly, so the rare control is the one that moves.
describe('the global nav', () => {
  it('reaches the run history, so a recorded run can be checked without reopening it for counting', async () => {
    const user = userEvent.setup()
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await getOrCreateRun(today())
    const visit = await openVisit(run.id, machine.id)
    await finalizeVisit(visit.id)

    render(<App />)
    await screen.findByText('Finished')

    await user.click(screen.getByRole('button', { name: 'History' }))

    expect(await screen.findByLabelText(`run ${run.date}`)).toBeInTheDocument()
  })

  it('is pinned clear of the thumb at the top, not along the bottom edge', async () => {
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await getOrCreateRun(today())
    const visit = await openVisit(run.id, machine.id)
    await finalizeVisit(visit.id)

    render(<App />)

    // The "Finished" badge is the last thing the machine list's load sets, so
    // waiting for it means no query is still in flight when the next test's
    // beforeEach closes the database out from under one.
    await screen.findByText('Finished')

    const nav = screen.getByRole('navigation')
    expect(nav).toHaveClass('top-0')
    expect(nav).not.toHaveClass('bottom-0')
  })

  it('lets the History screen render wider than the phone column', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('button', { name: 'History' })

    // Every screen is a phone-width column except the matrix on History,
    // which would throw away everything landscape buys if it stayed capped.
    await user.click(screen.getByRole('button', { name: 'History' }))

    const shell = screen.getByRole('navigation').parentElement
    expect(shell).toHaveClass('lg:max-w-none')
  })

  it('keeps the Machines screen a phone-width column even on a wide viewport', async () => {
    render(<App />)
    await screen.findByRole('button', { name: 'History' })

    // The Machines screen is the default on load; it must not inherit the
    // History screen's widening.
    const shell = screen.getByRole('navigation').parentElement
    expect(shell).not.toHaveClass('lg:max-w-none')
  })
})

/** Spec §9's one happy path, from an empty database through the shipped
 * screens: catalogue an item into slots, walk to the machine, count it,
 * get interrupted, come back, fill, finalize, and find the next visit
 * pre-filled with what the machine was left at. */
describe('a machine, end to end', () => {
  it('records a visit and carries its closing levels into the next one', async () => {
    const user = userEvent.setup()

    // --- Set the estate up ---------------------------------------------
    // The roster is fixed and created by the seed, not hand-added through
    // a UI form (that form was removed — devs/debug/no-need-to-add-
    // machine.png), so the fixture machine is created directly here.
    await saveMachine({ level: 7, label: 'Lift lobby' })
    render(<App />)
    await screen.findByRole('button', { name: 'L7 Lift lobby' })

    await user.click(screen.getByRole('button', { name: 'Items' }))
    await user.click(await screen.findByRole('button', { name: '+ New' }))

    await user.type(await screen.findByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price'), '4.50')
    await user.type(screen.getByLabelText('Par level'), '8')
    await user.type(screen.getByLabelText('Box size'), '24')
    await user.click(screen.getByLabelText('Slot 58'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: '+ New' })

    // --- Walk to the machine and count -------------------------------------
    await user.click(screen.getByRole('button', { name: 'Machines' }))
    await user.click(await screen.findByRole('button', { name: 'L7 Lift lobby' }))

    await screen.findByText('Coke')
    const counted = screen.getByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '3')
    expect(screen.getByLabelText('slot 58 counted')).toHaveValue('3')

    // --- Interrupted: the bottom nav sits under the working thumb ----------
    await user.click(screen.getByRole('button', { name: 'Items' }))
    await screen.findByRole('button', { name: '+ New' })
    await user.click(screen.getByRole('button', { name: 'Machines' }))
    await user.click(await screen.findByRole('button', { name: 'L7 Lift lobby' }))

    await screen.findByText('Coke')
    // Not 0, and not last visit's level: the count entered before the screen
    // was unmounted comes back.
    await waitFor(() => {
      expect(screen.getByLabelText('slot 58 counted')).toHaveValue('3')
    })
    // And it is marked as already worked, not carried forward.
    expect(screen.getByLabelText('slot 58 counted')).not.toHaveClass('text-neutral-400')

    // --- Refill and finalize -------------------------------------------------
    // Fill is no longer a per-row button (§3.6) — the operator types the
    // capacity figure straight into Refilled to.
    const refilled = screen.getByLabelText('slot 58 refilled to')
    await user.clear(refilled)
    await user.type(refilled, '8')
    await user.click(screen.getByRole('button', { name: 'Finish machine' }))
    // Wait for the machine row, not just the screen: the row is what the
    // machine list's own load produces, so waiting on it keeps that update
    // inside the test rather than landing after it.
    //
    // Matched by prefix, because by this point the row also carries its
    // "Finished" badge and that is part of the button's accessible name. The
    // exact-name form used to pass only because the list painted its rows
    // before the finished-visit lookup resolved — this assertion was landing
    // in that gap. The list now waits for its whole load, so the settled row
    // is the only one there is.
    await screen.findByRole('button', { name: /^L7 Lift lobby/ })

    // One run for the day, one finalized visit, counted 3 and left at 8.
    expect(await listRuns()).toHaveLength(1)
    const [machine] = await listMachines()
    const history = await historyForMachine(machine.id)
    expect(history).toHaveLength(1)
    expect(history[0].visit.status).toBe('finalized')
    expect(history[0].lines[0]).toMatchObject({ slotNumber: 58, before: 3, after: 8 })

    const [{ itemId }] = history[0].lines
    expect(lastRecordedLevels(history).get(levelKey(58, itemId))).toBe(8)

    // --- The next run opens on what the machine was left at ----------------
    const nextRun = await getOrCreateRun(tomorrow())
    render(
      <CountScreen runId={nextRun.id} machineId={machine.id} onDone={vi.fn()} />,
    )

    const nextVisitCounted = (await screen.findAllByLabelText('slot 58 counted')).at(-1)
    expect(nextVisitCounted).toHaveValue('8')
    expect(nextVisitCounted).toHaveClass('text-neutral-400')
  })
})
