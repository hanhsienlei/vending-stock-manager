import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveMachine } from '../../data/repositories/machines'
import { createRun } from '../../data/repositories/runs'
import { openVisit, putCountLine, finalizeVisit } from '../../data/repositories/visits'
import { newId, now } from '../../domain/ids'
import { MachineListScreen } from './MachineListScreen'

const today = () => new Date().toISOString().slice(0, 10)

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
      before: 2, after: 5, touched: true, filled: false, updatedAt: now(),
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
})
