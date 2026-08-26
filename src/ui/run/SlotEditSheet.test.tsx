import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem, listItems } from '../../data/repositories/items'
import { setPlacement, listPlacements } from '../../data/repositories/placements'
import { effectivePlacement } from '../../domain/placement'
import { SlotEditSheet } from './SlotEditSheet'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('SlotEditSheet', () => {
  it('adds a second item to a slot without disturbing other machines', async () => {
    const user = userEvent.setup()
    const sunkist = await saveItem({ name: 'Sunkist', price: 4.5, basePar: 5, boxSize: 24 })
    const fanta = await saveItem({ name: 'Fanta', price: 4.5, basePar: 5, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    const items = await listItems()
    render(
      <SlotEditSheet
        machineId="L7"
        slotNumber={52}
        items={items}
        currentItemIds={[sunkist.id]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Add Fanta' }))

    const placements = await listPlacements()
    expect(effectivePlacement(fanta.id, 'L7', placements)?.slots).toEqual([52])
    // another machine still resolves without Fanta
    expect(effectivePlacement(fanta.id, 'L5', placements)).toBeUndefined()
  })

  it('removes an item from this machine only', async () => {
    const user = userEvent.setup()
    const sunkist = await saveItem({ name: 'Sunkist', price: 4.5, basePar: 5, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    const items = await listItems()
    render(
      <SlotEditSheet
        machineId="L7"
        slotNumber={52}
        items={items}
        currentItemIds={[sunkist.id]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove Sunkist' }))

    const placements = await listPlacements()
    expect(effectivePlacement(sunkist.id, 'L7', placements)?.slots).toEqual([])
    expect(effectivePlacement(sunkist.id, 'L5', placements)?.slots).toEqual([52])
  })
})
