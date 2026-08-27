import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { listItems, getItem, saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { listPlacements, setPlacement } from '../../data/repositories/placements'
import { listSlotConfigs } from '../../data/repositories/slotConfigs'
import { effectivePlacement, resolveMachineMap } from '../../domain/placement'
import { ItemEditScreen } from './ItemEditScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('ItemEditScreen', () => {
  it('starts with an empty par and refuses to save', async () => {
    const user = userEvent.setup()
    render(<ItemEditScreen onDone={vi.fn()} />)

    await user.type(screen.getByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price'), '4.50')
    expect(screen.getByLabelText('Par level')).toHaveValue(null)

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    expect(await listItems()).toEqual([])
  })

  it('saves once every required field is set', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<ItemEditScreen onDone={onDone} />)

    await user.type(screen.getByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price'), '4.50')
    await user.type(screen.getByLabelText('Par level'), '8')
    await user.type(screen.getByLabelText('Box size'), '24')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // Saving persists the item and its placement, then reports done.
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const items = await listItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
  })

  /** Spec §4.2: slots are set once from the item and apply to every machine;
   * per-machine exceptions are noted at the machine afterwards. Without this,
   * nothing in the running app ever creates a base placement, and a fresh
   * install renders every machine blank forever. */
  async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price'), '4.50')
    await user.type(screen.getByLabelText('Par level'), '8')
    await user.type(screen.getByLabelText('Box size'), '24')
  }

  /** The Slots field is a toggle per physical slot (fix-plan item 13), so
   * choosing 58 and 59 is two taps rather than typed text. */
  async function pickSlots(
    user: ReturnType<typeof userEvent.setup>,
    ...slots: number[]
  ) {
    for (const slot of slots) {
      await user.click(screen.getByLabelText(`Slot ${slot}`))
    }
  }

  it('places the item into its base slots on save', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<ItemEditScreen onDone={onDone} />)

    await fillRequiredFields(user)
    await pickSlots(user, 58, 59)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const [item] = await listItems()
    const placements = await listPlacements()
    expect(effectivePlacement(item.id, 'any-machine', placements)?.slots).toEqual([58, 59])
    expect(placements[0].scope).toEqual({ kind: 'base' })
  })

  // Replaces `refuses a slot number outside the machine trays and says which`.
  // A picker that only offers the 55 physical slots makes an invalid slot
  // unreachable rather than rejected after the fact, so there is no longer an
  // error message to assert on — the absence of the control is the guarantee.
  it('offers no control at all for a number outside the machine trays', () => {
    render(<ItemEditScreen onDone={vi.fn()} />)

    expect(screen.queryByLabelText('Slot 99')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Slot 9')).not.toBeInTheDocument()
    // The first tray is short: it stops at 14.
    expect(screen.queryByLabelText('Slot 15')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Slot 14')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(55)
  })

  // The regression the fix plan warned a literal single-choice control would
  // cause: three catalogue items legitimately occupy two slots each — Nu Pure
  // Water 48/49, Coke No Sugar 56/57, Coke 58/59.
  it('keeps a second slot selected rather than replacing the first', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<ItemEditScreen onDone={onDone} />)

    await fillRequiredFields(user)
    await pickSlots(user, 48)
    expect(screen.getByLabelText('Slot 48')).toHaveAttribute('aria-pressed', 'true')

    await pickSlots(user, 49)
    expect(screen.getByLabelText('Slot 48')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Slot 49')).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const [item] = await listItems()
    const placements = await listPlacements()
    expect(effectivePlacement(item.id, 'any-machine', placements)?.slots).toEqual([48, 49])
  })

  it('loads the existing base slots when editing an item', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [59, 58])

    render(<ItemEditScreen itemId={coke.id} onDone={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByLabelText('Slot 58')).toHaveAttribute('aria-pressed', 'true')
    })
    expect(screen.getByLabelText('Slot 59')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Slot 57')).toHaveAttribute('aria-pressed', 'false')
  })

  it('un-places an item when its slots are cleared', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [58])

    render(<ItemEditScreen itemId={coke.id} onDone={onDone} />)
    await waitFor(() => {
      expect(screen.getByLabelText('Slot 58')).toHaveAttribute('aria-pressed', 'true')
    })

    // Tapping a selected slot gives it up.
    await pickSlots(user, 58)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const placements = await listPlacements()
    expect(effectivePlacement(coke.id, 'any-machine', placements)?.slots).toEqual([])
  })

  it('keeps every machine capacity when a base placement adds a second item', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    // A base placement lands on all fifteen machines at once, so an unpinned
    // slot moves capacity estate-wide. Coke sorts first alphabetically and
    // pars higher, so slot 52 would deepen from 5 to 8 on every machine.
    const l5 = await saveMachine({ label: 'Lift lobby', level: 5 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

    render(<ItemEditScreen itemId={coke.id} onDone={onDone} />)
    await waitFor(() => {
      expect(screen.getByLabelText('Slot 52')).toHaveAttribute('aria-pressed', 'false')
    })

    await pickSlots(user, 52)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const [items, placements, configs] = await Promise.all([
      listItems(), listPlacements(), listSlotConfigs(),
    ])
    for (const machine of [l5, l7]) {
      const slot = resolveMachineMap(machine.id, items, placements, configs)
        .find((s) => s.slotNumber === 52)
      expect(slot?.capacity).toBe(5)
      expect(slot?.accepts).toEqual([sunkist.id, coke.id])
    }
  })

  it('keeps every machine capacity when a base placement gives up a slot', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    // The mirror of the add direction. Coke sorts first and pars higher, so
    // slot 52 derives capacity 8 while both are in it; dropping Coke would
    // re-derive it from Sunkist and shallow the slot to 5 on every machine,
    // and Fill would then under-fill a channel that holds 8.
    const l5 = await saveMachine({ label: 'Lift lobby', level: 5 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const sunkist = await saveItem({ name: 'Sunkist', price: 3.5, basePar: 5, boxSize: 24 })
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    await setPlacement(coke.id, { kind: 'base' }, [52])

    render(<ItemEditScreen itemId={coke.id} onDone={onDone} />)
    await waitFor(() => {
      expect(screen.getByLabelText('Slot 52')).toHaveAttribute('aria-pressed', 'true')
    })

    await pickSlots(user, 52)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const [items, placements, configs] = await Promise.all([
      listItems(), listPlacements(), listSlotConfigs(),
    ])
    for (const machine of [l5, l7]) {
      const slot = resolveMachineMap(machine.id, items, placements, configs)
        .find((s) => s.slotNumber === 52)
      expect(slot?.capacity).toBe(8)
      expect(slot?.accepts).toEqual([sunkist.id])
    }
  })

  it('remark is not required and an item without one still saves', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<ItemEditScreen onDone={onDone} />)

    await fillRequiredFields(user)
    expect(screen.getByLabelText('Remark')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const [item] = await listItems()
    expect(item.remark).toBeUndefined()
  })

  it('round-trips a remark: saved, then reloaded for editing', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<ItemEditScreen onDone={onDone} />)

    await fillRequiredFields(user)
    await user.type(
      screen.getByLabelText('Remark'),
      'Size on the stock sheet is unverified',
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const [item] = await listItems()
    expect(item.remark).toBe('Size on the stock sheet is unverified')

    render(<ItemEditScreen itemId={item.id} onDone={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getAllByLabelText('Remark')[1]).toHaveValue(
        'Size on the stock sheet is unverified',
      ),
    )
  })

  it('size is not required and an item without one still saves', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<ItemEditScreen onDone={onDone} />)

    await fillRequiredFields(user)
    expect(screen.getByLabelText('Size')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const [item] = await listItems()
    expect(item.size).toBeUndefined()
  })

  it('round-trips a size: saved, then reloaded for editing', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<ItemEditScreen onDone={onDone} />)

    await fillRequiredFields(user)
    await user.type(screen.getByLabelText('Size'), '375ml')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const [item] = await listItems()
    expect(item.size).toBe('375ml')

    render(<ItemEditScreen itemId={item.id} onDone={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getAllByLabelText('Size')[1]).toHaveValue('375ml'),
    )
  })

  it('leaves a slot nobody stocks yet to seed its capacity from this item', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

    render(<ItemEditScreen itemId={coke.id} onDone={onDone} />)
    await waitFor(() => {
      expect(screen.getByLabelText('Slot 41')).toHaveAttribute('aria-pressed', 'false')
    })

    await pickSlots(user, 41)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const [items, placements, configs] = await Promise.all([
      listItems(), listPlacements(), listSlotConfigs(),
    ])
    const slot = resolveMachineMap(l7.id, items, placements, configs)
      .find((s) => s.slotNumber === 41)
    expect(slot?.capacity).toBe(8)
  })

  it('offers no delete affordance when creating a new item', async () => {
    render(<ItemEditScreen onDone={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Delete item' })).not.toBeInTheDocument()
  })

  // Destructive, so it needs a second tap to actually fire — a thumb landing
  // on it once while scrolling must not delete anything.
  it('requires a second tap to delete an existing item', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

    render(<ItemEditScreen itemId={coke.id} onDone={onDone} />)
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Coke'))

    await user.click(screen.getByRole('button', { name: 'Delete item' }))
    expect(await getItem(coke.id)).toBeDefined()
    expect(onDone).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(await getItem(coke.id)).toBeUndefined()
  })

  it('lets a delete be cancelled before the second tap', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

    render(<ItemEditScreen itemId={coke.id} onDone={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Coke'))

    await user.click(screen.getByRole('button', { name: 'Delete item' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('button', { name: 'Confirm delete' })).not.toBeInTheDocument()
    expect(await getItem(coke.id)).toBeDefined()
  })
})
