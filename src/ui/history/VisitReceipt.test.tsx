import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { createRun } from '../../data/repositories/runs'
import { openVisit, putCountLine, finalizeVisit } from '../../data/repositories/visits'
import { newId, now } from '../../domain/ids'
import { VisitReceipt } from './VisitReceipt'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

/** The point of this screen is trust: it shows the numbers actually recorded,
 * read back out of the database, so the operator can check the app kept what
 * they typed. So every test here writes real count lines through the real
 * repository and asserts on what comes back — never on a fixture. */
describe('VisitReceipt', () => {
  async function seedVisit() {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const chips = await saveItem({ name: 'Chips', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    // Found 2, filled to 5.
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: 58, itemId: coke.id,
      before: 2, after: 5, touched: true, filled: true, price: 0, updatedAt: now(),
    })
    // Found 4, left alone.
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: 12, itemId: chips.id,
      before: 4, after: 4, touched: true, filled: false, price: 0, updatedAt: now(),
    })
    await finalizeVisit(visit.id)

    return { visit, machine, run }
  }

  it('shows every slot recorded, with what was found and what was left', async () => {
    const { visit, machine } = await seedVisit()

    render(<VisitReceipt visitId={visit.id} machine={machine} onBack={vi.fn()} />)

    const coke = await screen.findByLabelText('slot 58 record')
    expect(coke).toHaveTextContent('Coke')
    expect(coke).toHaveTextContent('2')
    expect(coke).toHaveTextContent('5')

    const chips = screen.getByLabelText('slot 12 record')
    expect(chips).toHaveTextContent('Chips')
    expect(chips).toHaveTextContent('4')
  })

  it('orders the slots by number, not by when they were entered', async () => {
    const { visit, machine } = await seedVisit()

    render(<VisitReceipt visitId={visit.id} machine={machine} onBack={vi.fn()} />)
    await screen.findByLabelText('slot 58 record')

    const slots = screen.getAllByLabelText(/^slot \d+ record$/)
      .map((row) => row.getAttribute('aria-label'))
    expect(slots).toEqual(['slot 12 record', 'slot 58 record'])
  })

  it('marks the slots that were filled', async () => {
    const { visit, machine } = await seedVisit()

    render(<VisitReceipt visitId={visit.id} machine={machine} onBack={vi.fn()} />)

    expect(await screen.findByLabelText('slot 58 record')).toHaveTextContent('Filled')
    expect(screen.getByLabelText('slot 12 record')).not.toHaveTextContent('Filled')
  })

  it('names the machine so a receipt is never read against the wrong one', async () => {
    const { visit, machine } = await seedVisit()

    render(<VisitReceipt visitId={visit.id} machine={machine} onBack={vi.fn()} />)

    expect(await screen.findByText('L7')).toBeInTheDocument()
  })

  // A machine opened and abandoned has a draft visit and possibly no lines at
  // all. Showing an empty screen with no explanation reads as data loss.
  it('says so when a visit recorded nothing, rather than showing a blank page', async () => {
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    render(<VisitReceipt visitId={visit.id} machine={machine} onBack={vi.fn()} />)

    expect(await screen.findByText(/nothing was recorded/i)).toBeInTheDocument()
  })
})
