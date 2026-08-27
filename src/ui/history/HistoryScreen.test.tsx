import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { createRun } from '../../data/repositories/runs'
import { openVisit, putCountLine, finalizeVisit } from '../../data/repositories/visits'
import { newId, now } from '../../domain/ids'
import { HistoryScreen } from './HistoryScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('HistoryScreen', () => {
  it('says so when there are no runs yet', async () => {
    render(<HistoryScreen />)

    expect(await screen.findByText(/no runs recorded yet/i)).toBeInTheDocument()
  })

  it('lists runs newest first', async () => {
    await createRun('2026-08-22')
    await createRun('2026-08-27')

    render(<HistoryScreen />)
    await screen.findByText('Thu 27 Aug 2026')

    const dates = screen.getAllByLabelText(/^run /).map((r) => r.textContent)
    expect(dates[0]).toContain('Thu 27 Aug 2026')
    expect(dates[1]).toContain('Sat 22 Aug 2026')
  })

  it('shows how much of the estate each run covered', async () => {
    await saveMachine({ label: 'Lift lobby', level: 7 })
    await saveMachine({ label: 'Lift lobby', level: 8 })
    const l9 = await saveMachine({ label: 'Gym', level: 9 })
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, l9.id)
    await finalizeVisit(visit.id)

    render(<HistoryScreen />)

    expect(await screen.findByLabelText(/^run /)).toHaveTextContent('1 of 3')
  })

  // The whole point of the screen: get from "did it save what I typed?" to
  // the actual numbers in two taps.
  it('drills from a run to a machine to the numbers recorded', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: 58, itemId: coke.id,
      before: 2, after: 5, touched: true, filled: true, price: 0, updatedAt: now(),
    })
    await finalizeVisit(visit.id)

    render(<HistoryScreen />)

    await user.click(await screen.findByLabelText('run 2026-08-27'))
    await user.click(await screen.findByLabelText('visit to L7'))

    const recorded = await screen.findByLabelText('slot 58 record')
    expect(recorded).toHaveTextContent('Coke')
    expect(recorded).toHaveTextContent('2')
    expect(recorded).toHaveTextContent('5')
  })

  it('distinguishes a finished machine from one still open', async () => {
    const user = userEvent.setup()
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const l8 = await saveMachine({ label: 'Gym', level: 8 })
    const run = await createRun('2026-08-27')
    const done = await openVisit(run.id, l7.id)
    await finalizeVisit(done.id)
    await openVisit(run.id, l8.id)

    render(<HistoryScreen />)
    await user.click(await screen.findByLabelText('run 2026-08-27'))

    expect(await screen.findByLabelText('visit to L7')).toHaveTextContent('Finished')
    expect(screen.getByLabelText('visit to L8')).toHaveTextContent('In progress')
  })

  it('goes back up from a receipt to the run, and from the run to the list', async () => {
    const user = userEvent.setup()
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)
    await finalizeVisit(visit.id)

    render(<HistoryScreen />)
    await user.click(await screen.findByLabelText('run 2026-08-27'))
    await user.click(await screen.findByLabelText('visit to L7'))
    await screen.findByText(/nothing was recorded/i)

    await user.click(screen.getByText('← Back'))
    expect(await screen.findByLabelText('visit to L7')).toBeInTheDocument()

    await user.click(screen.getByText('← Back'))
    expect(await screen.findByLabelText('run 2026-08-27')).toBeInTheDocument()
  })

  it('switches between the receipts and the report', async () => {
    const user = userEvent.setup()
    await createRun('2026-08-27')

    render(<HistoryScreen />)
    await screen.findByLabelText('run 2026-08-27')

    await user.click(screen.getByRole('button', { name: 'Report' }))
    expect(await screen.findByLabelText('From')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Receipts' }))
    expect(await screen.findByLabelText('run 2026-08-27')).toBeInTheDocument()
  })
})
