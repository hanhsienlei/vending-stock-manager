import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem, listItems } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { setPlacement, listPlacements } from '../../data/repositories/placements'
import { listSlotConfigs } from '../../data/repositories/slotConfigs'
import { effectivePlacement, resolveMachineMap } from '../../domain/placement'
import { SlotEditSheet } from './SlotEditSheet'
import type { Id, Machine } from '../../domain/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const MACHINE: Machine = { id: 'L7', label: 'Level 7', level: 7, updatedAt: 0 }

/** Renders the sheet and returns the `onSaved` spy. Every edit persists behind
 * the tap, so tests wait for `onSaved` — which fires only once the writes have
 * landed — rather than racing the promise chain. */
function renderSheet(props: {
  slotNumber?: number
  items?: Awaited<ReturnType<typeof listItems>>
  currentItemIds?: Id[]
  capacity?: number
  machine?: Machine
  isFilled?: boolean
  onToggleFill?: () => void
  slotInMap?: boolean
}) {
  const onSaved = vi.fn()
  render(
    <SlotEditSheet
      machine={props.machine ?? MACHINE}
      slotNumber={props.slotNumber ?? 58}
      items={props.items ?? []}
      currentItemIds={props.currentItemIds ?? []}
      capacity={props.capacity ?? 0}
      onSaved={onSaved}
      onCancel={vi.fn()}
      isFilled={props.isFilled}
      onToggleFill={props.onToggleFill}
      slotInMap={props.slotInMap}
    />,
  )
  return onSaved
}

async function resolvedSlot(machineId: string, slotNumber: number) {
  const map = resolveMachineMap(
    machineId, await listItems(), await listPlacements(), await listSlotConfigs(),
  )
  return map.find((s) => s.slotNumber === slotNumber)
}

describe('SlotEditSheet', () => {
  it('adds a second item to a slot without disturbing other machines', async () => {
    const user = userEvent.setup()
    const sunkist = await saveItem({ name: 'Sunkist', price: 4.5, basePar: 5, boxSize: 24 })
    const fanta = await saveItem({ name: 'Fanta', price: 4.5, basePar: 5, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    const onSaved = renderSheet({
      slotNumber: 52, items: await listItems(), currentItemIds: [sunkist.id],
    })

    await user.click(screen.getByRole('button', { name: 'Add Fanta' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const placements = await listPlacements()
    expect(effectivePlacement(fanta.id, 'L7', placements)?.slots).toEqual([52])
    // another machine still resolves without Fanta
    expect(effectivePlacement(fanta.id, 'L5', placements)).toBeUndefined()
  })

  it('removes an item from this machine only', async () => {
    const user = userEvent.setup()
    const sunkist = await saveItem({ name: 'Sunkist', price: 4.5, basePar: 5, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    const onSaved = renderSheet({
      slotNumber: 52, items: await listItems(), currentItemIds: [sunkist.id],
    })

    await user.click(screen.getByRole('button', { name: 'Remove Sunkist' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const placements = await listPlacements()
    expect(effectivePlacement(sunkist.id, 'L7', placements)?.slots).toEqual([])
    expect(effectivePlacement(sunkist.id, 'L5', placements)?.slots).toEqual([52])
  })

  it('keeps the slot capacity and preference order when a second item is added', async () => {
    const user = userEvent.setup()
    // Different basePar on purpose: Coke sorts first alphabetically and pars
    // higher, so an unpinned slot would silently deepen from 5 to 8.
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    const onSaved = renderSheet({
      slotNumber: 52, items: await listItems(), currentItemIds: [sunkist.id],
    })

    await user.click(screen.getByRole('button', { name: 'Add Coke' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const slot = await resolvedSlot('L7', 52)
    expect(slot?.capacity).toBe(5)
    expect(slot?.accepts).toEqual([sunkist.id, coke.id])
  })

  it('keeps the slot capacity when an item is removed from a mixed slot', async () => {
    const user = userEvent.setup()
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    await setPlacement(coke.id, { kind: 'base' }, [52])

    const onSaved = renderSheet({
      slotNumber: 52,
      items: await listItems(),
      currentItemIds: [coke.id, sunkist.id],
    })

    await user.click(screen.getByRole('button', { name: 'Remove Coke' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    expect((await resolvedSlot('L7', 52))?.capacity).toBe(8)
  })

  it('leaves an unassigned slot to seed its capacity from the first item placed', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

    const onSaved = renderSheet({
      slotNumber: 41, items: await listItems(), currentItemIds: [],
    })

    await user.click(screen.getByRole('button', { name: 'Add Coke' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const slot = await resolvedSlot('L7', 41)
    expect(slot?.capacity).toBe(8)
    expect(slot?.accepts).toEqual([coke.id])
  })

  it('shows the current effective capacity as the starting value', async () => {
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    renderSheet({
      slotNumber: 52, items: await listItems(), currentItemIds: [sunkist.id], capacity: 5,
    })

    expect(screen.getByLabelText('Capacity')).toHaveValue(5)
  })

  it('overrides a slot capacity for this machine only, without disturbing another', async () => {
    const user = userEvent.setup()
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    const onSaved = renderSheet({
      slotNumber: 52,
      items: await listItems(),
      currentItemIds: [sunkist.id],
      capacity: 5,
      machine: MACHINE,
    })

    const input = screen.getByLabelText('Capacity')
    await user.clear(input)
    await user.type(input, '20')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    expect((await resolvedSlot('L7', 52))?.capacity).toBe(20)
    // A per-machine override must not leak onto a different machine's map.
    expect((await resolvedSlot('L9', 52))?.capacity).toBe(5)
  })

  // Item 8, fix-plan 2026-08-27: saveCapacity rejected only `value < 0`, so
  // a slot could be saved at capacity 0 and then fill to nothing.
  it('refuses to save a capacity of zero', async () => {
    const user = userEvent.setup()
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    const onSaved = renderSheet({
      slotNumber: 52, items: await listItems(), currentItemIds: [sunkist.id], capacity: 5,
    })

    const input = screen.getByLabelText('Capacity')
    await user.clear(input)
    await user.type(input, '0')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // Give any (wrongly) in-flight write a turn to land before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onSaved).not.toHaveBeenCalled()
    expect((await resolvedSlot('L7', 52))?.capacity).toBe(5)
  })

  it('refuses to save a negative capacity', async () => {
    const user = userEvent.setup()
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    const onSaved = renderSheet({
      slotNumber: 52, items: await listItems(), currentItemIds: [sunkist.id], capacity: 5,
    })

    const input = screen.getByLabelText('Capacity')
    await user.clear(input)
    await user.type(input, '-3')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onSaved).not.toHaveBeenCalled()
    expect((await resolvedSlot('L7', 52))?.capacity).toBe(5)
  })

  it('keeps the preference order when only capacity is overridden', async () => {
    const user = userEvent.setup()
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    await setPlacement(coke.id, { kind: 'base' }, [52])

    const onSaved = renderSheet({
      slotNumber: 52,
      items: await listItems(),
      currentItemIds: [sunkist.id, coke.id],
      capacity: 5,
    })

    const input = screen.getByLabelText('Capacity')
    await user.clear(input)
    await user.type(input, '9')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const slot = await resolvedSlot('L7', 52)
    expect(slot?.capacity).toBe(9)
    expect(slot?.accepts).toEqual([sunkist.id, coke.id])
  })

  it('opens the adjustment sheet for an item in the slot', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })

    render(
      <SlotEditSheet
        machine={machine}
        slotNumber={58}
        items={[coke]}
        currentItemIds={[coke.id]}
        capacity={5}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Adjust Coke' }))

    expect(await screen.findByLabelText('Units')).toBeInTheDocument()
  })

  it('offers Fill for this slot when opened during a count', async () => {
    const user = userEvent.setup()
    const onToggleFill = vi.fn()
    renderSheet({ isFilled: false, onToggleFill, slotInMap: true })
    await user.click(screen.getByRole('button', { name: 'Fill slot 58' }))
    expect(onToggleFill).toHaveBeenCalled()
  })

  it('does not offer Fill when opened from the machine map', () => {
    renderSheet({})
    expect(screen.queryByRole('button', { name: 'Fill slot 58' })).not.toBeInTheDocument()
  })

  // Fix 3(b), 2026-08-28 whole-branch review: the count screen's "Open slot"
  // flow opens this sheet for a slot number the operator typed that is not
  // yet in the machine's map — `toggleFill` returns immediately at its own
  // `map.find` guard, so a rendered Fill button could never do anything.
  // The caller passes whether the slot is mapped; the sheet must not offer
  // Fill just because a handler happens to be present.
  it('does not offer Fill for a slot that is not yet in the map, even mid-count', () => {
    renderSheet({ isFilled: false, onToggleFill: vi.fn(), slotInMap: false })
    expect(screen.queryByRole('button', { name: 'Fill slot 58' })).not.toBeInTheDocument()
  })

  // §3.8: the tray-level "Fill tray to par" footer action is the only
  // accent-coloured action in the run screen body; a filled slot's toggle
  // is a selected state (tokens.md: ink fill for a selected state), not a
  // second primary action, so it must not carry the accent class.
  it('shows the per-slot Fill control in ink fill when this slot is already filled', () => {
    renderSheet({ isFilled: true, onToggleFill: () => {}, slotInMap: true })
    const button = screen.getByRole('button', { name: 'Fill slot 58' })
    expect(button.className).toMatch(/\bbg-ink\b/)
    expect(button.className).not.toMatch(/\bbg-accent\b/)
  })

  it('shows the per-slot Fill control in ground fill when this slot is not filled', () => {
    renderSheet({ isFilled: false, onToggleFill: () => {}, slotInMap: true })
    const button = screen.getByRole('button', { name: 'Fill slot 58' })
    expect(button.className).toMatch(/\bbg-ground\b/)
    expect(button.className).not.toMatch(/\bbg-accent\b/)
  })

  // Fix 4, 2026-08-28 whole-branch review: MachineMapScreen fabricates
  // `{capacity: 0}` for an unmapped "Not stocked" row, and this sheet used
  // to pre-fill "0" into the Capacity field — a Save the `< 1` guard would
  // silently swallow forever, with no message. Starting the field empty
  // makes it visibly incomplete instead.
  it('starts the capacity field empty, not pre-filled with 0, for an unmapped slot', () => {
    renderSheet({ capacity: 0 })
    expect(screen.getByLabelText('Capacity')).toHaveValue(null)
  })

  it('disables Save capacity while the field is empty', () => {
    renderSheet({ capacity: 0 })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('disables Save capacity while the typed value is below 1, and re-enables once it is not', async () => {
    const user = userEvent.setup()
    renderSheet({ capacity: 0 })
    const input = screen.getByLabelText('Capacity')
    const save = screen.getByRole('button', { name: 'Save' })

    await user.type(input, '0')
    expect(save).toBeDisabled()

    await user.clear(input)
    await user.type(input, '5')
    expect(save).not.toBeDisabled()
  })

  it('enables Save capacity immediately for a slot with a real starting capacity', () => {
    renderSheet({ capacity: 5 })
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })
})

describe('SlotEditSheet — §6 layout', () => {
  it('says which machine and tray the slot is in', () => {
    renderSheet({ slotNumber: 31 })
    expect(screen.getByText('Slot 31')).toBeInTheDocument()
    expect(screen.getByText('L7 · Tray 3')).toBeInTheDocument()
  })

  // The defect §6 exists to fix: the visible label WAS the accessible name,
  // so a two-item slot rendered four buttons all starting with the same
  // forty characters. The row is the subject; the button is the verb.
  it('shows the verb as the visible label and keeps the full string as the accessible name', async () => {
    const chips = await saveItem({
      name: 'Red Rock Deli Chips Honey Soy Chicken', price: 3.5, basePar: 5, boxSize: 1,
    })
    renderSheet({ items: await listItems(), currentItemIds: [chips.id] })

    const remove = screen.getByRole('button', {
      name: 'Remove Red Rock Deli Chips Honey Soy Chicken',
    })
    expect(remove).toHaveTextContent(/^REMOVE$/)
    const adjust = screen.getByRole('button', {
      name: 'Adjust Red Rock Deli Chips Honey Soy Chicken',
    })
    expect(adjust).toHaveTextContent(/^ADJUST$/)
  })

  it('warns about the changeover only when the slot holds two items', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    const fanta = await saveItem({ name: 'Fanta', price: 4.5, basePar: 5, boxSize: 1 })
    const items = await listItems()

    renderSheet({ items, currentItemIds: [coke.id] })
    expect(screen.queryByText(/changeover/i)).not.toBeInTheDocument()
    cleanup()

    renderSheet({ items, currentItemIds: [coke.id, fanta.id] })
    expect(screen.getByText(/Two items means a changeover/)).toBeInTheDocument()
  })

  // §6: "the usual slot is the fastest way to catch that you are about to
  // place something in the wrong channel."
  it('shows each addable item its base slot', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    await setPlacement(coke.id, { kind: 'base' }, [34])
    renderSheet({ items: await listItems(), currentItemIds: [] })

    await waitFor(() => expect(screen.getByText('· usually 34')).toBeInTheDocument())
  })

  it('filters the add list by the search field', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    await saveItem({ name: 'Fanta', price: 4.5, basePar: 5, boxSize: 1 })
    renderSheet({ items: await listItems(), currentItemIds: [] })

    await user.type(screen.getByLabelText('Search items to add'), 'fan')
    expect(screen.getByRole('button', { name: 'Add Fanta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Coke' })).not.toBeInTheDocument()
  })

  it('carries no rounded corner and no legacy palette class', () => {
    const { container } = render(
      <SlotEditSheet
        machine={MACHINE} slotNumber={31} items={[]} currentItemIds={[]} capacity={5}
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
