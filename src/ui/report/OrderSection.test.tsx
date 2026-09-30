import { describe, it, expect, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderSection, useOrderOverrides, type OrderRow } from './OrderSection'

function row(over: Partial<OrderRow> = {}): OrderRow {
  return {
    itemId: 'coke', itemName: 'Coke', boxSize: 24,
    ratePerDay: 3, forecast: 30, onHand: 6, suggested: 24, boxes: 1, units: 24,
    flags: [], ratedSlots: 2, slotCount: 2,
    ...over,
  }
}

function renderSection(over: Partial<Parameters<typeof OrderSection>[0]> = {}) {
  return render(
    <OrderSection
      rows={[row()]}
      horizon={7}
      safety={3}
      filled
      onHorizonChange={() => {}}
      onSafetyChange={() => {}}
      onFilledChange={() => {}}
      {...over}
    />,
  )
}

describe('OrderSection', () => {
  it('states the order in whole boxes where the carton size is known', () => {
    renderSection()

    expect(screen.getByLabelText('order for Coke')).toHaveTextContent('1 × 24')
  })

  it('states it in plain units at box size 1', () => {
    renderSection({
      rows: [row({ boxSize: 1, suggested: 24, boxes: 24, units: 24 })],
    })

    const line = screen.getByLabelText('order for Coke')
    expect(line).toHaveTextContent('24')
    expect(line).not.toHaveTextContent('×')
  })

  // Spec §6.1: "an explainable forecast that is slightly worse beats an opaque
  // one that is slightly better". Every figure on the row has to be checkable
  // by hand, which means the unrounded forecast and the days are printed, not
  // just the answer.
  it('shows the arithmetic behind the figure', () => {
    renderSection()

    const line = screen.getByLabelText('order for Coke')
    expect(line).toHaveTextContent('3')
    expect(line).toHaveTextContent('10 days')
    expect(line).toHaveTextContent('30')
    expect(line).toHaveTextContent('6')
  })

  // A rate needs two clean periods. Most slots do not have them yet, and a
  // zero would read as "the app worked out you need none" — which is exactly
  // the wrong figure §5.2 refuses to print.
  it('says an item has no rate yet rather than printing a zero for it', () => {
    renderSection({
      rows: [row({
        ratePerDay: 0, forecast: 0, suggested: 0, boxes: 0, units: 0,
        ratedSlots: 0, slotCount: 2,
      })],
    })

    const line = screen.getByLabelText('order for Coke')
    expect(line).toHaveTextContent(/no rate yet/i)
    expect(line).not.toHaveTextContent('0 × 24')
  })

  it('says which slots a partly measured rate came from', () => {
    renderSection({ rows: [row({ ratedSlots: 1, slotCount: 3 })] })

    expect(screen.getByLabelText('order for Coke'))
      .toHaveTextContent(/1 of 3 slots/i)
  })

  // Spec §6.4: items whose slots ran dry, and items flagged `None left in G`,
  // are the ones actively costing sales.
  it('marks an item that ran dry, ran out at G, or wanted stock that was not there', () => {
    renderSection({
      rows: [
        row({ flags: ['ran-dry'] }),
        row({ itemId: 'fanta', itemName: 'Fanta', flags: ['none-left'] }),
        row({ itemId: 'solo', itemName: 'Solo', flags: ['unfulfillable'] }),
      ],
    })

    expect(screen.getByLabelText('order for Coke').className)
      .toContain('shadow-[inset_4px_0_0_var(--color-accent)]')
    expect(screen.getByLabelText('order for Coke')).toHaveTextContent(/ran dry/i)
    expect(screen.getByLabelText('order for Fanta')).toHaveTextContent(/none left in g/i)
    expect(screen.getByLabelText('order for Solo')).toHaveTextContent(/none to give/i)
  })

  it('leaves an unflagged row without the inset', () => {
    renderSection()

    expect(screen.getByLabelText('order for Coke').className)
      .not.toContain('shadow-[inset_4px_0_0_var(--color-accent)]')
  })

  it('edits the horizon and the safety days', async () => {
    const user = userEvent.setup()
    const onHorizonChange = vi.fn()
    const onSafetyChange = vi.fn()
    renderSection({ onHorizonChange, onSafetyChange })

    await user.clear(screen.getByLabelText('Horizon'))
    await user.type(screen.getByLabelText('Horizon'), '14')
    expect(onHorizonChange).toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Safety'))
    await user.type(screen.getByLabelText('Safety'), '4')
    expect(onSafetyChange).toHaveBeenCalled()
  })

  // D7: the toggle keeps the paper behaviour one tap away.
  it('offers a toggle that hands the Order column back to the pen', async () => {
    const user = userEvent.setup()
    const onFilledChange = vi.fn()
    renderSection({ onFilledChange })

    const toggle = screen.getByRole('button', { name: /order column/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await user.click(toggle)
    expect(onFilledChange).toHaveBeenCalledWith(false)
  })

  it('says the column is blank while the suggestion is turned off', () => {
    renderSection({ filled: false })

    expect(screen.getByRole('button', { name: /order column/i }))
      .toHaveAttribute('aria-pressed', 'false')
  })

  // The route has six runs across 53 visits: most slots do not yet have the
  // two clean periods a rate needs. That must read as the method working, not
  // as an empty screen.
  it('explains itself when nothing has a rate yet', () => {
    renderSection({ rows: [] })

    expect(screen.getByLabelText('order suggestion'))
      .toHaveTextContent(/two clean periods/i)
  })

  it('carries no rounded corner and no legacy palette class', () => {
    const { container } = renderSection()

    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML)
      .not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})

describe('useOrderOverrides', () => {
  it('records, clears one, and clears all', () => {
    const { result } = renderHook(() => useOrderOverrides())

    act(() => { result.current.setOverride('mars', 2) })
    expect(result.current.overrides.mars).toBe(2)

    act(() => { result.current.setOverride('coke', 4) })
    act(() => { result.current.clearOverride('mars') })
    expect(result.current.overrides.mars).toBeUndefined()
    expect(result.current.overrides.coke).toBe(4)

    act(() => { result.current.clearAll() })
    expect(result.current.overrides).toEqual({})
  })

  // The storage shim on Node 25 has no getItem/setItem at all, and private
  // Safari throws outright. Neither may take the report down.
  //
  // `vi.spyOn(window.localStorage, 'setItem')` cannot attach here: on
  // Node 25 `window.localStorage` is a bare object with no `setItem` to
  // spy on in the first place (that absence is exactly what this test
  // means to cover). `vi.stubGlobal` replaces the whole object instead,
  // which proves the same thing — a `setItem` that throws — on both
  // Node 25 and Node 20 (CI), where the real store's `setItem` works.
  it('survives storage that is absent or throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('denied') },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    })
    const { result } = renderHook(() => useOrderOverrides())
    act(() => { result.current.setOverride('mars', 2) })
    expect(result.current.overrides.mars).toBe(2)   // in memory regardless
    vi.unstubAllGlobals()
  })
})
