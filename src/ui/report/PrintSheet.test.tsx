import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { createRun } from '../../data/repositories/runs'
import { openVisit, putCountLine, finalizeVisit } from '../../data/repositories/visits'
import { setPlacement } from '../../data/repositories/placements'
import { newId, now } from '../../domain/ids'
import { PrintSheet } from './PrintSheet'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

/** One finalized visit touching a run of slots — the same shape
 * `ReportScreen.test.tsx` seeds through, so a rate is built from real
 * finalized visits rather than assembled by hand. */
async function countSlots(
  date: string, machineId: string,
  slots: { slotNumber: number; itemId: string; before: number; after: number }[],
  price = 4.5,
) {
  const run = await createRun(date)
  const visit = await openVisit(run.id, machineId)
  for (const slot of slots) {
    await putCountLine({
      id: newId(), visitId: visit.id, slotNumber: slot.slotNumber,
      itemId: slot.itemId, before: slot.before, after: slot.after,
      touched: true, filled: false, price, updatedAt: now(),
    })
  }
  await finalizeVisit(visit.id)
}

/** Three weekly visits to one slot — two clean periods, the minimum a rate
 * exists at (`MIN_PERIODS_FOR_RATE`), so the item is rated and the override
 * below has a real row to land on (`buildOrderInputs` drops anything with
 * neither a rate nor a flag). The id is literally `mars`, matching the
 * override key the test writes to `localStorage`. */
async function seedRatedMars() {
  const mars = await saveItem({ id: 'mars', name: 'Mars', price: 2, basePar: 10, boxSize: 50 })
  const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
  await setPlacement(mars.id, { kind: 'base' }, [36])
  await countSlots('2026-08-13', l7.id, [{ slotNumber: 36, itemId: mars.id, before: 0, after: 10 }])
  await countSlots('2026-08-20', l7.id, [{ slotNumber: 36, itemId: mars.id, before: 4, after: 10 }])
  await countSlots('2026-08-27', l7.id, [{ slotNumber: 36, itemId: mars.id, before: 4, after: 10 }])
  return mars
}

describe('PrintSheet', () => {
  it('renders the matrix and none of the screen furniture', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    await countSlots('2026-08-20', l7.id, [{ slotNumber: 58, itemId: coke.id, before: 0, after: 10 }])
    await countSlots('2026-08-27', l7.id, [{ slotNumber: 58, itemId: coke.id, before: 4, after: 10 }])

    render(<PrintSheet />)

    await screen.findByRole('columnheader', { name: 'Order' })
    expect(screen.queryByRole('button', { name: /turn phone/i })).toBeNull()
    expect(screen.queryByText(/covers 10 days/i)).toBeNull()   // the order section
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('states when it was true, and on what horizon', async () => {
    for (let i = 0; i < 15; i++) {
      await saveMachine({ label: `Level ${i + 1}`, level: i + 1 })
    }

    render(<PrintSheet />)

    const line = await screen.findByLabelText('sheet provenance')
    expect(line).toHaveTextContent('15 machines')
    expect(line).toHaveTextContent('7 + 3 days')
  })

  it('prints the operator override in the Order column', async () => {
    await seedRatedMars()
    window.localStorage.setItem('vsm.order.overrides', JSON.stringify({ mars: 2 }))

    render(<PrintSheet />)

    expect(await screen.findByLabelText('order for 36')).toHaveTextContent('2 × 50')
  })
})
