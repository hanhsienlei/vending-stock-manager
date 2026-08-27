import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { ItemListScreen } from './ItemListScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('ItemListScreen', () => {
  it('offers the starter catalogue only while the catalogue is empty', async () => {
    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

    expect(
      await screen.findByRole('button', { name: 'Load starter catalogue' }),
    ).toBeInTheDocument()
  })

  it('hides the starter catalogue button once an item exists', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

    await screen.findByText('Coke')
    expect(
      screen.queryByRole('button', { name: 'Load starter catalogue' }),
    ).not.toBeInTheDocument()
  })

  it('seeds the full catalogue on tap and then hides its own button', async () => {
    const user = userEvent.setup()
    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

    await user.click(
      await screen.findByRole('button', { name: 'Load starter catalogue' }),
    )

    expect(await screen.findAllByRole('listitem')).toHaveLength(60)
    expect(
      screen.queryByRole('button', { name: 'Load starter catalogue' }),
    ).not.toBeInTheDocument()
  })

  it('shows the remark when the item has one', async () => {
    await saveItem({
      name: 'Red Bull Energy Drink',
      price: 5.5,
      basePar: 5,
      boxSize: 1,
      remark: 'Size on the stock sheet is unverified',
    })

    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

    expect(
      await screen.findByText('Size on the stock sheet is unverified'),
    ).toBeInTheDocument()
  })

  it('renders an item with no remark without error', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

    expect(await screen.findByText('Coke')).toBeInTheDocument()
  })

  it('shows the size when the item has one', async () => {
    await saveItem({
      name: 'Coke',
      price: 4.5,
      basePar: 8,
      boxSize: 24,
      size: '375ml',
    })

    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

    expect(await screen.findByText(/375ml/)).toBeInTheDocument()
  })

  it('renders an item with no size without error', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

    expect(await screen.findByText('Coke')).toBeInTheDocument()
  })
})
