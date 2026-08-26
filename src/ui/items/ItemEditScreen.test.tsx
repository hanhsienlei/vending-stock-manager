import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { listItems, saveItem } from '../../data/repositories/items'
import { listPlacements, setPlacement } from '../../data/repositories/placements'
import { effectivePlacement } from '../../domain/placement'
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
})
