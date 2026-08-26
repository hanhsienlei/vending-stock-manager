import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { setPlacement } from '../../data/repositories/placements'
import { createRun } from '../../data/repositories/runs'
import { openVisit, getCountLines } from '../../data/repositories/visits'
import { CountScreen } from './CountScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('CountScreen', () => {
  it('renders slots and persists a decrement without any save action', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    render(<CountScreen runId={run.id} machineId={machine.id} onDone={vi.fn()} />)

    await screen.findByText('Coke')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    await user.click(screen.getByLabelText('slot 58 increase'))

    const lines = await getCountLines(visit.id)
    expect(lines[0].before).toBe(1)
  })

  it('marks an empty slot as ran dry', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machineId={machine.id} onDone={vi.fn()} />)
    expect(await screen.findByText('RAN DRY')).toBeInTheDocument()
  })

  it('renders one sub-row per item in a mixed slot and keeps after in sync when filled', async () => {
    const user = userEvent.setup()
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(fanta.id, { kind: 'base' }, [52])
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    render(<CountScreen runId={run.id} machineId={machine.id} onDone={vi.fn()} />)

    await screen.findByText('Fanta')
    // One sub-row per accepted item — each has its own uniquely labelled stepper.
    expect(screen.getByLabelText('slot 52 Fanta')).toBeInTheDocument()
    expect(screen.getByLabelText('slot 52 Sunkist')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Fill slot 52'))
    await user.click(screen.getByLabelText('slot 52 Sunkist increase'))
    await user.click(screen.getByLabelText('slot 52 Sunkist increase'))
    await user.click(screen.getByLabelText('slot 52 Sunkist increase'))

    const lines = await getCountLines(visit.id)
    const sunkistLine = lines.find((l) => l.itemId === sunkist.id)
    const fantaLine = lines.find((l) => l.itemId === fanta.id)

    expect(sunkistLine?.before).toBe(3)
    // The slot total sits at capacity, and no item's after dips below its before.
    expect((fantaLine?.after ?? 0) + (sunkistLine?.after ?? 0)).toBe(5)
    expect(fantaLine?.after).toBeGreaterThanOrEqual(fantaLine?.before ?? 0)
    expect(sunkistLine?.after).toBeGreaterThanOrEqual(sunkistLine?.before ?? 0)
  })

  it('counts a slot whose derived capacity is 0', async () => {
    const user = userEvent.setup()
    // basePar 0 is legal (ItemEditScreen accepts it), and in a slot with no
    // SlotConfig it derives a capacity of 0. The row must still be countable.
    const water = await saveItem({ name: 'Water', price: 3, basePar: 0, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(water.id, { kind: 'base' }, [41])
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    render(<CountScreen runId={run.id} machineId={machine.id} onDone={vi.fn()} />)
    await screen.findByText('Water')

    await user.click(screen.getByLabelText('slot 41 increase'))
    await user.click(screen.getByLabelText('slot 41 increase'))

    expect(screen.getByLabelText('slot 41')).toHaveTextContent('2')
    await waitFor(async () => {
      expect((await getCountLines(visit.id))[0]?.before).toBe(2)
    })
  })

  it('records a count deeper than capacity and flags it rather than blocking it', async () => {
    const user = userEvent.setup()
    // The printed map is only ~90% accurate, so a slot can physically hold
    // more than its derived capacity. Under-recording books phantom sales.
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 2, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    render(<CountScreen runId={run.id} machineId={machine.id} onDone={vi.fn()} />)
    await screen.findByText('Coke')

    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByLabelText('slot 58 increase'))
    }

    expect(screen.getByLabelText('slot 58')).toHaveTextContent('4')
    expect(screen.getByText('OVER CAPACITY')).toBeInTheDocument()
    await waitFor(async () => {
      expect((await getCountLines(visit.id))[0]?.before).toBe(4)
    })
  })
})
