import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { setStoreroomBalance, listStoreroomBalances } from '../../data/repositories/storeroom'
import { recordAdjustment } from '../../data/repositories/adjustments'
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
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 1 })
    await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 1 })
    await setStoreroomBalance(coke.id, 40)

    render(<StoreroomScreen />)

    expect(await screen.findByLabelText('Coke units')).toHaveValue(40)
    expect(await screen.findByLabelText('Fanta units')).toHaveValue(0)
    expect(await screen.findByText(/never verified/i)).toBeInTheDocument()
  })

  it('persists a change immediately, with no Save button', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 1 })

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
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 1 })

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

  // A number input's leading digit sits immediately left of the caret when the
  // field shows "0" for an uncounted item. Without select-on-focus, a tap that
  // lands just left of that zero and a single typed digit appends rather than
  // replaces — "4" becomes "40". Asserting the handler calls `select()` rather
  // than inspecting jsdom's selection state directly: `type="number"` inputs
  // do not reliably support `selectionStart`/`selectionEnd` across browsers
  // (and jsdom's own emulation of that restriction), so a real-selection
  // assertion would be testing jsdom's quirks rather than the fix.
  it('selects the field on focus, so the first keystroke replaces rather than appends', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 1 })

    const selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select').mockImplementation(() => {})

    render(<StoreroomScreen />)
    const input = await screen.findByLabelText('Coke units')
    await user.click(input)

    expect(selectSpy).toHaveBeenCalled()

    selectSpy.mockRestore()
  })

  it('shows a visible count of distinct items counted', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 1 })
    await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 1 })

    render(<StoreroomScreen />)
    expect(await screen.findByText('0 / 2 counted')).toBeInTheDocument()

    const input = await screen.findByLabelText('Coke units')
    await user.clear(input)
    await user.type(input, '5')

    await waitFor(() => {
      expect(screen.getByText('1 / 2 counted')).toBeInTheDocument()
    })
  })

  it('shows a delivery on top of the last counted figure', async () => {
    // Sequential Date.now() calls in this environment can land in the same
    // millisecond, which would make the delivery collide with the count's
    // verifiedAt and get excluded by ledgerBalance's exact-instant rule
    // (spec §6.5 — the count is the later truth only when it strictly is).
    // Pin the clock apart, same pattern as visits.test.ts and
    // useCounting.test.tsx.
    let t = 1_700_000_000_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => (t += 1000))

    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    await setStoreroomBalance(coke.id, 100)
    await recordAdjustment({
      itemId: coke.id, locationKind: 'storeroom', reason: 'delivery', units: 24,
    })

    clock.mockRestore()

    render(<StoreroomScreen />)

    expect(await screen.findByLabelText('Coke on hand')).toHaveTextContent('124')
  })

  // Fix round 1, finding 2: design §7.1 requires the adjustment sheet
  // reachable "from the storeroom screen" too — the slot-row path already
  // existed, this one did not.
  describe('recording an adjustment', () => {
    it("raises the item's on-hand figure when a delivery is recorded from the storeroom screen", async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
      await setStoreroomBalance(coke.id, 100)

      render(<StoreroomScreen />)
      expect(await screen.findByLabelText('Coke on hand')).toHaveTextContent('100')

      await user.click(screen.getByRole('button', { name: 'Adjust Coke' }))
      await user.selectOptions(await screen.findByLabelText('Reason'), 'delivery')
      await user.clear(screen.getByLabelText('Quantity'))
      await user.type(screen.getByLabelText('Quantity'), '24')
      await user.click(screen.getByRole('button', { name: 'Record' }))

      await waitFor(() => {
        expect(screen.getByLabelText('Coke on hand')).toHaveTextContent('124')
      })
    })

    // The same bug found and fixed on the machine map (94cf425): a sheet
    // rendered in document order after the list sits below all sixty
    // catalogue rows, so tapping "Adjust Coke" near the top mounts it several
    // screens below the fold — from the operator's position, a button that
    // does nothing.
    it('floats the adjustment sheet over the list rather than below it', async () => {
      const user = userEvent.setup()
      await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })

      render(<StoreroomScreen />)
      await user.click(await screen.findByRole('button', { name: 'Adjust Coke' }))

      const heading = await screen.findByRole('heading', { name: 'Adjust storeroom stock' })
      const overlay = heading.closest('.fixed')
      expect(overlay).not.toBeNull()
      expect(overlay).toHaveClass('inset-0')
    })

    it('closes the floating sheet when the backdrop is tapped', async () => {
      const user = userEvent.setup()
      await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })

      render(<StoreroomScreen />)
      await user.click(await screen.findByRole('button', { name: 'Adjust Coke' }))
      expect(await screen.findByLabelText('Reason')).toBeInTheDocument()

      await user.click(screen.getByLabelText('Close adjustment sheet'))
      await waitFor(() => {
        expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument()
      })
    })

    // The storeroom's correction mechanism is the manual count above, which
    // resets the ledger anchor directly. A miscount recorded here would be
    // excluded from ledgerBalance (fix round 1, finding 1) and so would
    // silently do nothing — worse than not offering it at all.
    it('does not offer a miscount reason when adjusting from the storeroom', async () => {
      const user = userEvent.setup()
      await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })

      render(<StoreroomScreen />)
      await user.click(await screen.findByRole('button', { name: 'Adjust Coke' }))

      const options = within(await screen.findByLabelText('Reason')).getAllByRole('option')
      expect(options.map((o) => o.textContent)).not.toContain('Miscount correction')
    })
  })

  // Spec §5.4 and design §8: every quantity entered AT THE STOREROOM is boxes
  // + loose with the units computed — "5 boxes + 17 rather than counting to
  // 137". It is the ledger's quantity field, not a separate feature, which is
  // why it is built in rather than retrofitted. Machine screens stay in loose
  // units: a vending slot contains no boxes.
  describe('pack and loose entry', () => {
    // Every seeded item has boxSize 1 today, so this is the case the operator
    // sees now — and a boxes field here would be actively misleading.
    it('stays a plain units field while a box holds one', async () => {
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
      await setStoreroomBalance(coke.id, 137)

      render(<StoreroomScreen />)

      expect(await screen.findByLabelText('Coke units')).toHaveValue(137)
      expect(screen.queryByLabelText('Coke boxes')).not.toBeInTheDocument()
    })

    it('splits the balance into boxes and loose once the item has a real carton size', async () => {
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
      await setStoreroomBalance(coke.id, 137)

      render(<StoreroomScreen />)

      expect(await screen.findByLabelText('Coke boxes')).toHaveValue(5)
      expect(screen.getByLabelText('Coke loose')).toHaveValue(17)
      expect(screen.queryByLabelText('Coke units')).not.toBeInTheDocument()
    })

    it('records the computed unit total when a box count is entered', async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
      await setStoreroomBalance(coke.id, 137)

      render(<StoreroomScreen />)
      const boxes = await screen.findByLabelText('Coke boxes')
      await user.clear(boxes)
      await user.type(boxes, '6')

      // 6 × 24 + 17, computed rather than counted.
      await waitFor(async () => {
        const [balance] = await listStoreroomBalances()
        expect(balance.units).toBe(161)
      })
    })

    it('records the computed unit total when a loose count is entered', async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
      await setStoreroomBalance(coke.id, 137)

      render(<StoreroomScreen />)
      const loose = await screen.findByLabelText('Coke loose')
      await user.clear(loose)
      await user.type(loose, '3')

      await waitFor(async () => {
        const [balance] = await listStoreroomBalances()
        expect(balance.units).toBe(123)
      })
    })

    it('renders a real multiplication sign between the boxes and loose fields', async () => {
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
      await setStoreroomBalance(coke.id, 137)

      render(<StoreroomScreen />)
      const boxes = await screen.findByLabelText('Coke boxes')
      const row = boxes.closest('.flex')

      // JSX text is not an expression, so an escape written literally
      // as \u00d7 there renders as those six characters rather than
      // the actual glyph -- this is what would have caught that regression.
      expect(row?.textContent).toContain('×')
      expect(row?.textContent).not.toContain('\\u00d7')
    })
  })

  // Item 10, fix-plan 2026-08-27: 60 catalogue items in one flat list with no
  // way to filter — the same problem the item list had (commit f9e90a7),
  // fixed here the same way, not by grouping (this is shelves, not a
  // machine's tray layout — spec §4.1's storeroom has no tray structure to
  // mirror).
  describe('search', () => {
    it('filters the list by name', async () => {
      const user = userEvent.setup()
      await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })

      render(<StoreroomScreen />)
      await screen.findByText('Coke')

      await user.type(screen.getByRole('searchbox', { name: /search/i }), 'fan')

      expect(screen.queryByText('Coke')).not.toBeInTheDocument()
      expect(screen.getByText('Fanta')).toBeInTheDocument()
    })

    it('is case-insensitive', async () => {
      const user = userEvent.setup()
      await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })

      render(<StoreroomScreen />)
      await screen.findByText('Coke')

      await user.type(screen.getByRole('searchbox', { name: /search/i }), 'COKE')

      expect(screen.getByText('Coke')).toBeInTheDocument()
    })

    it('restores the full list when the search is cleared', async () => {
      const user = userEvent.setup()
      await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })

      render(<StoreroomScreen />)
      await screen.findByText('Coke')

      const search = screen.getByRole('searchbox', { name: /search/i })
      await user.type(search, 'fan')
      expect(screen.queryByText('Coke')).not.toBeInTheDocument()

      await user.clear(search)

      expect(screen.getByText('Coke')).toBeInTheDocument()
      expect(screen.getByText('Fanta')).toBeInTheDocument()
    })

    // The one most likely to go wrong: filtering must never change what the
    // header reports as counted, or the operator would think they had
    // counted fewer items than they actually had.
    it("does not change the header's counted total when the list is filtered", async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
      await setStoreroomBalance(coke.id, 40)

      render(<StoreroomScreen />)
      expect(await screen.findByText('1 / 2 counted')).toBeInTheDocument()

      await user.type(screen.getByRole('searchbox', { name: /search/i }), 'fan')

      // Fanta (the only row still visible) is itself uncounted, so a total
      // computed off the filtered subset would misreport "0 / 1" here.
      expect(screen.queryByText('Coke')).not.toBeInTheDocument()
      expect(screen.getByText('1 / 2 counted')).toBeInTheDocument()
    })
  })
})
