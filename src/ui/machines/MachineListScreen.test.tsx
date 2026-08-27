import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { listMachines, saveMachine } from '../../data/repositories/machines'
import { MachineListScreen } from './MachineListScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('MachineListScreen', () => {
  // Destructive, so it needs a second tap — and it must not sit where the
  // thumb lands on the primary "start count" tap target.
  it('requires a second tap to delete a machine', async () => {
    const user = userEvent.setup()
    await saveMachine({ label: 'Lift lobby', level: 7 })

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)
    await screen.findByText('L7')

    await user.click(screen.getByRole('button', { name: 'Delete L7' }))
    expect(await listMachines()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Confirm delete L7' }))
    await waitFor(async () => expect(await listMachines()).toHaveLength(0))
  })

  it('lets a machine delete be cancelled before the second tap', async () => {
    const user = userEvent.setup()
    await saveMachine({ label: 'Lift lobby', level: 7 })

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)
    await screen.findByText('L7')

    await user.click(screen.getByRole('button', { name: 'Delete L7' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(
      screen.queryByRole('button', { name: 'Confirm delete L7' }),
    ).not.toBeInTheDocument()
    expect(await listMachines()).toHaveLength(1)
  })

  it('does not disturb another machine\'s row while one is mid-confirm', async () => {
    const user = userEvent.setup()
    await saveMachine({ label: 'Lift lobby', level: 7 })
    await saveMachine({ label: 'Pool corridor', level: 9 })

    render(<MachineListScreen onCount={vi.fn()} onViewMap={vi.fn()} />)
    await screen.findByText('L7')

    await user.click(screen.getByRole('button', { name: 'Delete L7' }))

    expect(screen.getByRole('button', { name: 'Delete L9' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Confirm delete L9' }),
    ).not.toBeInTheDocument()
  })
})
