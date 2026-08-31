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

    await user.clear(screen.getByLabelText('Units'))
    await user.type(screen.getByLabelText('Units'), '2')
    await user.click(screen.getByRole('button', { name: 'Expired' }))
    await user.click(screen.getByRole('button', { name: 'Record write-off' }))

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

    await user.clear(screen.getByLabelText('Units'))
    await user.type(screen.getByLabelText('Units'), '24')
    await user.click(screen.getByRole('button', { name: 'Delivery arrived' }))
    await user.click(screen.getByRole('button', { name: 'Record delivery' }))

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

    expect(screen.queryByLabelText('To machine')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Move to another machine or the storeroom' }),
    )
    expect(await screen.findByLabelText('To machine')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Units'))
    await user.type(screen.getByLabelText('Units'), '3')
    await user.click(screen.getByRole('button', { name: 'Record move' }))

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

    await user.clear(screen.getByLabelText('Units'))
    await user.type(screen.getByLabelText('Units'), '0')
    await user.click(screen.getByRole('button', { name: 'Record write-off' }))

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

    await user.click(
      screen.getByRole('button', { name: 'Move to another machine or the storeroom' }),
    )
    await user.selectOptions(await screen.findByLabelText('To machine'), l7.id)

    const slotField = await screen.findByLabelText('Into slot')
    await user.clear(slotField)
    await user.type(slotField, '58')

    await user.clear(screen.getByLabelText('Units'))
    await user.type(screen.getByLabelText('Units'), '3')
    await user.click(screen.getByRole('button', { name: 'Record move' }))

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

    await user.click(
      screen.getByRole('button', { name: 'Move to another machine or the storeroom' }),
    )
    await user.selectOptions(await screen.findByLabelText('To machine'), l7.id)

    const slotField = await screen.findByLabelText('Into slot')
    await user.clear(slotField)
    await user.type(slotField, '99')

    await user.clear(screen.getByLabelText('Units'))
    await user.type(screen.getByLabelText('Units'), '3')
    await user.click(screen.getByRole('button', { name: 'Record move' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(await listAdjustments()).toEqual([])
  })

  // Fix round 1, finding 1: `reasonSpec('miscount').totalStock` is
  // 'unchanged', not 'decrease', so `totalStock === 'increase' ? + : -`
  // always signed a miscount negative — an operator who counted MORE than
  // was recorded could never say so. A miscount now asks for a direction.
  //
  // Exercised at the storeroom location rather than a machine slot: since
  // 2026-08-28 (§7) a machine slot's default reason list withholds
  // `miscount` (see "does not offer a miscount correction at a machine
  // slot", below), so the option is unreachable there. The storeroom's
  // default list is still the full table — the storeroom screen narrows it
  // itself, at the call site (StoreroomScreen.test.tsx covers that) — so it
  // remains the place to exercise the sheet's own direction-handling logic
  // for a reason a caller does choose to offer.
  it('records a miscount in the "more than recorded" direction as a positive movement', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Miscount correction' }))
    await user.selectOptions(
      await screen.findByLabelText('Correction direction'),
      'more',
    )
    await user.clear(screen.getByLabelText('Units'))
    await user.type(screen.getByLabelText('Units'), '2')
    await user.click(screen.getByRole('button', { name: 'Record correction' }))

    await waitFor(async () => {
      expect((await listAdjustments())[0]?.units).toBe(2)
    })
  })

  it('records a miscount in the "fewer than recorded" direction as a negative movement', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Miscount correction' }))
    await user.selectOptions(
      await screen.findByLabelText('Correction direction'),
      'fewer',
    )
    await user.clear(screen.getByLabelText('Units'))
    await user.type(screen.getByLabelText('Units'), '2')
    await user.click(screen.getByRole('button', { name: 'Record correction' }))

    await waitFor(async () => {
      expect((await listAdjustments())[0]?.units).toBe(-2)
    })
  })

  // §7, 2026-08-28: a slot miscount is stored and read by nothing (see
  // docs/known-gaps.md) — `entersResidual` already excludes it from the
  // sales residual, it touches no `CountLine`, and no screen reads it back.
  // Withheld at a machine slot to match the storeroom, via the same
  // `entersResidual` filter rather than a special case naming `miscount`
  // (see `SLOT_ADJUSTMENT_REASONS` in AdjustmentSheet.tsx).
  it('does not offer a miscount correction at a machine slot', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })

    render(
      <AdjustmentSheet
        location={{ kind: 'machine', machineId: l7.id, slotNumber: 31 }}
        itemId={coke.id}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByText('Miscount correction')).not.toBeInTheDocument()
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

    await user.clear(screen.getByLabelText('Units'))
    await user.type(screen.getByLabelText('Units'), '1.5')
    await user.click(screen.getByRole('button', { name: 'Record write-off' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(await listAdjustments()).toEqual([])
  })

  // Fix round 1, finding 2 gave the storeroom screen a narrower reason list
  // (no miscount — see StoreroomScreen.test.tsx) via a `reasons` prop rather
  // than a hard-coded list duplicated at the call site. The slot-row path
  // (SlotEditSheet) still passes nothing, but since §7 (2026-08-28) its
  // default is no longer the full table either: withholding `miscount` at a
  // slot could not be done at the SlotEditSheet call site (out of scope for
  // that change), so the sheet's own default now derives a narrower list for
  // a machine location — the same `entersResidual` filter the storeroom
  // already used, not a second hard-coded list.
  it('narrows the default reason list at a machine slot, deriving it rather than hard-coding it', async () => {
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

    for (const label of [
      'Move to another machine or the storeroom',
      'Expired',
      'Damaged or broken',
      'Missing or taken',
      'Delivery arrived',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Miscount correction' }))
      .not.toBeInTheDocument()
  })

  // The storeroom screen passes its own narrower `reasons` explicitly, so
  // this default only ever matters for a caller that does not — but it
  // should still be the full table there, not the slot's narrower one.
  it('still offers the full reason list by default at the storeroom', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })

    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }}
        itemId={coke.id}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    for (const spec of ADJUSTMENT_REASONS) {
      expect(screen.getByRole('button', { name: spec.label })).toBeInTheDocument()
    }
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

    expect(screen.queryByRole('button', { name: 'Miscount correction' }))
      .not.toBeInTheDocument()
  })
  // The storeroom screen offers `transfer`, and "Storeroom G" was the
  // To machine select's first option — so the form's initial state was
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

    await user.click(
      screen.getByRole('button', { name: 'Move to another machine or the storeroom' }),
    )
    const destination = await screen.findByLabelText('To machine')
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

    await user.click(
      screen.getByRole('button', { name: 'Move to another machine or the storeroom' }),
    )
    await user.selectOptions(await screen.findByLabelText('To machine'), l7.id)
    const slotField = await screen.findByLabelText('Into slot')
    await user.clear(slotField)
    await user.type(slotField, '58')
    await user.click(screen.getByRole('button', { name: 'Record move' }))

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('A transfer must not start and end at the same location')
    expect(onSaved).not.toHaveBeenCalled()
    expect(await listAdjustments()).toEqual([])
  })
})

describe('AdjustmentSheet — §7 layout', () => {
  it('offers the reasons as tiles in the domain table order, not a select', async () => {
    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument()

    // The full table at the storeroom default: six reasons, six tiles.
    for (const spec of ADJUSTMENT_REASONS) {
      expect(screen.getByRole('button', { name: spec.label })).toBeInTheDocument()
    }

    // Presence alone doesn't pin ORDER, and a loop keyed off `ADJUSTMENT_REASONS`
    // can't catch a reworded label either — it reads its expectation from the
    // same table the component renders from. §7: "`transfer` is the long one,
    // so it takes the spanning cell rather than the first position — display
    // order is preserved by reading the grid as four then one, not by
    // reordering the table." Pinned as literal strings and scoped to the
    // reason grid alone, so the sheet's commit/Cancel buttons can't sweep in.
    const grid = screen.getByTestId('reason-grid')
    const tileLabels = within(grid).getAllByRole('button').map((b) => b.textContent)
    expect(tileLabels).toEqual([
      'Expired', 'Damaged or broken', 'Missing or taken', 'Delivery arrived',
      'Miscount correction', 'Move to another machine or the storeroom',
    ])
  })

  it('marks the chosen tile as pressed and no other', async () => {
    const user = userEvent.setup()
    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delivery arrived' }))
    expect(screen.getByRole('button', { name: 'Delivery arrived' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Expired' }))
      .toHaveAttribute('aria-pressed', 'false')
  })

  // Ruling 6 (fix round 1): tokens.md's mapping table resolves a legacy
  // primary-action fill to "accent fill, OR ink fill for a selected state" —
  // a chosen reason tile is a selected state, not the sheet's action, so it
  // takes the ink fill (matching SlotEditSheet's Fill toggle) rather than
  // competing with the commit button for the sheet's one accent element
  // (tokens.md:126, "per screen: ink on ground, plus one accent element").
  it('gives the selected tile an ink fill, not accent — the commit button is the one accent element', async () => {
    const user = userEvent.setup()
    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delivery arrived' }))

    const selectedTile = screen.getByRole('button', { name: 'Delivery arrived' })
    expect(selectedTile.className).toContain('bg-ink')
    expect(selectedTile.className).not.toMatch(/\bbg-accent\b/)

    const commitButton = screen.getByRole('button', { name: 'Record delivery' })
    expect(commitButton.className).toMatch(/\bbg-accent\b/)
  })

  it('names the reason on the commit button', async () => {
    const user = userEvent.setup()
    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Record write-off' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delivery arrived' }))
    expect(screen.getByRole('button', { name: 'Record delivery' })).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Move to another machine or the storeroom' }),
    )
    expect(screen.getByRole('button', { name: 'Record move' })).toBeInTheDocument()
  })

  // The new cell. A transfer writes both sides atomically, so both sides are
  // stated before the commit.
  it('states both sides of a transfer before it is committed', async () => {
    const user = userEvent.setup()
    const source = await saveMachine({ label: 'Lift lobby', level: 7 })
    const target = await saveMachine({ label: 'Level 9', level: 9 })

    render(
      <AdjustmentSheet
        location={{ kind: 'machine', machineId: source.id, slotNumber: 31 }}
        itemId="i1" onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Move to another machine or the storeroom' }),
    )
    await waitFor(() => expect(screen.getByLabelText('To machine')).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('To machine'), target.id)
    await user.clear(screen.getByLabelText('Units'))
    await user.type(screen.getByLabelText('Units'), '3')

    const result = screen.getByLabelText('Result')
    expect(result).toHaveTextContent('L7·31 down 3')
    expect(result).toHaveTextContent('L9·31 up 3')
  })

  it('warns on a move that a same-run move is already recorded by the counts', async () => {
    const user = userEvent.setup()
    await saveMachine({ label: 'Level 9', level: 9 })
    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText(/subtracts it twice/)).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Move to another machine or the storeroom' }),
    )
    expect(screen.getByText(/subtracts it twice/)).toBeInTheDocument()
  })

  it('says at the storeroom why miscount is not on offer', () => {
    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        reasons={ADJUSTMENT_REASONS.filter((r) => r.entersResidual)}
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Miscount is not offered here/)).toBeInTheDocument()
  })

  it('carries no rounded corner and no legacy palette class', () => {
    const { container } = render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
