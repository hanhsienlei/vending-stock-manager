import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { ItemListScreen } from './ItemListScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('ItemListScreen', () => {
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
})
