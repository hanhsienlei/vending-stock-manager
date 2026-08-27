import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { setPlacement } from '../../data/repositories/placements'
import * as seedRepo from '../../data/repositories/seed'
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

  // Review defect #1's belt-and-braces: the real fix is that seedStarterCatalogue
  // is now one atomic transaction (see seed.test.ts), but the button must also
  // not sit there enabled through ~135 writes inviting a second tap. The seed
  // call is mocked and held open here so the assertion does not depend on how
  // fast the real writes happen to be.
  it('disables the button the instant it is tapped, before the write settles', async () => {
    const user = userEvent.setup()
    let resolveSeed!: (value: boolean) => void
    const held = new Promise<boolean>((resolve) => {
      resolveSeed = resolve
    })
    const spy = vi.spyOn(seedRepo, 'seedStarterCatalogue').mockReturnValue(held)

    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)
    const button = await screen.findByRole('button', { name: 'Load starter catalogue' })
    await user.click(button)

    // The mocked write is still in flight — nothing has resolved it yet —
    // and the button must already refuse a second tap.
    expect(button).toBeDisabled()
    expect(spy).toHaveBeenCalledTimes(1)

    resolveSeed(true)
    await waitFor(() => expect(button).not.toBeDisabled())
    spy.mockRestore()
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

  // Sixty items in one flat alphabetical list, no way to find one
  // (devs/debug/should-separate-items-by-category-or-tray-for-easy-search.png).
  // Operator decision: group by tray — derivable today from base
  // placements, no schema change — plus a search box.
  describe('grouping by tray', () => {
    it('groups items under Tray 1..Tray 6, not Tray 10..Tray 60', async () => {
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      await setPlacement(coke.id, { kind: 'base' }, [58, 59])
      const chips = await saveItem({ name: 'Chips', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(chips.id, { kind: 'base' }, [10])

      render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

      expect(await screen.findByText('Tray 5')).toBeInTheDocument()
      expect(await screen.findByText('Tray 1')).toBeInTheDocument()
      expect(screen.queryByText('Tray 50')).not.toBeInTheDocument()
      expect(screen.queryByText('Tray 10')).not.toBeInTheDocument()
    })

    it('lists an item under every tray it is placed across', async () => {
      // A slot list spanning two trays is unusual but the data can do it —
      // handle it rather than assume one tray per item.
      const spanning = await saveItem({
        name: 'Spanning Item', price: 3, basePar: 5, boxSize: 1,
      })
      await setPlacement(spanning.id, { kind: 'base' }, [14, 20])

      render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

      const tray1 = (await screen.findByText('Tray 1')).closest('section')
      const tray2 = (await screen.findByText('Tray 2')).closest('section')
      expect(tray1).toHaveTextContent('Spanning Item')
      expect(tray2).toHaveTextContent('Spanning Item')
    })

    it('still shows an item with no placement at all, under an unplaced group', async () => {
      await saveItem({ name: 'Orphan Item', price: 3, basePar: 5, boxSize: 1 })

      render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

      expect(await screen.findByText('Orphan Item')).toBeInTheDocument()
    })
  })

  describe('search', () => {
    it('filters the list by name', async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      await setPlacement(coke.id, { kind: 'base' }, [58])
      const fanta = await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
      await setPlacement(fanta.id, { kind: 'base' }, [52])

      render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)
      await screen.findByText('Coke')

      await user.type(screen.getByRole('searchbox', { name: /search/i }), 'fan')

      expect(screen.queryByText('Coke')).not.toBeInTheDocument()
      expect(screen.getByText('Fanta')).toBeInTheDocument()
    })

    it('is case-insensitive', async () => {
      const user = userEvent.setup()
      await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

      render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)
      await screen.findByText('Coke')

      await user.type(screen.getByRole('searchbox', { name: /search/i }), 'COKE')

      expect(screen.getByText('Coke')).toBeInTheDocument()
    })
  })
})
