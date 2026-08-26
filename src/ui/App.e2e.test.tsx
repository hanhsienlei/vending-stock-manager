import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { listMachines } from '../data/repositories/machines'
import { getOrCreateRun, listRuns } from '../data/repositories/runs'
import { historyForMachine } from '../data/repositories/visits'
import { levelKey, lastRecordedLevels } from '../domain/levels'
import App from './App'
import { CountScreen } from './run/CountScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

/** Spec §9's one happy path, from an empty database through the shipped
 * screens: catalogue an item into slots, walk to the machine, count it,
 * get interrupted, come back, fill, finalize, and find the next visit
 * pre-filled with what the machine was left at. */
describe('a machine, end to end', () => {
  it('records a visit and carries its closing levels into the next one', async () => {
    const user = userEvent.setup()
    render(<App />)

    // --- Set the estate up -------------------------------------------------
    await user.type(await screen.findByLabelText('Level'), '7')
    await user.type(screen.getByLabelText('Location'), 'Lift lobby')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByRole('button', { name: 'L7 Lift lobby' })

    await user.click(screen.getByRole('button', { name: 'Items' }))
    await user.click(await screen.findByRole('button', { name: '+ New' }))

    await user.type(await screen.findByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price'), '4.50')
    await user.type(screen.getByLabelText('Par level'), '8')
    await user.type(screen.getByLabelText('Box size'), '24')
    await user.type(screen.getByLabelText('Slots'), '58')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: '+ New' })

    // --- Walk to the machine and count -------------------------------------
    await user.click(screen.getByRole('button', { name: 'Machines' }))
    await user.click(await screen.findByRole('button', { name: 'L7 Lift lobby' }))

    await screen.findByText('Coke')
    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByLabelText('slot 58 increase'))
    }
    expect(screen.getByLabelText('slot 58')).toHaveTextContent('3')

    // --- Interrupted: the bottom nav sits under the working thumb ----------
    await user.click(screen.getByRole('button', { name: 'Items' }))
    await screen.findByRole('button', { name: '+ New' })
    await user.click(screen.getByRole('button', { name: 'Machines' }))
    await user.click(await screen.findByRole('button', { name: 'L7 Lift lobby' }))

    await screen.findByText('Coke')
    // Not 0, and not last visit's level: the count entered before the screen
    // was unmounted comes back.
    await waitFor(() => {
      expect(screen.getByLabelText('slot 58')).toHaveTextContent('3')
    })
    // And it is marked as already worked, not carried forward.
    expect(screen.getByLabelText('slot 58')).not.toHaveClass('text-gray-400')

    // --- Fill and finalize --------------------------------------------------
    await user.click(screen.getByLabelText('Fill slot 58'))
    await user.click(screen.getByRole('button', { name: 'Finish machine' }))
    await screen.findByRole('button', { name: 'Add' })

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

    const nextVisitStepper = (await screen.findAllByLabelText('slot 58')).at(-1)
    expect(nextVisitStepper).toHaveTextContent('8')
    expect(nextVisitStepper).toHaveClass('text-gray-400')
  })
})
