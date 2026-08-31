import { describe, it, expect, beforeEach } from 'vitest'
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

    render(<VisitReceipt visitId={visit.id} machine={machine} />)

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

    render(<VisitReceipt visitId={visit.id} machine={machine} />)
    await screen.findByLabelText('slot 58 record')

    const slots = screen.getAllByLabelText(/^slot \d+ record$/)
      .map((row) => row.getAttribute('aria-label'))
    expect(slots).toEqual(['slot 12 record', 'slot 58 record'])
  })

  // A machine opened and abandoned has a draft visit and possibly no lines at
  // all. Showing an empty screen with no explanation reads as data loss. The
  // machine is named here — this is the one place left in the receipt body
  // that reads the `machine` prop, now that the back row (and the machine
  // name it carried) moved into the header `HistoryScreen` owns.
  it('says so when a visit recorded nothing, rather than showing a blank page, and names the machine', async () => {
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    render(<VisitReceipt visitId={visit.id} machine={machine} />)

    const message = await screen.findByText(/nothing was recorded/i)
    expect(message).toHaveTextContent('L7')
  })
})

describe('VisitReceipt — §9 layout', () => {
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

  it('reads as the table that was typed into', async () => {
    const { visit, machine } = await seedVisit()
    render(<VisitReceipt visitId={visit.id} machine={machine} />)
    await screen.findByText('Coke')

    const header = screen.getByTestId('receipt-column-header')
    expect(header).toHaveTextContent(/SL/i)
    expect(header).toHaveTextContent(/Counted/i)
    expect(header).toHaveTextContent(/Refilled\s*to/i)
  })

  it('drops the FILLED pill — two named columns already say it', async () => {
    const { visit, machine } = await seedVisit()
    render(<VisitReceipt visitId={visit.id} machine={machine} />)
    await screen.findByText('Coke')
    expect(screen.queryByText(/^Filled$/i)).not.toBeInTheDocument()
  })

  it('marks a slot that reached zero with the accent inset, but not one that did not', async () => {
    const gum = await saveItem({ name: 'Gum', price: 2, basePar: 5, boxSize: 24 })
    const { visit, machine } = await seedVisit()   // slot 58 was found at 2, slot 12 at 4
    // Found 0, left at 0 — ran dry and was not refilled.
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: 99, itemId: gum.id,
      before: 0, after: 0, touched: true, filled: false, price: 0, updatedAt: now(),
    })

    render(<VisitReceipt visitId={visit.id} machine={machine} />)
    await screen.findByText('Coke')

    // Neither seeded line in `seedVisit` reached zero, so that row is not marked.
    expect(screen.getByLabelText('slot 58 record').className)
      .not.toContain('shadow-[inset_4px_0_0_var(--color-accent)]')
    // The slot left at zero is the one that ran dry, so it IS marked.
    expect(screen.getByLabelText('slot 99 record').className)
      .toContain('shadow-[inset_4px_0_0_var(--color-accent)]')
  })

  it('carries no rounded corner and no legacy palette class', async () => {
    const { visit, machine } = await seedVisit()
    const { container } = render(<VisitReceipt visitId={visit.id} machine={machine} />)
    await screen.findByText('Coke')
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
