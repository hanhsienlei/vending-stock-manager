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

// Not `new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)` — that
// is exactly the bug `domain/date.ts`'s `today()` doc-comment warns about,
// reintroduced here. `toISOString` reports the UTC calendar day; in a zone
// ahead of UTC (this app's, Australia/Adelaide, UTC+9:30) the UTC day is
// still "today" until well into the local morning, so adding 24h in UTC and
// slicing lands back on today's *local* date rather than tomorrow's — the
// same date `today()` (below) returns. `getOrCreateRun`/`openVisit` then
// resolve to the SAME run and visit already finalized earlier in this test,
// not a fresh one, so the "next visit" this test renders is the prior
// visit's own record (its own `before`, not last visit's carried `after`).
// Not order-sensitive — it reproduces on every run, deterministically,
// whenever the machine's local clock is between local midnight and the
// UTC+9:30 rollover (09:30 local) — which is exactly when a real restock run
// starts. Computed from `today()` plus one calendar day in local time
// instead, so it always names the day after whatever `today()` names.
const tomorrow = () => {
  const [year, month, day] = today().split('-').map(Number)
  return new Date(year, month - 1, day + 1).toLocaleDateString('en-CA')
}

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
    // §4 drops the "Finished" pill text in favour of a filled tick with an
    // aria-label of the same word — findByText no longer matches it.
    await screen.findByLabelText('Finished')

    await user.click(screen.getByRole('button', { name: 'History' }))

    expect(await screen.findByLabelText(`run ${run.date}`)).toBeInTheDocument()
  })

  it('is pinned clear of the thumb at the top, not along the bottom edge', async () => {
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await getOrCreateRun(today())
    const visit = await openVisit(run.id, machine.id)
    await finalizeVisit(visit.id)

    render(<App />)

    // The "Finished" tick is the last thing the machine list's load sets, so
    // waiting for it means no query is still in flight when the next test's
    // beforeEach closes the database out from under one.
    await screen.findByLabelText('Finished')

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
    // Asserts the REQUIREMENT — no width cap — rather than the mechanism.
    // This previously asserted `lg:max-w-none`, which passed while the screen
    // was still capped on the device it was written for: Tailwind's `lg` is
    // 1024px and an iPhone 15 in landscape is 852px, so `max-w-lg` (512px)
    // never lifted and the operator got a narrow centred column. A test that
    // names the class cannot catch a class that never fires.
    expect(shell).not.toHaveClass('max-w-lg')
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
    const app = render(<App />)
    // §4: a distinct label is folded into the row's "not counted" state
    // text rather than shown as its own chip.
    await screen.findByRole('button', { name: 'L7 Lift lobby · not counted' })

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
    await user.click(await screen.findByRole('button', { name: 'L7 Lift lobby · not counted' }))

    await screen.findByText('Coke')
    const counted = screen.getByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '3')
    expect(screen.getByLabelText('slot 58 counted')).toHaveValue('3')

    // --- Interrupted: the bottom nav sits under the working thumb ----------
    await user.click(screen.getByRole('button', { name: 'Items' }))
    await screen.findByRole('button', { name: '+ New' })
    await user.click(screen.getByRole('button', { name: 'Machines' }))
    // The row's state text has moved on from "not counted": entering the
    // machine a moment ago opened a draft visit (useCounting's mount
    // effect), which §4's state text renders as "In progress" — the label
    // that only shows in the not-counted state is gone from here on.
    await user.click(await screen.findByRole('button', { name: 'L7 In progress' }))

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
    // §4's finished state text is "Counted" on its own — the distinct label
    // only ever shows in the not-counted state, so it is gone from the row's
    // accessible name by this point too.
    await screen.findByRole('button', { name: 'L7 Counted' })

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
    // Unmount the first screen before rendering the second: otherwise both
    // are on screen at once and `findAllByLabelText('slot 58 counted')`
    // resolves as soon as the FIRST screen's still-mounted input satisfies
    // it, before the second screen (this test's actual subject) has
    // rendered its own. That raced the assertion below against React's
    // render of the fresh screen and made it order-sensitive.
    app.unmount()
    const nextRun = await getOrCreateRun(tomorrow())
    render(
      <CountScreen runId={nextRun.id} machine={machine} onDone={vi.fn()} />,
    )

    const nextVisitCounted = await screen.findByLabelText('slot 58 counted')
    expect(nextVisitCounted).toHaveValue('8')
    expect(nextVisitCounted).toHaveClass('text-neutral-400')
  })
})
