import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { listItems, saveItem } from '../../data/repositories/items'
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

  it('places the item into its base slots on save', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<ItemEditScreen onDone={onDone} />)

    await fillRequiredFields(user)
    await user.type(screen.getByLabelText('Slots'), '58, 59')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const [item] = await listItems()
    const placements = await listPlacements()
    expect(effectivePlacement(item.id, 'any-machine', placements)?.slots).toEqual([58, 59])
    expect(placements[0].scope).toEqual({ kind: 'base' })
  })

  it('refuses a slot number outside the machine trays and says which', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<ItemEditScreen onDone={onDone} />)

    await fillRequiredFields(user)
    await user.type(screen.getByLabelText('Slots'), '58, 99')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/99/)).toBeInTheDocument()
    expect(await listItems()).toEqual([])
    expect(onDone).not.toHaveBeenCalled()
  })

  it('loads the existing base slots when editing an item', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [59, 58])

    render(<ItemEditScreen itemId={coke.id} onDone={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText('Slots')).toHaveValue('58, 59'))
  })

  it('un-places an item when its slots are cleared', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [58])

    render(<ItemEditScreen itemId={coke.id} onDone={onDone} />)
    await waitFor(() => expect(screen.getByLabelText('Slots')).toHaveValue('58'))

    await user.clear(screen.getByLabelText('Slots'))
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
    await waitFor(() => expect(screen.getByLabelText('Slots')).toHaveValue(''))

    await user.type(screen.getByLabelText('Slots'), '52')
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
    await waitFor(() => expect(screen.getByLabelText('Slots')).toHaveValue('52'))

    await user.clear(screen.getByLabelText('Slots'))
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

  it('is not required and an item without one still saves', async () => {
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

  it('leaves a slot nobody stocks yet to seed its capacity from this item', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

    render(<ItemEditScreen itemId={coke.id} onDone={onDone} />)
    await waitFor(() => expect(screen.getByLabelText('Slots')).toHaveValue(''))

    await user.type(screen.getByLabelText('Slots'), '41')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    const [items, placements, configs] = await Promise.all([
      listItems(), listPlacements(), listSlotConfigs(),
    ])
    const slot = resolveMachineMap(l7.id, items, placements, configs)
      .find((s) => s.slotNumber === 41)
    expect(slot?.capacity).toBe(8)
  })
})
