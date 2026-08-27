import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { setStoreroomBalance, listStoreroomBalances } from '../../data/repositories/storeroom'
import { StoreroomScreen } from './StoreroomScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('StoreroomScreen', () => {
  it('renders every catalogue item', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })

    render(<StoreroomScreen />)

    expect(await screen.findByText('Coke')).toBeInTheDocument()
    expect(await screen.findByText('Fanta')).toBeInTheDocument()
  })

  it('shows an item\'s size when it has one', async () => {
    await saveItem({
      name: 'Coke', price: 4.5, basePar: 8, boxSize: 24, size: '375ml',
    })

    render(<StoreroomScreen />)

    expect(await screen.findByText(/375ml/)).toBeInTheDocument()
  })

  it('pre-fills the last recorded balance, and shows blank state for a never-counted item', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    await setStoreroomBalance(coke.id, 40)

    render(<StoreroomScreen />)

    expect(await screen.findByLabelText('Coke units')).toHaveValue(40)
    expect(await screen.findByLabelText('Fanta units')).toHaveValue(0)
    expect(await screen.findByText(/never verified/i)).toBeInTheDocument()
  })

  it('persists a change immediately, with no Save button', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

    render(<StoreroomScreen />)
    const input = await screen.findByLabelText('Coke units')

    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '42')

    await waitFor(async () => {
      const balances = await listStoreroomBalances()
      expect(balances.find((b) => b.itemId === coke.id)?.units).toBe(42)
    })
  })

  it('updates the same row in place rather than creating a second one on repeated edits', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

    render(<StoreroomScreen />)
    const input = await screen.findByLabelText('Coke units')
    await user.clear(input)
    await user.type(input, '3')
    await waitFor(async () => {
      expect((await listStoreroomBalances()).find((b) => b.itemId === coke.id)?.units).toBe(3)
    })

    await user.clear(input)
    await user.type(input, '9')

    await waitFor(async () => {
      const balances = await listStoreroomBalances()
      expect(balances.filter((b) => b.itemId === coke.id)).toHaveLength(1)
      expect(balances.find((b) => b.itemId === coke.id)?.units).toBe(9)
    })
  })

  it('shows a visible count of distinct items counted', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })

    render(<StoreroomScreen />)
    expect(await screen.findByText('0 / 2 counted')).toBeInTheDocument()

    const input = await screen.findByLabelText('Coke units')
    await user.clear(input)
    await user.type(input, '5')

    await waitFor(() => {
      expect(screen.getByText('1 / 2 counted')).toBeInTheDocument()
    })
  })
})
