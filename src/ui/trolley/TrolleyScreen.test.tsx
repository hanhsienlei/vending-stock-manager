import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { setPlacement } from '../../data/repositories/placements'
import { getOrCreateRun } from '../../data/repositories/runs'
import { setStoreroomBalance } from '../../data/repositories/storeroom'
import { openVisit, putCountLines, finalizeVisit } from '../../data/repositories/visits'
import { newId, now } from '../../domain/ids'
import { today } from '../../domain/date'
import type { Id } from '../../domain/types'
import { TrolleyScreen } from './TrolleyScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

/** `yyyy-mm-dd`, n days before today. The screen forecasts against the run's
 * own date, which is today's, so every fixture here is relative to it rather
 * than to a fixed calendar. */
function daysAgo(days: number): string {
  const [year, month, day] = today().split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10)
}

interface SlotCount {
  slotNumber: number
  itemId: Id
  before: number
  after: number
}

async function count(runDate: string, machineId: Id, slots: SlotCount[]) {
  const run = await getOrCreateRun(runDate)
  const visit = await openVisit(run.id, machineId)
  await putCountLines(slots.map((slot) => ({
    id: newId(), visitId: visit.id, slotNumber: slot.slotNumber,
    itemId: slot.itemId, before: slot.before, after: slot.after,
    touched: true, filled: false, price: 4.5, updatedAt: now(),
  })))
  await finalizeVisit(visit.id)
}

/** One slot on one machine, sold at a flat rate for three weeks: 7 a week
 * from a capacity of 10, refilled every visit, last seen a week ago. That
 * gives two clean 7-day periods, a rate of 1.0/day and a need of 7. */
async function oneSellingSlot({ boxSize = 24 } = {}) {
  const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize })
  const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
  await setPlacement(coke.id, { kind: 'base' }, [58])
  await setStoreroomBalance(coke.id, 200)

  for (const date of [daysAgo(21), daysAgo(14), daysAgo(7)]) {
    await count(date, l7.id, [
      { slotNumber: 58, itemId: coke.id, before: 3, after: 10 },
    ])
  }

  const run = await getOrCreateRun(today())
  return { coke, l7, run }
}

describe('TrolleyScreen, loading', () => {
  it('shows the need with the workings that produced it', async () => {
    const { run } = await oneSellingSlot()

    render(<TrolleyScreen runId={run.id} mode="load" onDone={vi.fn()} />)

    expect(await screen.findByLabelText('Coke need')).toHaveTextContent('7')
    // Every figure on the row derives from something printed beside it
    // (design §12.1): one slot, selling one a day, seven days since that
    // machine was last seen, and what seven units is in boxes.
    expect(screen.getByText('1 slot · 1.0/day · 7 days · 7 loose')).toBeInTheDocument()
  })

  it('defaults Taken to whole boxes where a carton size is known', async () => {
    await oneSellingSlot({ boxSize: 24 })
    const run = await getOrCreateRun(today())

    render(<TrolleyScreen runId={run.id} mode="load" onDone={vi.fn()} />)

    // D12: the need is 7, and 7 does not come off a shelf — a box of 24 does.
    expect(await screen.findByLabelText('Coke boxes')).toHaveValue(1)
    expect(screen.getByLabelText('Coke loose')).toHaveValue(0)
  })

  it('degrades to a single units field for a loose sundry', async () => {
    await oneSellingSlot({ boxSize: 1 })
    const run = await getOrCreateRun(today())

    render(<TrolleyScreen runId={run.id} mode="load" onDone={vi.fn()} />)

    // Fourteen of sixty items have no carton size. They stay in units, and
    // the default is the need itself rather than a box that does not exist.
    expect(await screen.findByLabelText('Coke units')).toHaveValue(7)
    expect(screen.queryByLabelText('Coke boxes')).not.toBeInTheDocument()
  })

  it('writes the load, and the none-left flag re-anchors the balance at zero', async () => {
    const user = userEvent.setup()
    const { coke, run } = await oneSellingSlot()

    render(<TrolleyScreen runId={run.id} mode="load" onDone={vi.fn()} />)
    await screen.findByLabelText('Coke need')

    await user.click(screen.getByRole('button', { name: 'No Coke left in G' }))
    await user.click(screen.getByRole('button', { name: /take the trolley up/i }))

    await waitFor(async () => {
      expect(await db.trolleyLines.count()).toBe(1)
    })
    const [line] = await db.trolleyLines.toArray()
    expect(line.needed).toBe(7)
    expect(line.taken).toBe(24)
    expect(line.noneLeftInG).toBe(true)

    // Design §3.6, §11: the flag is an ordinary manual count of zero, stamped
    // at the load's own instant so `ledgerBalance` does not then subtract the
    // same 24 units from a shelf already declared empty.
    const anchor = await db.storeroomBalances.where('itemId').equals(coke.id).first()
    expect(anchor?.units).toBe(0)
    expect(anchor?.verifiedAt).toBe(line.loadedAt)
  })

  it('lists a slot that sells nothing and never moves, rather than picking for it', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const dust = await saveItem({ name: 'Ginger Beer', price: 4.5, basePar: 8, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    await setPlacement(dust.id, { kind: 'base' }, [61])
    await setStoreroomBalance(coke.id, 200)
    await setStoreroomBalance(dust.id, 200)

    // Five visits bound four periods. Slot 61 reads 6 before and 6 after at
    // every one of them — design §4.4's quiet slot. Its capacity is 8, so
    // without that it would be asking for two.
    for (const days of [35, 28, 21, 14, 7]) {
      await count(daysAgo(days), l7.id, [
        { slotNumber: 58, itemId: coke.id, before: 3, after: 10 },
        { slotNumber: 61, itemId: dust.id, before: 6, after: 6 },
      ])
    }

    const run = await getOrCreateRun(today())
    render(<TrolleyScreen runId={run.id} mode="load" onDone={vi.fn()} />)

    expect(await screen.findByLabelText('Coke need')).toBeInTheDocument()
    expect(screen.getByText(/nothing expected/i)).toBeInTheDocument()
    expect(screen.getByTestId('quiet-slot-61')).toHaveTextContent('Ginger Beer')
    expect(screen.queryByLabelText('Ginger Beer need')).not.toBeInTheDocument()
  })

  // Design §12.2 and D5: allocation is part of this screen, revealed only
  // when something is short. The screen-level half of it — the trade-off
  // appearing the moment the operator types a figure that will not cover the
  // need, with no reload and no second screen.
  it('reveals who goes short the moment the taken figure will not cover it', async () => {
    const user = userEvent.setup()
    await oneSellingSlot({ boxSize: 1 })
    const run = await getOrCreateRun(today())

    render(<TrolleyScreen runId={run.id} mode="load" onDone={vi.fn()} />)
    const taken = await screen.findByLabelText('Coke units')

    expect(screen.queryByText(/goes without/)).not.toBeInTheDocument()

    await user.clear(taken)
    await user.type(taken, '3')

    expect(screen.getByText(/1 item short — 1 slot goes without/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /see who/i }))
    expect(screen.getByTestId('allocation-slot-7-58')).toHaveTextContent('3')
  })

  // The phone is 393px wide. A previous round shipped a control that ran off
  // the side of a real one and only a photograph caught it, so the fixed
  // columns are asserted rather than eyeballed: the taken cell holds the
  // boxes+loose control, which the storeroom measured at ~108px.
  it('fits its columns on a 393px screen', async () => {
    const { run } = await oneSellingSlot()

    render(<TrolleyScreen runId={run.id} mode="load" onDone={vi.fn()} />)
    const header = await screen.findByTestId('trolley-column-header')

    const template = /grid-cols-\[([^\]]+)\]/.exec(header.className)?.[1] ?? ''
    const columns = template.split('_')
    const fixed = columns
      .filter((column) => column.endsWith('px'))
      .reduce((sum, column) => sum + Number.parseFloat(column), 0)
    const gaps = 8 * (columns.length - 1)

    expect(columns).toContain('112px')
    // 32px of horizontal padding, then the gaps and the fixed cells; what is
    // left is the item name, which must not be squeezed below a readable
    // width.
    expect(32 + gaps + fixed).toBeLessThanOrEqual(393 - 130)
  })
})
