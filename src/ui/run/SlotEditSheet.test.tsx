import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem, listItems } from '../../data/repositories/items'
import { setPlacement, listPlacements } from '../../data/repositories/placements'
import { listSlotConfigs } from '../../data/repositories/slotConfigs'
import { effectivePlacement, resolveMachineMap } from '../../domain/placement'
import { SlotEditSheet } from './SlotEditSheet'
import type { Id } from '../../domain/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

/** Renders the sheet and returns the `onSaved` spy. Every edit persists behind
 * the tap, so tests wait for `onSaved` — which fires only once the writes have
 * landed — rather than racing the promise chain. */
function renderSheet(props: {
  slotNumber: number
  capacity: number | null
  items: Awaited<ReturnType<typeof listItems>>
  currentItemIds: Id[]
}) {
  const onSaved = vi.fn()
  render(
    <SlotEditSheet
      machineId="L7"
      slotNumber={props.slotNumber}
      capacity={props.capacity}
      items={props.items}
      currentItemIds={props.currentItemIds}
      onSaved={onSaved}
      onCancel={vi.fn()}
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
      slotNumber: 52, capacity: 5, items: await listItems(), currentItemIds: [sunkist.id],
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
      slotNumber: 52, capacity: 5, items: await listItems(), currentItemIds: [sunkist.id],
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
      slotNumber: 52, capacity: 5, items: await listItems(), currentItemIds: [sunkist.id],
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
      capacity: 8,
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
      slotNumber: 41, capacity: null, items: await listItems(), currentItemIds: [],
    })

    await user.click(screen.getByRole('button', { name: 'Add Coke' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const slot = await resolvedSlot('L7', 41)
    expect(slot?.capacity).toBe(8)
    expect(slot?.accepts).toEqual([coke.id])
  })
})
