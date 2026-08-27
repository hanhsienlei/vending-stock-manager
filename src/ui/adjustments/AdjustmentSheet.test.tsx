import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { listAdjustments } from '../../data/repositories/adjustments'
import { ADJUSTMENT_REASONS } from '../../domain/adjustments'
import { AdjustmentSheet } from './AdjustmentSheet'

/** Lets one test force the rejection `recordTransfer` really throws, without
 * taking the real write away from every other test in this file. */
const transferStub = vi.hoisted(() => ({ fail: false }))

vi.mock('../../data/repositories/adjustments', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../data/repositories/adjustments')>()
  return {
    ...actual,
    recordTransfer: (params: Parameters<typeof actual.recordTransfer>[0]) => {
      if (transferStub.fail) {
        return Promise.reject(
          new Error('A transfer must not start and end at the same location'),
        )
      }
      return actual.recordTransfer(params)
    },
  }
})

beforeEach(async () => {
  transferStub.fail = false
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

  // Fix round 1, finding 1: `reasonSpec('miscount').totalStock` is
  // 'unchanged', not 'decrease', so `totalStock === 'increase' ? + : -`
  // always signed a miscount negative — an operator who counted MORE than
  // was recorded could never say so. A miscount now asks for a direction.
  it('records a miscount in the "more than recorded" direction as a positive movement', async () => {
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

    await user.selectOptions(screen.getByLabelText('Reason'), 'miscount')
    await user.selectOptions(
      await screen.findByLabelText('Correction direction'),
      'more',
    )
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '2')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(async () => {
      expect((await listAdjustments())[0]?.units).toBe(2)
    })
  })

  it('records a miscount in the "fewer than recorded" direction as a negative movement', async () => {
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

    await user.selectOptions(screen.getByLabelText('Reason'), 'miscount')
    await user.selectOptions(
      await screen.findByLabelText('Correction direction'),
      'fewer',
    )
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '2')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(async () => {
      expect((await listAdjustments())[0]?.units).toBe(-2)
    })
  })

  it('does not show a correction direction for reasons other than miscount', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })

    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }}
        itemId={coke.id}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    // Default reason is 'expired'.
    expect(screen.queryByLabelText('Correction direction')).not.toBeInTheDocument()
  })

  // Fix round 1, finding 2: units are discrete packets, so a fractional
  // quantity must be refused with the same alert as zero or a blank field.
  it('refuses a fractional quantity rather than writing a fractional movement', async () => {
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
    await user.type(screen.getByLabelText('Quantity'), '1.5')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(await listAdjustments()).toEqual([])
  })

  // Fix round 1, finding 2: the storeroom screen needs a narrower reason
  // list (no miscount — see StoreroomScreen.test.tsx), reached via a new
  // `reasons` prop rather than a hard-coded list duplicated at the call
  // site. The slot-row path (SlotEditSheet) passes nothing, so it must keep
  // getting the full list — guarded here.
  it('offers the full reason list by default, unaffected by the new prop', async () => {
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

    const options = within(screen.getByLabelText('Reason')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Move to another machine or the storeroom',
      'Expired',
      'Damaged or broken',
      'Missing or taken',
      'Delivery arrived',
      'Miscount correction',
    ])
  })

  it('offers only the reasons passed in when a narrower list is given', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })

    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }}
        itemId={coke.id}
        reasons={ADJUSTMENT_REASONS.filter((r) => r.reason !== 'miscount')}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const options = within(screen.getByLabelText('Reason')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).not.toContain('Miscount correction')
  })
  // The storeroom screen offers `transfer`, and "Storeroom G" was the
  // Destination select's first option — so the form's initial state was
  // storeroom-to-storeroom, which `recordTransfer` refuses. Nothing stopped
  // the operator submitting it.
  it('does not offer the storeroom as the destination of a transfer out of the storeroom', async () => {
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
    const destination = await screen.findByLabelText('Destination')
    await waitFor(() => {
      expect(within(destination).queryByRole('option', { name: 'Storeroom G' }))
        .not.toBeInTheDocument()
    })
    // …and it starts on a destination that can actually receive the stock.
    expect((destination as HTMLSelectElement).value).toBe(l7.id)
  })

  // `record()` had no try/catch and the onClick discarded the rejection, so a
  // refused write left the sheet open, the alert empty and nothing recorded —
  // indistinguishable from a dead button. Every other failure here sets
  // `error`.
  it('surfaces a rejected write rather than failing silently', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const onSaved = vi.fn()
    transferStub.fail = true

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
    await user.type(slotField, '58')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('A transfer must not start and end at the same location')
    expect(onSaved).not.toHaveBeenCalled()
    expect(await listAdjustments()).toEqual([])
  })
})
