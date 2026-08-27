import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../../data/db'
import { saveMachine } from '../../data/repositories/machines'
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
})
