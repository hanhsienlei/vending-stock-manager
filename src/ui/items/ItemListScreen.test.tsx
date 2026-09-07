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

  // §12 shrinks a remark to a short tag (first three words, uppercased);
  // the full remark stays reachable as the tag's accessible name and title
  // rather than as visible prose (see the "§12 layout" describe below).
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
      await screen.findByLabelText('Size on the stock sheet is unverified'),
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
    // §12 names the tray heading with its catalogue category (e.g.
    // "TRAY 5 · CANS"); the assertions below match on that full heading
    // rather than the bare "Tray N" text this screen used to render.
    it('groups items under Tray 1..Tray 6, not Tray 10..Tray 60', async () => {
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      await setPlacement(coke.id, { kind: 'base' }, [58, 59])
      const chips = await saveItem({ name: 'Chips', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(chips.id, { kind: 'base' }, [10])

      render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

      expect(await screen.findByText('TRAY 5 · CANS')).toBeInTheDocument()
      expect(await screen.findByText('TRAY 1 · CHIPS')).toBeInTheDocument()
      expect(screen.queryByText('TRAY 50 · CANS')).not.toBeInTheDocument()
      expect(screen.queryByText('TRAY 10 · CHIPS')).not.toBeInTheDocument()
    })

    it('lists an item under every tray it is placed across', async () => {
      // A slot list spanning two trays is unusual but the data can do it —
      // handle it rather than assume one tray per item.
      const spanning = await saveItem({
        name: 'Spanning Item', price: 3, basePar: 5, boxSize: 1,
      })
      await setPlacement(spanning.id, { kind: 'base' }, [14, 20])

      render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

      const tray1 = (await screen.findByText('TRAY 1 · CHIPS')).closest('section')
      const tray2 = (await screen.findByText('TRAY 2 · SUNDRIES')).closest('section')
      expect(tray1).toHaveTextContent('Spanning Item')
      expect(tray2).toHaveTextContent('Spanning Item')
    })

    it('still shows an item with no placement at all, under an unplaced group', async () => {
      await saveItem({ name: 'Orphan Item', price: 3, basePar: 5, boxSize: 1 })

      render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

      expect(await screen.findByText('Orphan Item')).toBeInTheDocument()
    })
  })

  // The operator's report: TRAY 3 · CHOCOLATE read 34, 33, 39, 30, 38, 36,
  // 32, 35, 31, 37 — which is the names in alphabetical order, and useless
  // for walking a machine top to bottom.
  describe('order within a tray', () => {
    it('lists a tray by slot number, not alphabetically by name', async () => {
      const mars = await saveItem({ name: 'Mars', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(mars.id, { kind: 'base' }, [36])
      const boost = await saveItem({ name: 'Boost', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(boost.id, { kind: 'base' }, [34])
      const twix = await saveItem({ name: 'Twix', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(twix.id, { kind: 'base' }, [30])

      render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)
      await screen.findByText('Mars')

      expect(screen.getAllByRole('listitem').map((li) => li.textContent))
        .toEqual([
          expect.stringMatching(/^30Twix/),
          expect.stringMatching(/^34Boost/),
          expect.stringMatching(/^36Mars/),
        ])
    })

    it('sorts an item spanning several slots by its lowest', async () => {
      const wide = await saveItem({ name: 'Zebra', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(wide.id, { kind: 'base' }, [39, 31])
      const other = await saveItem({ name: 'Apple', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(other.id, { kind: 'base' }, [35])

      render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)
      await screen.findByText('Zebra')

      expect(screen.getAllByRole('listitem').map((li) => li.textContent))
        .toEqual([
          expect.stringMatching(/^31Zebra/),
          expect.stringMatching(/^35Apple/),
        ])
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

describe('ItemListScreen — §12 layout', () => {
  it('names the tray category in the group bar', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)
    expect(await screen.findByText('TRAY 5 · CANS')).toBeInTheDocument()
  })

  it('shows the base slot, price and par as separate figures', async () => {
    const chips = await saveItem({
      name: 'Salt & Vinegar Chips', price: 3.5, basePar: 5, boxSize: 1, size: '27g',
    })
    await setPlacement(chips.id, { kind: 'base' }, [10])
    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

    const row = await screen.findByTestId(`item-row-${chips.id}`)
    expect(row).toHaveTextContent('10')
    expect(row).toHaveTextContent('27g · box of 1')
    expect(row).toHaveTextContent('$3.50')
    expect(row).toHaveTextContent('par 5')
  })

  it('shows a remark as a short tag, not three lines of prose', async () => {
    const item = await saveItem({
      name: 'Mother Energy Drink', price: 5.5, basePar: 5, boxSize: 1,
      remark: 'size unverified from the photo',
    })
    await setPlacement(item.id, { kind: 'base' }, [44])
    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

    const tag = await screen.findByLabelText('size unverified from the photo')
    expect(tag.className).toContain('bg-accent-200')
    expect(tag).toHaveTextContent('SIZE UNVERIFIED FROM')
  })

  it('carries no rounded corner and no legacy palette class', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    const { container } = render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)
    await screen.findByText('Coke')
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
