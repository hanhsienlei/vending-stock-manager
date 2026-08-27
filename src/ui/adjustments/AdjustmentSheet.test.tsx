import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { listAdjustments } from '../../data/repositories/adjustments'
import { AdjustmentSheet } from './AdjustmentSheet'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('AdjustmentSheet', () => {
  it('records a write-off as a negative movement at the slot', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const onSaved = vi.fn()

    render(
      <AdjustmentSheet
        location={{ kind: 'machine', machineId: l7.id, slotNumber: 58 }}
        itemId={coke.id}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    )

    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '2')
    await user.selectOptions(screen.getByLabelText('Reason'), 'expired')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [saved] = await listAdjustments()
    expect(saved).toMatchObject({
      itemId: coke.id, locationKind: 'machine', machineId: l7.id,
      slotNumber: 58, reason: 'expired', units: -2,
    })
  })

  it('records a delivery as a positive movement', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })

    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }}
        itemId={coke.id}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '24')
    await user.selectOptions(screen.getByLabelText('Reason'), 'delivery')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(async () => {
      expect((await listAdjustments())[0]?.units).toBe(24)
    })
  })

  it('asks where a transfer is going, and writes both sides', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })

    render(
      <AdjustmentSheet
        location={{ kind: 'machine', machineId: l7.id, slotNumber: 58 }}
        itemId={coke.id}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Destination')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Reason'), 'transfer')
    expect(await screen.findByLabelText('Destination')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '3')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(async () => {
      expect(await listAdjustments()).toHaveLength(2)
    })
    const saved = await listAdjustments()
    expect(saved.map((a) => a.units).sort((a, b) => a - b)).toEqual([-3, 3])
  })

  it('refuses a quantity of zero rather than writing a no-op movement', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const onSaved = vi.fn()

    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }}
        itemId={coke.id}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    )

    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '0')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(await listAdjustments()).toEqual([])
  })

  // The brief's own `slotOf` helper reads the SOURCE location, so a
  // storeroom-to-machine transfer would have recorded the arriving row at
  // slot 0 — not a physical slot, and poison for the sales residual, which
  // pairs on (slot, item). The destination slot must be asked for instead.
  it('asks for the destination slot when transferring from the storeroom into a machine, and records it there', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })

    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }}
        itemId={coke.id}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Reason'), 'transfer')
    await user.selectOptions(await screen.findByLabelText('Destination'), l7.id)

    const slotField = await screen.findByLabelText('Destination slot')
    await user.clear(slotField)
    await user.type(slotField, '58')

    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '3')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(async () => {
      expect(await listAdjustments()).toHaveLength(2)
    })
    const saved = await listAdjustments()
    const arriving = saved.find((a) => a.locationKind === 'machine')
    expect(arriving).toMatchObject({ machineId: l7.id, slotNumber: 58, units: 3 })
  })

  it('refuses an invalid destination slot rather than writing a movement at a non-physical slot', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const onSaved = vi.fn()

    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }}
        itemId={coke.id}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Reason'), 'transfer')
    await user.selectOptions(await screen.findByLabelText('Destination'), l7.id)

    const slotField = await screen.findByLabelText('Destination slot')
    await user.clear(slotField)
    await user.type(slotField, '99')

    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '3')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(await listAdjustments()).toEqual([])
  })
})
