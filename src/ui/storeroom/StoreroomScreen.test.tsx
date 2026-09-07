import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { setStoreroomBalance, listStoreroomBalances } from '../../data/repositories/storeroom'
import { recordAdjustment } from '../../data/repositories/adjustments'
import { setPlacement } from '../../data/repositories/placements'
import { exportBundle } from '../../backup/export'
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
    expect(await screen.findByText('LEDGER · 0 OF 2 VERIFIED')).toBeInTheDocument()

    const input = await screen.findByLabelText('Coke units')
    await user.clear(input)
    await user.type(input, '5')

    await waitFor(() => {
      expect(screen.getByText('LEDGER · 1 OF 2 VERIFIED')).toBeInTheDocument()
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
      await user.click(await screen.findByRole('button', { name: 'Delivery arrived' }))
      await user.clear(screen.getByLabelText('Units'))
      await user.type(screen.getByLabelText('Units'), '24')
      await user.click(screen.getByRole('button', { name: 'Record delivery' }))

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
      expect(await screen.findByLabelText('Units')).toBeInTheDocument()

      await user.click(screen.getByLabelText('Close adjustment sheet'))
      await waitFor(() => {
        expect(screen.queryByLabelText('Units')).not.toBeInTheDocument()
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

      await screen.findByLabelText('Units')
      expect(screen.queryByRole('button', { name: 'Miscount correction' }))
        .not.toBeInTheDocument()
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

  // The operator asked for the item list's view here too: the same tray
  // sections, in the same slot order, folding the same way. The shelves have
  // no tray structure of their own, but the *stock* does — an item belongs to
  // the slot it fills — and the storeroom is picked against the machine.
  describe('the tray sections', () => {
    it('groups the shelf by tray, in slot order', async () => {
      const mars = await saveItem({ name: 'Mars', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(mars.id, { kind: 'base' }, [36])
      const twix = await saveItem({ name: 'Twix', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(twix.id, { kind: 'base' }, [30])
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 1 })
      await setPlacement(coke.id, { kind: 'base' }, [58])

      render(<StoreroomScreen />)
      await screen.findByText('Mars')

      expect(screen.getByRole('button', { name: /TRAY 3 · CHOCOLATE/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /TRAY 5 · CANS/ })).toBeInTheDocument()
      expect(screen.getAllByRole('listitem').map((li) => li.textContent))
        .toEqual([
          expect.stringMatching(/^Twix/),
          expect.stringMatching(/^Mars/),
          expect.stringMatching(/^Coke/),
        ])
    })

    it('names the slot the item fills, so the order it is in reads as an order', async () => {
      const mars = await saveItem({ name: 'Mars', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(mars.id, { kind: 'base' }, [36])

      render(<StoreroomScreen />)

      expect(await screen.findByTestId('storeroom-row-Mars')).toHaveTextContent('36')
    })

    it('keeps an item with no slot at all, under an unplaced section', async () => {
      await saveItem({ name: 'Orphan Item', price: 3, basePar: 5, boxSize: 1 })

      render(<StoreroomScreen />)

      expect(await screen.findByText('Orphan Item')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /UNPLACED/ })).toBeInTheDocument()
    })

    it('folds a tray away and says how many rows it is holding', async () => {
      const user = userEvent.setup()
      const mars = await saveItem({ name: 'Mars', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(mars.id, { kind: 'base' }, [36])
      const twix = await saveItem({ name: 'Twix', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(twix.id, { kind: 'base' }, [30])

      render(<StoreroomScreen />)
      await screen.findByText('Mars')

      await user.click(screen.getByRole('button', { name: /TRAY 3 · CHOCOLATE/ }))

      expect(screen.queryByText('Mars')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /TRAY 3 · CHOCOLATE/ }))
        .toHaveTextContent('2 hidden')
    })

    it('leaves the backup block at the foot whatever is folded', async () => {
      const user = userEvent.setup()
      const mars = await saveItem({ name: 'Mars', price: 3, basePar: 5, boxSize: 1 })
      await setPlacement(mars.id, { kind: 'base' }, [36])

      render(<StoreroomScreen />)
      await screen.findByText('Mars')

      await user.click(screen.getByRole('button', { name: /TRAY 3 · CHOCOLATE/ }))

      expect(screen.getByRole('button', { name: /Export a backup/ })).toBeInTheDocument()
      expect(screen.getByText('Restore from a backup')).toBeInTheDocument()
    })
  })

  // Item 10, fix-plan 2026-08-27: 60 catalogue items in one flat list with no
  // way to filter — the same problem the item list had (commit f9e90a7).
  // Search came first; the tray sections above joined it later, at the
  // operator's request.
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
      expect(await screen.findByText('LEDGER · 1 OF 2 VERIFIED')).toBeInTheDocument()

      await user.type(screen.getByRole('searchbox', { name: /search/i }), 'fan')

      // Fanta (the only row still visible) is itself uncounted, so a total
      // computed off the filtered subset would misreport "0 / 1" here.
      expect(screen.queryByText('Coke')).not.toBeInTheDocument()
      expect(screen.getByText('LEDGER · 1 OF 2 VERIFIED')).toBeInTheDocument()
    })
  })
})

describe('StoreroomScreen — §8 layout', () => {
  it('names the two figures as columns', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<StoreroomScreen />)
    await screen.findByText('Coke')

    const header = screen.getByTestId('storeroom-column-header')
    expect(header).toHaveTextContent(/Item/i)
    expect(header).toHaveTextContent(/App\s*estimate/i)
    expect(header).toHaveTextContent(/Your\s*count/i)
  })

  it('marks a never-verified row with the accent inset', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<StoreroomScreen />)
    const row = await screen.findByTestId('storeroom-row-Coke')

    expect(row.className).toContain('shadow-[inset_4px_0_0_var(--color-accent)]')
    expect(screen.getByText('Never verified')).toBeInTheDocument()
  })

  it('drops the inset once a count has been typed', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<StoreroomScreen />)
    await screen.findByText('Coke')

    const field = screen.getByLabelText('Coke units')
    await user.clear(field)
    await user.type(field, '12')

    await waitFor(() => {
      expect(screen.getByTestId('storeroom-row-Coke').className)
        .not.toContain('shadow-[inset_4px_0_0_var(--color-accent)]')
    })
    expect(screen.queryByText('Never verified')).not.toBeInTheDocument()
  })

  it('states what the app estimate is', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<StoreroomScreen />)
    await screen.findByText('Coke')
    expect(screen.getByText(/your last count plus every delivery/i)).toBeInTheDocument()
  })

  it('carries no rounded corner and no legacy palette class', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    const { container } = render(<StoreroomScreen />)
    await screen.findByText('Coke')
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})

/** The boxes+loose control is two inputs plus a `×200 +` separator — about
 * 108px — and it lived in an 88px column. `justify-end` spilled the excess
 * leftwards, so the boxes input rendered UNDER the `APP ESTIMATE` heading,
 * overlapping the estimate figure by 12px. Measured in a real browser at
 * 393px: header column 219-281, boxes input 269-303.
 *
 * Nobody saw it until now because the column was sized when every item was
 * seeded `boxSize: 1` and the control was a single field. Backfilling the
 * real carton sizes flipped 46 of 60 items into the two-field form, and the
 * layout had never been checked against it.
 *
 * jsdom has no layout, so the column widths are asserted here and the actual
 * geometry is verified in a browser. */
describe('StoreroomScreen — the boxes+loose control has to fit its column', () => {
  it('gives the count column room for two fields and the multiplier', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    render(<StoreroomScreen />)
    await screen.findByText('Coke')

    const header = screen.getByTestId('storeroom-column-header')
    // 112px holds 34 + 4 + 32 + 4 + 34. The estimate column gives up the
    // width; it only ever holds a figure.
    expect(header.className).toContain('grid-cols-[1fr_44px_112px]')
  })

  it('still renders both fields for an item with a real carton size', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    render(<StoreroomScreen />)
    await screen.findByText('Coke')

    expect(screen.getByLabelText('Coke boxes')).toBeInTheDocument()
    expect(screen.getByLabelText('Coke loose')).toBeInTheDocument()
    expect(screen.getByText(/×24/)).toBeInTheDocument()
  })

  it('keeps one plain field for an item whose carton size is unknown', async () => {
    await saveItem({ name: 'Tampon', price: 3, basePar: 5, boxSize: 1 })
    render(<StoreroomScreen />)
    await screen.findByText('Tampon')

    expect(screen.getByLabelText('Tampon units')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tampon boxes')).not.toBeInTheDocument()
  })
})

/** The backup export (design §14). Schema v4 is a one-way door for the app
 * bundle — a reverted build cannot open a database a newer build upgraded —
 * and the storeroom screen is where the operator already does desk work at G,
 * so the button lives here rather than behind a settings screen that does not
 * exist.
 *
 * `URL.createObjectURL` is not implemented in jsdom and a real anchor click
 * would try to navigate, so both are stubbed; what is asserted is that the
 * real export ran and produced a named JSON file. */
describe('StoreroomScreen — the backup export', () => {
  const createObjectURL = vi.fn(() => 'blob:bundle')
  const revokeObjectURL = vi.fn()
  let clicked: HTMLAnchorElement | null = null

  beforeEach(() => {
    clicked = null
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    vi.stubGlobal('URL', Object.assign(Object.create(URL), URL, {
      createObjectURL, revokeObjectURL,
    }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked = this
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('offers the export, dated, without spending the screen accent on it', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    render(<StoreroomScreen />)
    await screen.findByText('Coke')

    const button = screen.getByRole('button', { name: /export a backup/i })
    // Dated, so the operator can see which day's data they are about to
    // save without opening the file — the filename carries the same day.
    expect(button).toHaveTextContent(/Export a backup · \d{1,2} \w{3}/)
    // A safety action, not a primary one: this screen's single accent is
    // already spent on the never-verified inset (tokens.md).
    expect(button.className).toContain('text-neutral-700')
    expect(button.className).not.toContain('accent')
  })

  it('downloads every table when tapped', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    render(<StoreroomScreen />)
    await screen.findByText('Coke')

    await user.click(screen.getByRole('button', { name: /export a backup/i }))

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1))
    expect(clicked).not.toBeNull()
    expect(clicked!.download).toMatch(/^vending-stock-manager-\d{4}-\d{2}-\d{2}\.json$/)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:bundle')
  })
})

/** The backup import, beside the export it undoes.
 *
 * Import deletes the database and rebuilds it, so the screen never acts on
 * one tap: picking a file only reads and describes it, and a second,
 * separate tap commits. The pattern is the one `ItemEditScreen` already uses
 * for deleting an item — the destructive action in `accent-700` text, a
 * `Cancel` in neutral beside it — rather than a new one invented here.
 *
 * jsdom has no file picker, so the file is handed to the input directly.
 * Nothing else is stubbed: the import that runs is the real one, against the
 * real fake-indexeddb database. */
describe('StoreroomScreen — restoring a backup', () => {
  /** Whatever is in the database right now, as a file the operator picked. */
  async function backupFile(name = 'backup.json'): Promise<File> {
    const bundle = await exportBundle()
    return new File([JSON.stringify(bundle)], name, { type: 'application/json' })
  }

  it('offers the restore in accent text, because it destroys', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    render(<StoreroomScreen />)
    await screen.findByText('Coke')

    const control = screen.getByText(/restore from a backup/i)
    // tokens.md: a destructive action takes accent-700 as *text*, never an
    // accent fill — the fill is the primary action's.
    expect(control.className).toContain('text-accent-700')
    expect(control.className).not.toContain('bg-accent')
  })

  it('describes the file and waits, rather than restoring on the tap that picks it', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const file = await backupFile()

    // Something else in the database by the time the file is picked.
    await db.items.clear()
    await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })

    render(<StoreroomScreen />)
    await screen.findByText('Fanta')
    await user.upload(screen.getByLabelText(/backup file/i), file)

    expect(await screen.findByText(/backup\.json/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm restore/i })).toBeInTheDocument()
    // Nothing written: the item in the file is still not here, and the item
    // that is here has not been removed.
    expect((await db.items.toArray()).map((i) => i.name)).toEqual(['Fanta'])
  })

  it('replaces the database once the restore is confirmed', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const file = await backupFile()

    await db.items.clear()
    await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })

    render(<StoreroomScreen />)
    await screen.findByText('Fanta')
    await user.upload(screen.getByLabelText(/backup file/i), file)
    await user.click(await screen.findByRole('button', { name: /confirm restore/i }))

    await waitFor(async () => {
      expect((await db.items.toArray()).map((i) => i.name)).toEqual(['Coke'])
    })
    // And the screen is showing the restored data, not the data it was
    // rendered with.
    expect(await screen.findByText('Coke')).toBeInTheDocument()
    expect(screen.queryByText('Fanta')).not.toBeInTheDocument()
  })

  it('leaves everything alone when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const file = await backupFile()

    await db.items.clear()
    await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })

    render(<StoreroomScreen />)
    await screen.findByText('Fanta')
    await user.upload(screen.getByLabelText(/backup file/i), file)
    await user.click(await screen.findByRole('button', { name: /cancel/i }))

    expect((await db.items.toArray()).map((i) => i.name)).toEqual(['Fanta'])
    expect(screen.queryByRole('button', { name: /confirm restore/i })).not.toBeInTheDocument()
    expect(screen.getByText(/restore from a backup/i)).toBeInTheDocument()
  })

  it('refuses a file that is not a backup, and says so without asking to confirm', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })

    render(<StoreroomScreen />)
    await screen.findByText('Fanta')
    // A `.json` file rather than any old file: the input's `accept` keeps
    // the picker to JSON, so the wrong file that actually reaches this code
    // is one that is named like a backup and is not one.
    await user.upload(
      screen.getByLabelText(/backup file/i),
      new File(['shopping list'], 'notes.json', { type: 'application/json' }),
    )

    expect(await screen.findByText(/not a JSON file/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm restore/i })).not.toBeInTheDocument()
    expect((await db.items.toArray()).map((i) => i.name)).toEqual(['Fanta'])
  })

  it('refuses a backup from a newer version of the app, naming both schemas', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    const newer = JSON.stringify({
      schemaVersion: db.verno + 1, exportedAt: Date.now(), tables: { items: [] },
    })

    render(<StoreroomScreen />)
    await screen.findByText('Fanta')
    await user.upload(
      screen.getByLabelText(/backup file/i),
      new File([newer], 'newer.json', { type: 'application/json' }),
    )

    expect(await screen.findByText(/newer version of the app/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm restore/i })).not.toBeInTheDocument()
    expect((await db.items.toArray()).map((i) => i.name)).toEqual(['Fanta'])
  })

  it('says what a backup from an older schema will do before it does it', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Fanta', price: 3.5, basePar: 5, boxSize: 24 })
    const older = JSON.stringify({
      schemaVersion: 2, exportedAt: Date.now(), tables: { items: [], countLines: [] },
    })

    render(<StoreroomScreen />)
    await screen.findByText('Fanta')
    await user.upload(
      screen.getByLabelText(/backup file/i),
      new File([older], 'older.json', { type: 'application/json' }),
    )

    expect(await screen.findByRole('button', { name: /confirm restore/i })).toBeInTheDocument()
    expect(screen.getByText(/older version of the app/i)).toBeInTheDocument()
    expect(screen.getByText(/schema 2/i)).toBeInTheDocument()
  })
})
