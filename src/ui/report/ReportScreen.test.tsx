import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { createRun } from '../../data/repositories/runs'
import { openVisit, putCountLine, finalizeVisit } from '../../data/repositories/visits'
import { setPlacement } from '../../data/repositories/placements'
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

    // §10 keeps the 4px inset for a ran-dry line and a small "DRY" (styled
    // uppercase via CSS, not literal capitals) after the item name.
    expect(await screen.findByLabelText('L7 slot 58 sales')).toHaveTextContent(/dry/i)
  })

  // Design §7.2 asks for "any censored period (§5.2), each with the reason it
  // could not be counted". A bare grey "not counted" says nothing about
  // whether the operator should go and look — and the totals folded the same
  // lines in at zero, so a range covering a machine's first-ever visit read
  // "0 units · $0.00", which is exactly the "no figure beats a wrong figure"
  // rule §5.2 exists to enforce, broken at the last step.
  it('names the reason a censored period could not be counted', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    // The machine's first-ever visit: no opening count, so nothing to derive.
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)

    const row = await screen.findByLabelText('L7 slot 58 sales')
    expect(row).toHaveTextContent(/not counted/i)
    expect(row).toHaveTextContent(/no previous visit/i)
  })

  it('counts the censored lines, so a partial figure cannot read as a complete one', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)

    // §10 moves this warning off the totals card and onto its own
    // `accent-200` band directly beneath it — see the "own band" test below.
    const warning = await screen.findByLabelText('censored lines')
    expect(warning).toHaveTextContent(/1 line not counted/i)
  })

  it('names the reason when an item left a slot still holding stock', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    // Slot 58 now holds Fanta: the 10 Coke left the slot, and whether they
    // sold or were pulled out is unknowable (design §3.4).
    await counted('2026-08-27', l7.id, fanta.id, 4, 10)

    render(<ReportScreen />)

    const rows = await screen.findAllByLabelText('L7 slot 58 sales')
    expect(rows.map((r) => r.textContent).join(' '))
      .toMatch(/left the slot holding stock/i)
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

    // §10 renders the label and its figure as separate cells ("In machines"
    // then "10"), so the concatenated textContent has no space between them.
    const stockLatestOnly = await screen.findByLabelText('stock on hand')
    expect(stockLatestOnly).toHaveTextContent(/In machines\D*10/i)

    await user.clear(screen.getByLabelText('From'))
    await user.type(screen.getByLabelText('From'), '2026-08-14')

    await waitFor(() => {
      expect(screen.getByLabelText('stock on hand')).toHaveTextContent(/In machines\D*10/i)
    })
  })

  it('shows the stock matrix once placements exist', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)

    expect(await screen.findByLabelText('stock row 58')).toHaveTextContent('Coke')
  })
})

async function seedTwoFinalizedVisits() {
  const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
  const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
  await counted('2026-08-20', l7.id, coke.id, 0, 10)
  await counted('2026-08-27', l7.id, coke.id, 4, 10)
}

async function seedCensoredLine() {
  const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
  const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
  // The machine's first-ever visit: no opening count, so nothing to derive.
  await counted('2026-08-27', l7.id, coke.id, 4, 10)
}

/** The master table is the point of this screen (user story: "App shall
 * calculate the stock level of all machines, stock room, and total"), and it
 * was unreachable.
 *
 * The bug: `<StockMatrix>` sat inside the `reports.length === 0` branch, so
 * the whole page collapsed to "Nothing to report yet" until a SALES period
 * had closed — which needs a machine finished for a second time. The table
 * depends on none of that. It is built from current levels, storeroom
 * balances and placements, all of which exist from the first day. So the
 * operator could not see what to pull from the storeroom until after they
 * had already done two runs. */
describe('ReportScreen — the stock table does not wait for a sales period', () => {
  it('shows the stock table before any run has ever closed a period', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    await saveMachine({ label: 'Lift lobby', level: 7 })

    render(<ReportScreen />)

    // The sales half is correctly empty — no period has closed.
    expect(await screen.findByText(/nothing to report yet/i)).toBeInTheDocument()
    // The table does not depend on that, and must be here anyway.
    expect(await screen.findByLabelText('stock row 58')).toBeInTheDocument()
    // Bare floor number and `GF`, as the operator's paper sheet writes them.
    expect(screen.getByRole('columnheader', { name: '7' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'GF' })).toBeInTheDocument()
  })

  it('shows stock on hand before any run has closed a period', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    await saveMachine({ label: 'Lift lobby', level: 7 })

    render(<ReportScreen />)

    // Stock on hand is a "now" figure too — it never needed a closed period.
    expect(await screen.findByLabelText('stock on hand')).toBeInTheDocument()
  })

  it('puts the stock table above the sales figures', async () => {
    // Seeds its own placement: `seedTwoFinalizedVisits` deliberately has
    // none, so it produces no matrix rows to order.
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)

    const totals = await screen.findByLabelText('report totals')
    const table = screen.getByLabelText('stock row 58')
    // The table is what you act on before a run; sales is what you read
    // after one. Reading order follows.
    expect(
      table.compareDocumentPosition(totals) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

describe('ReportScreen — §10 layout', () => {
  it('states the sold total as a poster figure with its period', async () => {
    await seedTwoFinalizedVisits()
    render(<ReportScreen />)

    const sold = await screen.findByLabelText('report totals')
    expect(sold.className).toContain('bg-accent')
    expect(sold).toHaveTextContent(/^SOLD · RUN OF /)
    expect(sold).toHaveTextContent('units')
  })

  it('puts the censored warning on its own band, not inside the totals', async () => {
    await seedCensoredLine()
    render(<ReportScreen />)

    const warning = await screen.findByLabelText('censored lines')
    expect(warning.className).toContain('bg-accent-200')
    expect(warning).toHaveTextContent(/not in the totals above/)
  })

  it('names the three stock-on-hand cells', async () => {
    await seedTwoFinalizedVisits()
    render(<ReportScreen />)

    const onHand = await screen.findByLabelText('stock on hand')
    expect(onHand).toHaveTextContent(/In machines/i)
    expect(onHand).toHaveTextContent(/Storeroom/i)
    expect(onHand).toHaveTextContent(/On hand now/i)
  })

  it('tells the operator the matrix needs landscape', async () => {
    await seedTwoFinalizedVisits()
    render(<ReportScreen />)
    // Ruling 7: the markup renders "Turn phone ⟳" in sentence case under an
    // `uppercase` CSS class (the codebase's prevailing idiom, matching
    // ScreenHeader) — text-transform never changes `textContent`, so the
    // match must be case-insensitive.
    expect(await screen.findByText(/turn phone/i)).toBeInTheDocument()
  })

  it('carries no rounded corner and no legacy palette class', async () => {
    await seedTwoFinalizedVisits()
    const { container } = render(<ReportScreen />)
    await screen.findByLabelText('report totals')
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
