import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem, deleteItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { listPlacements, setPlacement } from '../../data/repositories/placements'
import { setSlotConfig } from '../../data/repositories/slotConfigs'
import { effectivePlacement } from '../../domain/placement'
import { createRun } from '../../data/repositories/runs'
import {
  openVisit, getCountLines, putCountLine, finalizeVisit,
} from '../../data/repositories/visits'
import { recordTrolleyLoad } from '../../data/repositories/trolley'
import * as trolleyRepo from '../../data/repositories/trolley'
import * as forecastRepo from '../../data/repositories/forecast'
import { newId, now } from '../../domain/ids'
import { CountScreen } from './CountScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('CountScreen', () => {
  it('renders slots and persists a typed count without any save action', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)

    await screen.findByText('Coke')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    const counted = screen.getByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '1')

    // The tap paints immediately and persists behind it, so the assertion
    // waits for the write rather than racing it.
    await waitFor(async () => {
      expect((await getCountLines(visit.id))[0]?.before).toBe(1)
    })
  })

  it('does not mark a never-counted slot as ran dry on a machine with no history', async () => {
    // Every machine's first-ever visit seeds all slots at 0 from empty
    // history. Flagging that as an edge mark buried the real signal under ~54
    // marked rows on the operator's first run (spec §5.2, amended 2026-08-27).
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText('Coke')
    expect(screen.getByTestId('slot-row-58')).not.toHaveAttribute('data-ran-dry', 'true')
  })

  it('marks a slot ran dry once the operator counts it down to zero', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText('Coke')
    expect(screen.getByTestId('slot-row-58')).not.toHaveAttribute('data-ran-dry', 'true')

    const counted = screen.getByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '1')
    await user.clear(counted)
    await user.type(counted, '0')

    await waitFor(() => {
      expect(screen.getByTestId('slot-row-58')).toHaveAttribute('data-ran-dry', 'true')
    })
  })

  it('still marks a slot ran dry when a prior visit recorded it empty and it is carried forward', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])

    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 58, itemId: coke.id,
      before: 0, after: 0, touched: true, filled: false, price: 0, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')
    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('slot-row-58')).toHaveAttribute('data-ran-dry', 'true')
    })
  })

  it('renders the after-count next to the before-count on a single-item slot, and lets it be typed straight to capacity', async () => {
    const user = userEvent.setup()
    // Fill is no longer a per-row button (§3.6) — the operator now expresses
    // "top this off" by typing the target figure into Refilled to directly.
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [11])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText('Coke')

    // Before-count mirrors into after-count for an unfilled slot — this is the
    // exact regression from the operator's screenshot: slot 11, single item,
    // capacity 5, before=1, row still had to show the after figure too.
    const counted = screen.getByLabelText('slot 11 counted')
    await user.clear(counted)
    await user.type(counted, '1')
    expect(screen.getByLabelText('slot 11 refilled to')).toHaveValue('1')

    const refilled = screen.getByLabelText('slot 11 refilled to')
    await user.clear(refilled)
    await user.type(refilled, '5')
    expect(refilled).toHaveValue('5')
  })

  // Fill's cross-item recompute (fillToCapacity while a slot is `filled`) is
  // useCounting logic, unchanged by this task, but there is now no UI path to
  // reach `filled: true` from CountScreen — the per-row Fill button is gone,
  // and its replacement, the footer "Fill tray to par" action, is wired in a
  // later task. This test used to drive that recompute via `Fill slot 52`;
  // that is out of reach from this row now, so this covers only what the row
  // guarantees on its own: one independently typable pair of cells per item.
  it('renders one sub-row per item in a mixed slot, each independently typable', async () => {
    const user = userEvent.setup()
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(fanta.id, { kind: 'base' }, [52])
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)

    await screen.findByText('Fanta')
    // One sub-row per accepted item — each has its own uniquely labelled cells.
    expect(screen.getByLabelText('slot 52 Fanta counted')).toBeInTheDocument()
    expect(screen.getByLabelText('slot 52 Sunkist counted')).toBeInTheDocument()

    const sunkistCounted = screen.getByLabelText('slot 52 Sunkist counted')
    await user.clear(sunkistCounted)
    await user.type(sunkistCounted, '3')

    await waitFor(async () => {
      const pending = await getCountLines(visit.id)
      expect(pending.find((l) => l.itemId === sunkist.id)?.before).toBe(3)
    })

    const sunkistRefilled = screen.getByLabelText('slot 52 Sunkist refilled to')
    await user.clear(sunkistRefilled)
    await user.type(sunkistRefilled, '4')

    await waitFor(async () => {
      const lines = await getCountLines(visit.id)
      expect(lines.find((l) => l.itemId === sunkist.id)?.after).toBe(4)
    })

    // Fanta's cells are untouched by Sunkist's edits — the two items are
    // independent rows, not a shared pair.
    expect(screen.getByLabelText('slot 52 Fanta counted')).toHaveValue('0')
    expect(screen.getByLabelText('slot 52 Sunkist counted')).toHaveValue('3')
    expect(screen.getByLabelText('slot 52 Sunkist refilled to')).toHaveValue('4')
  })

  // A mixed slot that also ran dry used to emit `border-red-500` and
  // `border-blue-500` together, and which one the operator saw was decided by
  // Tailwind's own utility order, not by anything in this file. The coloured
  // border is gone now (§3.4, §3.5) — ran dry is the edge-inset attribute, and
  // a mixed slot is still legible without a border: it says "2 items" and
  // renders a sub-row per item.
  it('shows a mixed slot that ran dry as ran-dry, not confused with mixed styling', async () => {
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(fanta.id, { kind: 'base' }, [52])
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    // A prior visit recorded the slot empty, so it carries forward as ran dry
    // rather than as a never-counted slot.
    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    for (const itemId of [fanta.id, sunkist.id]) {
      await putCountLine({
        id: newId(), visitId: pastVisit.id, slotNumber: 52, itemId,
        before: 0, after: 0, touched: true, filled: false, price: 0, updatedAt: now(),
      })
    }
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')
    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)

    await screen.findByText('Fanta')
    const row = await waitFor(() => {
      const el = screen.getByTestId('slot-row-52')
      expect(el).toHaveAttribute('data-ran-dry', 'true')
      return el
    })
    expect(row).not.toHaveClass('border-red-500')
    expect(row).not.toHaveClass('border-blue-500')
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
      before: 2, after: 6, touched: true, filled: true, price: 0, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')

    const { unmount } = render(
      <CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />,
    )

    expect(await screen.findByText(/no slots/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Slot number'), '58')
    await user.click(screen.getByRole('button', { name: 'Open slot' }))
    await user.click(await screen.findByRole('button', { name: 'Add Coke' }))

    // Wait on the row's count cell, not on the text "Coke" — the sheet lists
    // that name too, so it is present before the map has reloaded. Then wait
    // for the seed behind the reload to raise it to the level history holds;
    // that condition is what closes the window the re-seed would otherwise
    // land in.
    await screen.findByLabelText('slot 58 counted')
    await waitFor(() => {
      expect(screen.getByLabelText('slot 58 counted')).toHaveValue('6')
    })

    expect(screen.getByText('Coke')).toBeInTheDocument()

    const placements = await listPlacements()
    expect(effectivePlacement(coke.id, machine.id, placements)?.slots).toEqual([58])

    // The slot just mapped is countable straight away, from the level it
    // carried rather than from zero.
    const visit = await openVisit(run.id, machine.id)
    const counted = screen.getByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '7')
    expect(screen.getByLabelText('slot 58 counted')).toHaveValue('7')
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

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
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
      before: 2, after: 8, touched: true, filled: true, price: 0, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')
    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)

    // On a 54-slot machine this is the operator's only signal for which rows
    // have actually been worked (spec §3.1, §5.1).
    const counted = await screen.findByLabelText('slot 58 counted')
    expect(counted).toHaveValue('8')
    expect(counted).toHaveClass('text-neutral-400')

    await user.clear(counted)
    await user.type(counted, '7')
    expect(screen.getByLabelText('slot 58 counted')).not.toHaveClass('text-neutral-400')
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

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText('Water')

    const counted = screen.getByLabelText('slot 41 counted')
    await user.clear(counted)
    await user.type(counted, '2')

    expect(screen.getByLabelText('slot 41 counted')).toHaveValue('2')
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

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText('Coke')

    const counted = screen.getByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '4')

    expect(counted).toHaveValue('4')
    expect(screen.queryByText('OVER CAPACITY')).not.toBeInTheDocument()
    expect(counted).toHaveClass('text-accent-700')
    await waitFor(async () => {
      expect((await getCountLines(visit.id))[0]?.before).toBe(4)
    })
  })

  // The regression that would ruin tomorrow: a machine's mixed slot had an
  // item that has since been deleted from the catalogue. The counting
  // screen must still render that slot for the item(s) that remain, and a
  // stale finalized CountLine for the deleted item must not crash it either.
  it('still renders a machine whose map referenced a since-deleted item', async () => {
    const ghost = await saveItem({ name: 'Ghost Cola', price: 4, basePar: 5, boxSize: 24 })
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(ghost.id, { kind: 'base' }, [52])
    await setPlacement(coke.id, { kind: 'base' }, [52])
    await setSlotConfig(machine.id, 52, { capacity: 5, accepts: [ghost.id, coke.id] })

    // A finalized count against the ghost item, before it was deleted — this
    // is the historical record that must survive the delete unread and
    // untouched, per the delete's documented decision.
    const priorRun = await createRun('2026-08-22')
    const priorVisit = await openVisit(priorRun.id, machine.id)
    await putCountLine({
      id: newId(), visitId: priorVisit.id, slotNumber: 52, itemId: ghost.id,
      before: 1, after: 5, touched: true, filled: true, price: 0, updatedAt: now(),
    })
    await finalizeVisit(priorVisit.id)

    await deleteItem(ghost.id)

    const run = await createRun('2026-08-26')
    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)

    await screen.findByText('Coke')
    expect(screen.queryByText('Ghost Cola')).not.toBeInTheDocument()
    // Slot 52 is single-item now that the ghost item is gone from the map —
    // the delete's SlotConfig.accepts cleanup, not a leftover mixed row.
    expect(screen.queryByLabelText('slot 52 Coke counted')).not.toBeInTheDocument()
    expect(screen.getByLabelText('slot 52 counted')).toBeInTheDocument()

    // The prior finalized CountLine for the deleted item is untouched.
    const priorLines = await getCountLines(priorVisit.id)
    expect(priorLines).toHaveLength(1)
    expect(priorLines[0].itemId).toBe(ghost.id)
  })

  // devs/debug/finish-machine-should-not-block-editing-it-is-only-a-flag.png:
  // the operator finished a machine, noticed a miscount, and every tap after
  // that was silently swallowed. Spec §7, amended 2026-08-27: finalizedAt is
  // a marker, not a lock.
  it('accepts an edit after Finish machine is tapped, on the same screen', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    const onDone = vi.fn()
    render(<CountScreen runId={run.id} machine={machine} onDone={onDone} />)
    await screen.findByText('Coke')

    const counted = screen.getByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '2')
    await user.click(screen.getByRole('button', { name: 'Finish machine' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    // The miscount correction: one more edit after Finish.
    const countedAfterFinish = screen.getByLabelText('slot 58 counted')
    await user.clear(countedAfterFinish)
    await user.type(countedAfterFinish, '3')
    expect(screen.getByLabelText('slot 58 counted')).toHaveValue('3')

    await waitFor(async () => {
      const lines = await getCountLines(visit.id)
      expect(lines.find((l) => l.slotNumber === 58)?.before).toBe(3)
    })
  })

  it('re-entering a finished machine still accepts edits and Finish still works', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: 58, itemId: coke.id,
      before: 2, after: 2, touched: true, filled: false, price: 0, updatedAt: now(),
    })
    await finalizeVisit(visit.id)

    // A fresh mount of the same visit — exactly what re-opening a finished
    // machine from the machine list does.
    const onDone = vi.fn()
    render(<CountScreen runId={run.id} machine={machine} onDone={onDone} />)
    await screen.findByText('Coke')
    expect(screen.getByLabelText('slot 58 counted')).toHaveValue('2')

    const counted = screen.getByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '3')
    expect(screen.getByLabelText('slot 58 counted')).toHaveValue('3')

    await user.click(screen.getByRole('button', { name: 'Finish machine' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const lines = await getCountLines(visit.id)
    expect(lines.find((l) => l.slotNumber === 58)?.before).toBe(3)
  })

  it('lets the after-count be typed on a slot row', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText('Coke')

    const refilled = screen.getByLabelText('slot 58 refilled to')
    await user.clear(refilled)
    await user.type(refilled, '2')

    await waitFor(async () => {
      expect((await getCountLines(visit.id))[0]?.after).toBe(2)
    })
  })

  it('takes a typed before-count and a typed after-count', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)

    const counted = await screen.findByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '6')
    expect(counted).toHaveValue('6')

    const refilled = screen.getByLabelText('slot 58 refilled to')
    await user.clear(refilled)
    await user.type(refilled, '9')
    expect(refilled).toHaveValue('9')
  })

  it('selects the whole figure on focus, so the first keystroke replaces it', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)

    const counted = await screen.findByLabelText('slot 58 counted')
    await user.click(counted)
    expect((counted as HTMLInputElement).selectionStart).toBe(0)
    expect((counted as HTMLInputElement).selectionEnd).toBe(
      (counted as HTMLInputElement).value.length,
    )
  })

  it('does not cap the counted figure at capacity', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 2, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)

    const counted = await screen.findByLabelText('slot 58 counted')
    expect(counted).not.toHaveAttribute('max')
    await user.clear(counted)
    await user.type(counted, '40')
    expect(counted).toHaveValue('40')
  })

  it('has no per-row stepper or Fill button', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)

    await screen.findByLabelText('slot 58 counted')
    expect(screen.queryByLabelText('slot 58 increase')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('slot 58 decrease')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fill slot 58' })).not.toBeInTheDocument()
  })

  it('marks a ran-dry slot with an edge inset and no RAN DRY text', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])

    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 58, itemId: coke.id,
      before: 0, after: 0, touched: true, filled: false, price: 0, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')
    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)

    await screen.findByText('Coke')
    expect(screen.queryByText('RAN DRY')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('slot-row-58')).toHaveAttribute('data-ran-dry', 'true')
    })
  })

  it('renders an over-capacity counted figure in accent, with no OVER CAPACITY label', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 2, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText('Coke')

    const counted = screen.getByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '4')

    expect(screen.queryByText('OVER CAPACITY')).not.toBeInTheDocument()
    expect(screen.getByLabelText('slot 58 counted')).toHaveClass('text-accent-700')
  })

  // Review fix round 1: before this fix, `overCapacity` was only ever passed
  // to the single-item CountCell — a mixed slot over capacity rendered
  // nothing at all, a regression of the "over capacity is flagged, never
  // prevented" behaviour this task must not touch. The parent row's cells
  // are empty by §3.4 (no figure to colour there); the signal belongs on
  // each item's Counted cell, per §3.5, together, since the slot as a whole
  // is what tipped over.
  it('renders every item counted cell in accent when a mixed slot goes over capacity', async () => {
    const user = userEvent.setup()
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(fanta.id, { kind: 'base' }, [52])
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    await setSlotConfig(machine.id, 52, { capacity: 5, accepts: [fanta.id, sunkist.id] })
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText('Fanta')

    const fantaCounted = screen.getByLabelText('slot 52 Fanta counted')
    await user.clear(fantaCounted)
    await user.type(fantaCounted, '3')
    const sunkistCounted = screen.getByLabelText('slot 52 Sunkist counted')
    await user.clear(sunkistCounted)
    await user.type(sunkistCounted, '3')

    expect(screen.queryByText('OVER CAPACITY')).not.toBeInTheDocument()
    expect(screen.getByLabelText('slot 52 Fanta counted')).toHaveClass('text-accent-700')
    expect(screen.getByLabelText('slot 52 Sunkist counted')).toHaveClass('text-accent-700')
  })

  it('fills the active tray from the footer', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Fill tray to par' }))
    expect(await screen.findByLabelText('slot 58 refilled to')).toHaveValue('5')
  })

  it('says which machine you are in', async () => {
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: /L7/ })).toBeInTheDocument()
  })

  it('names the two columns', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    // Scoped to the column header itself: the legend under the list (§3.5)
    // also names both columns, verbatim, so an unscoped query for either
    // string is ambiguous between the two.
    const columnHeader = await screen.findByTestId('column-header')
    expect(within(columnHeader).getByText('Counted')).toBeInTheDocument()
    expect(within(columnHeader).getByText(/Refilled/)).toBeInTheDocument()
  })

  // Restores, at screen level, the mixed-slot Fill coverage Task 4 dropped
  // when the per-row Fill button lost its UI path (§3.6). Per-slot Fill
  // moves into the ⋯ sheet in the next task, out of scope here — so this
  // drives the same fillToCapacity-across-items recompute through the new
  // tray-level "Fill tray to par" footer action instead. This is the seam
  // that produced the most expensive bug of the previous phase: a
  // hand-entered after-count in a mixed slot silently overwritten and saved,
  // reachable in four ordinary taps (fixed at the hook level in 691b5cc,
  // covered there by useCounting.test.tsx; this is the screen-level path to
  // the same recompute, run end-to-end through the UI and persistence).
  it('fills a mixed slot to capacity from the footer, then keeps the cross-item recompute correct after a sibling edit', async () => {
    const user = userEvent.setup()
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(fanta.id, { kind: 'base' }, [52])
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText('Fanta')

    await user.click(screen.getByRole('button', { name: 'Fill tray to par' }))

    // Filled to capacity (5): the preferred item (Fanta, first
    // alphabetically) takes the whole shortfall since both items start at 0.
    await waitFor(() => {
      expect(screen.getByLabelText('slot 52 Fanta refilled to')).toHaveValue('5')
    })
    expect(screen.getByLabelText('slot 52 Sunkist refilled to')).toHaveValue('0')

    // Editing Sunkist's before-count while the slot is still filled must
    // recompute the whole slot's after via fillToCapacity, not just mirror
    // Sunkist's own before into its own after.
    const sunkistCounted = screen.getByLabelText('slot 52 Sunkist counted')
    await user.clear(sunkistCounted)
    await user.type(sunkistCounted, '3')

    await waitFor(async () => {
      const lines = await getCountLines(visit.id)
      expect(lines.find((l) => l.itemId === sunkist.id)?.before).toBe(3)
    })

    const lines = await getCountLines(visit.id)
    const sunkistLine = lines.find((l) => l.itemId === sunkist.id)
    const fantaLine = lines.find((l) => l.itemId === fanta.id)

    // The slot total sits at capacity, and no item's after dips below its
    // before — the same invariant the dropped test checked.
    expect((fantaLine?.after ?? 0) + (sunkistLine?.after ?? 0)).toBe(5)
    expect(fantaLine?.after).toBeGreaterThanOrEqual(fantaLine?.before ?? 0)
    expect(sunkistLine?.after).toBeGreaterThanOrEqual(sunkistLine?.before ?? 0)

    // The screen shows the same figures that were persisted, not just
    // whatever happens to be in memory.
    expect(screen.getByLabelText('slot 52 Sunkist refilled to')).toHaveValue(
      String(sunkistLine?.after ?? 0),
    )
    expect(screen.getByLabelText('slot 52 Fanta refilled to')).toHaveValue(
      String(fantaLine?.after ?? 0),
    )
  })

  // Fix round 1, item 2: the actual bug this seam produced was not about
  // `filled` (setAfter already clears it for the whole slot the moment any
  // item's after is hand-typed, which makes the `filled` + `afterTouched`
  // combination unreachable through ordinary taps). It was this, reachable
  // in four ordinary taps: type a mixed slot's after-count by hand, then
  // edit that SAME item's before-count, and the hand-typed after-count gets
  // silently clobbered. Rule 3 in useCounting.setBefore guards this
  // (afterTouched keys are never re-derived), but it had no screen-level
  // test driving it through the real UI.
  it('keeps a hand-entered after-count in a mixed slot when that item\'s before-count is edited afterwards', async () => {
    const user = userEvent.setup()
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(fanta.id, { kind: 'base' }, [52])
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText('Fanta')

    // 1–2. Type a figure into Sunkist's refilled-to cell by hand.
    const sunkistRefilled = screen.getByLabelText('slot 52 Sunkist refilled to')
    await user.clear(sunkistRefilled)
    await user.type(sunkistRefilled, '4')
    expect(screen.getByLabelText('slot 52 Sunkist refilled to')).toHaveValue('4')

    // 3. Change that same item's counted cell.
    const sunkistCounted = screen.getByLabelText('slot 52 Sunkist counted')
    await user.clear(sunkistCounted)
    await user.type(sunkistCounted, '2')

    await waitFor(async () => {
      const lines = await getCountLines((await openVisit(run.id, machine.id)).id)
      expect(lines.find((l) => l.itemId === sunkist.id)?.before).toBe(2)
    })

    // 4. The hand-entered refilled-to figure is unchanged, on screen and on
    // disk — not silently re-derived back to the before-count.
    expect(screen.getByLabelText('slot 52 Sunkist refilled to')).toHaveValue('4')
    const lines = await getCountLines((await openVisit(run.id, machine.id)).id)
    expect(lines.find((l) => l.itemId === sunkist.id)?.after).toBe(4)
  })

  // Fix 3(a), 2026-08-28 whole-branch review: on a machine with nothing
  // mapped, `slots` is `[]`, `fillTray([])` returns immediately, and the
  // button was inert — visibly present, silently doing nothing when tapped.
  it('hides Fill tray to par when the machine has nothing mapped', async () => {
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText(/no slots/i)

    expect(screen.queryByRole('button', { name: 'Fill tray to par' })).not.toBeInTheDocument()
  })

  // Fix 3(b), 2026-08-28 whole-branch review: the "Open slot" flow opens the
  // sheet for a slot number that is not yet in the map — before this fix,
  // the sheet still rendered "Fill to capacity", and `toggleFill` would
  // return immediately at its own `map.find` guard. The button could never
  // do anything.
  it('does not offer Fill in the sheet for a slot just opened that is not yet in the map', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText(/no slots/i)

    await user.type(screen.getByLabelText('Slot number'), '58')
    await user.click(screen.getByRole('button', { name: 'Open slot' }))

    await screen.findByText('Slot 58')
    expect(screen.queryByRole('button', { name: 'Fill slot 58' })).not.toBeInTheDocument()
  })

  // Fix 5, 2026-08-28 whole-branch review: `counted` was `touched.size`,
  // never pruned. Removing an item from a slot mid-count via `⋯` shrinks the
  // map on `reload()` while `touched` keeps the stale key, so the header
  // read `2 / 1` and the bar rendered at 200% of a full-width parent —
  // reintroducing the container-break defect on the one screen it was fixed
  // for. Intersecting `touched` with the current map's keys keeps both the
  // figure and the bar within bounds.
  it('does not let counted exceed total, or the bar exceed 100%, after a slot shrinks mid-count', async () => {
    const user = userEvent.setup()
    const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(fanta.id, { kind: 'base' }, [52])
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    await screen.findByText('Fanta')

    // Touch both items of the mixed slot: counted 2, total 2.
    const fantaCounted = screen.getByLabelText('slot 52 Fanta counted')
    await user.clear(fantaCounted)
    await user.type(fantaCounted, '1')
    const sunkistCounted = screen.getByLabelText('slot 52 Sunkist counted')
    await user.clear(sunkistCounted)
    await user.type(sunkistCounted, '2')
    await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument())

    // Remove Sunkist from the slot via ⋯ — the map shrinks to one item, but
    // Sunkist's level key stays in `touched`.
    await user.click(screen.getByRole('button', { name: 'Edit slot 52' }))
    await user.click(await screen.findByRole('button', { name: 'Remove Sunkist' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('slot 52 Sunkist counted')).not.toBeInTheDocument()
    })

    // counted (1) never exceeds total (1) in the header figure …
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(screen.queryByText(/^2 \//)).not.toBeInTheDocument()

    // … and the bar's width never exceeds 100% of its track.
    const track = document.querySelector('.bg-rule-light.overflow-hidden') as HTMLElement
    const bar = track.firstElementChild as HTMLElement
    expect(bar.style.width).toBe('100%')
  })

  // Fix 6, 2026-08-28 whole-branch review: `onFocus`'s synchronous
  // `select()` is routinely defeated on iOS Safari, where the caret is
  // positioned on touch AFTER focus fires. `onClick` fires after the caret
  // is placed, so it is the insurance that covers the touch ordering —
  // verified here directly, independent of whatever `onFocus` already did.
  it('also selects the whole figure on click, as insurance for the iOS focus/caret ordering', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    const counted = await screen.findByLabelText('slot 58 counted')
    const refilled = screen.getByLabelText('slot 58 refilled to')

    const selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select')
    fireEvent.click(counted)
    expect(selectSpy).toHaveBeenCalled()

    selectSpy.mockClear()
    fireEvent.click(refilled)
    expect(selectSpy).toHaveBeenCalled()

    selectSpy.mockRestore()
  })

  // Fix 7, 2026-08-28 whole-branch review: every row already carries its own
  // `border-b border-rule-light` (§3.2's ruled table); the `gap-2` between
  // rows cost roughly 80px per screen and made the rows read as floating
  // cards instead of a ruled table.
  it('butts slot rows together with no gap between them', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machine={machine} onDone={vi.fn()} />)
    const row = await screen.findByTestId('slot-row-58')
    const list = row.parentElement as HTMLElement

    expect(list.className).not.toMatch(/\bgap-\d/)
  })
})

/** Spec §6.3, design §9 and §12.3. One line under the sticky column header,
 * only when what is left on the trolley will not reach the machines still
 * ahead — while there is still a decision to be made about it. */
describe('CountScreen — the trolley watch', () => {
  /** Two machines, one item at slot 58 on both. Neither has ever been
   * counted, so each slot's need is its whole capacity (8, from basePar):
   * the run wants 16 Cokes. What went on the trolley is the variable. */
  async function loaded(taken: number) {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const here = await saveMachine({ label: 'Lift lobby', level: 7 })
    await saveMachine({ label: 'Gym', level: 11 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-09-04')
    await recordTrolleyLoad({
      runId: run.id, itemId: coke.id, needed: 16, taken, noneLeftInG: false,
    })
    return { coke, here, run }
  }

  it('says nothing when there is enough for the machines ahead', async () => {
    const { here, run } = await loaded(20)

    render(<CountScreen runId={run.id} machine={here} onDone={vi.fn()} />)
    await screen.findByText('Coke')

    // The watch loads behind the first paint, so give it room to land —
    // an assertion made too early would pass for the wrong reason.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByTestId('trolley-watch')).toBeNull()
  })

  it('names the level once the projection runs short', async () => {
    const { here, run } = await loaded(10)

    render(<CountScreen runId={run.id} machine={here} onDone={vi.fn()} />)
    await screen.findByText('Coke')

    // L7 draws 8 of the 10 on the trolley; L11 wants 8 more and cannot have
    // them, so L11 is the level it runs out at.
    const watch = await screen.findByTestId('trolley-watch')
    expect(watch).toHaveTextContent('Coke runs out at L11 · 10 left')
  })

  it('goes quiet again when a machine turns out fuller than projected', async () => {
    const user = userEvent.setup()
    const { here, run } = await loaded(10)

    render(<CountScreen runId={run.id} machine={here} onDone={vi.fn()} />)
    await screen.findByTestId('trolley-watch')

    // L7 turns out full: it takes nothing off the trolley, so the 10 loaded
    // cover L11's 8 after all.
    const counted = screen.getByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '8')

    await waitFor(() => expect(screen.queryByTestId('trolley-watch')).toBeNull())
  })

  it('stays silent on a run where no trolley was loaded', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const here = await saveMachine({ label: 'Lift lobby', level: 7 })
    await saveMachine({ label: 'Gym', level: 11 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-09-04')

    render(<CountScreen runId={run.id} machine={here} onDone={vi.fn()} />)
    await screen.findByText('Coke')

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByTestId('trolley-watch')).toBeNull()
  })

  // Spec §8.1: "A run's full working set loads into memory at run start.
  // There are no queries at all during counting." The watch reads once on
  // entry and recomputes in memory from there.
  it('issues no query while counting', async () => {
    const user = userEvent.setup()
    const { here, run } = await loaded(10)

    const trolleyRead = vi.spyOn(trolleyRepo, 'trolleyForRun')
    const forecastRead = vi.spyOn(forecastRepo, 'forecastForRun')

    render(<CountScreen runId={run.id} machine={here} onDone={vi.fn()} />)
    await screen.findByTestId('trolley-watch')

    const reads = trolleyRead.mock.calls.length + forecastRead.mock.calls.length

    const counted = screen.getByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '5')
    await waitFor(() => expect(screen.getByLabelText('slot 58 counted')).toHaveValue('5'))

    expect(trolleyRead.mock.calls.length + forecastRead.mock.calls.length).toBe(reads)

    trolleyRead.mockRestore()
    forecastRead.mockRestore()
  })
})
