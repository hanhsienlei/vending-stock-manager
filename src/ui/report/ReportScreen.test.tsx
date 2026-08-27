import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { createRun } from '../../data/repositories/runs'
import { openVisit, putCountLine, finalizeVisit } from '../../data/repositories/visits'
import { newId, now } from '../../domain/ids'
import { ReportScreen } from './ReportScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function counted(
  date: string, machineId: string, itemId: string,
  before: number, after: number, price = 4.5,
) {
  const run = await createRun(date)
  const visit = await openVisit(run.id, machineId)
  await putCountLine({
    id: newId(), visitId: visit.id, slotNumber: 58, itemId,
    before, after, touched: true, filled: false, price, updatedAt: now(),
  })
  await finalizeVisit(visit.id)
}

describe('ReportScreen', () => {
  it('says so before any run has closed a period', async () => {
    render(<ReportScreen />)

    expect(await screen.findByText(/nothing to report yet/i)).toBeInTheDocument()
  })

  it('shows units and revenue for the latest run by default', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)

    const totals = await screen.findByLabelText('report totals')
    expect(totals).toHaveTextContent('6')
    expect(totals).toHaveTextContent('27.00')
  })

  it('breaks the sales down per slot', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)

    const row = await screen.findByLabelText('L7 slot 58 sales')
    expect(row).toHaveTextContent('Coke')
    expect(row).toHaveTextContent('6')
  })

  it('widens to a date range and sums across runs', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-13', l7.id, coke.id, 0, 10)
    await counted('2026-08-20', l7.id, coke.id, 7, 10)
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)
    await screen.findByLabelText('report totals')

    await user.clear(screen.getByLabelText('From'))
    await user.type(screen.getByLabelText('From'), '2026-08-14')
    await user.clear(screen.getByLabelText('To'))
    await user.type(screen.getByLabelText('To'), '2026-08-27')

    await waitFor(() => {
      expect(screen.getByLabelText('report totals')).toHaveTextContent('9')
    })
  })

  it('marks a slot that ran dry', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    await counted('2026-08-27', l7.id, coke.id, 0, 10)

    render(<ReportScreen />)

    expect(await screen.findByLabelText('L7 slot 58 sales')).toHaveTextContent('RAN DRY')
  })

  // Stock on hand is a current figure and must not look like it belongs to the
  // selected period (design §7.2).
  it('labels stock on hand as now, not as part of the period', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)

    expect(await screen.findByLabelText('stock on hand')).toHaveTextContent(/now/i)
  })

  // Stock on hand comes from each machine's LATEST recorded levels, never
  // from summing every period's closing count in the range — the brief's
  // naive version double-counts a machine that closed twice inside the
  // selected dates. Widening the range must not change the figure.
  it('keeps the machines stock-on-hand figure the same whether the range covers one run or two', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)
    await screen.findByLabelText('report totals')

    const stockLatestOnly = await screen.findByLabelText('stock on hand')
    expect(stockLatestOnly).toHaveTextContent('Machines 10')

    await user.clear(screen.getByLabelText('From'))
    await user.type(screen.getByLabelText('From'), '2026-08-14')

    await waitFor(() => {
      expect(screen.getByLabelText('stock on hand')).toHaveTextContent('Machines 10')
    })
  })
})
