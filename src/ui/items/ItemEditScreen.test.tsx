import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { listItems } from '../../data/repositories/items'
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

    const items = await listItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    expect(onDone).toHaveBeenCalled()
  })
})
