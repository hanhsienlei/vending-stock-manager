import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { listPlacements, setPlacement } from '../../data/repositories/placements'
import { effectivePlacement } from '../../domain/placement'
import { createRun } from '../../data/repositories/runs'
import {
  openVisit, getCountLines, putCountLine, finalizeVisit,
} from '../../data/repositories/visits'
import { newId, now } from '../../domain/ids'
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

    // The tap paints immediately and persists behind it, so the assertion
    // waits for the write rather than racing it.
    await waitFor(async () => {
      expect((await getCountLines(visit.id))[0]?.before).toBe(1)
    })
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

    await waitFor(async () => {
      const pending = await getCountLines(visit.id)
      expect(pending.find((l) => l.itemId === sunkist.id)?.before).toBe(3)
    })

    const lines = await getCountLines(visit.id)
    const sunkistLine = lines.find((l) => l.itemId === sunkist.id)
    const fantaLine = lines.find((l) => l.itemId === fanta.id)

    expect(sunkistLine?.before).toBe(3)
    // The slot total sits at capacity, and no item's after dips below its before.
    expect((fantaLine?.after ?? 0) + (sunkistLine?.after ?? 0)).toBe(5)
    expect(fantaLine?.after).toBeGreaterThanOrEqual(fantaLine?.before ?? 0)
    expect(sunkistLine?.after).toBeGreaterThanOrEqual(sunkistLine?.before ?? 0)
  })

  it('lets a slot be populated at the machine when nothing is mapped yet', async () => {
    const user = userEvent.setup()
    // A fresh install: the item exists but no placement does, so the resolved
    // map is empty. Without an empty state there are no rows, so no ⋯ button,
    // so no way to reach the slot editor at all.
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })

    // Slot 58 was counted here before it fell off the map, so re-mapping it
    // has a level to pick up. That is also what makes the re-seed observable:
    // the row first paints at 0 from the reloaded map, then the seed behind it
    // raises it to 6, which is a condition a test can wait on rather than a
    // wall-clock sleep.
    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 58, itemId: coke.id,
      before: 2, after: 6, touched: true, filled: true, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')

    const { unmount } = render(
      <CountScreen runId={run.id} machineId={machine.id} onDone={vi.fn()} />,
    )

    expect(await screen.findByText(/no slots/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Slot number'), '58')
    await user.click(screen.getByRole('button', { name: 'Open slot' }))
    await user.click(await screen.findByRole('button', { name: 'Add Coke' }))

    // Wait on the row's stepper, not on the text "Coke" — the sheet lists that
    // name too, so it is present before the map has reloaded. Then wait for
    // the seed behind the reload to raise it to the level history holds; that
    // condition is what closes the window the re-seed would otherwise land in.
    await screen.findByLabelText('slot 58')
    await waitFor(() => {
      expect(screen.getByLabelText('slot 58')).toHaveTextContent('6')
    })

    expect(screen.getByText('Coke')).toBeInTheDocument()

    const placements = await listPlacements()
    expect(effectivePlacement(coke.id, machine.id, placements)?.slots).toEqual([58])

    // The slot just mapped is countable straight away, from the level it
    // carried rather than from zero.
    const visit = await openVisit(run.id, machine.id)
    await user.click(screen.getByLabelText('slot 58 increase'))
    expect(screen.getByLabelText('slot 58')).toHaveTextContent('7')
    await waitFor(async () => {
      expect((await getCountLines(visit.id))[0]?.before).toBe(7)
    })

    unmount()
  })

  it('rejects a slot number outside the machine trays in the empty state', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machineId={machine.id} onDone={vi.fn()} />)
    await screen.findByText(/no slots/i)

    await user.type(screen.getByLabelText('Slot number'), '99')
    await user.click(screen.getByRole('button', { name: 'Open slot' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('99')
    expect(screen.queryByRole('button', { name: 'Add Coke' })).toBeNull()
  })

  it('greys a carried-forward level until the row is touched', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])

    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 58, itemId: coke.id,
      before: 2, after: 8, touched: true, filled: true, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')
    render(<CountScreen runId={run.id} machineId={machine.id} onDone={vi.fn()} />)

    // On a 54-slot machine this is the operator's only signal for which rows
    // have actually been worked (spec §3.1, §5.1).
    const value = await screen.findByLabelText('slot 58')
    expect(value).toHaveTextContent('8')
    expect(value).toHaveClass('text-gray-400')

    await user.click(screen.getByLabelText('slot 58 decrease'))
    expect(screen.getByLabelText('slot 58')).not.toHaveClass('text-gray-400')
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
