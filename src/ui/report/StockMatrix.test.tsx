import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StockMatrix } from './StockMatrix'
import type { MatrixRow } from '../../domain/stockMatrix'
import type { Machine } from '../../domain/types'

const MACHINES: Machine[] = [
  { id: 'm2', label: 'Gym', level: 2, updatedAt: 1 },
  { id: 'm7', label: 'Lift lobby', level: 7, updatedAt: 1 },
]

const ROWS: MatrixRow[] = [{
  key: '58', itemId: 'coke', itemName: 'Coke', size: '375ml', boxSize: 24,
  perMachine: new Map([['m2', 3], ['m7', 4]]),
  storeroom: 100, total: 107,
}]

describe('StockMatrix', () => {
  it('renders a column per machine, plus LG and Total', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.getByRole('columnheader', { name: '2' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '7' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'LG' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument()
  })

  // `GF` named the ground-floor storeroom in shorthand the sheet never
  // explained, and `Qty` headed a column that shows a pack size (`375ml`) and
  // never a quantity — the two figures beside it are quantities, which is
  // exactly the confusion §8 removed from the storeroom screen.
  it('heads the pack-size column Size, not Qty', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.getByRole('columnheader', { name: 'Size' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Qty' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'GF' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Storeroom' })).not.toBeInTheDocument()
  })

  it('shows the slot as the locator and the size beside it', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    const row = screen.getByLabelText('stock row 58')
    expect(row).toHaveTextContent('58')
    expect(row).toHaveTextContent('Coke')
    expect(row).toHaveTextContent('375ml')
  })

  // The toggles existed to narrow a table too wide to read. The columns now
  // fit a phone in landscape outright, so the control has nothing left to do
  // and the operator always wants every machine anyway.
  it('offers no machine selector — every machine is always shown', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.queryByRole('button', { name: /Hide|Show/ })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '2' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '7' })).toBeInTheDocument()
  })

  it('leaves an Order column blank for hand-writing', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.getByRole('columnheader', { name: 'Order' })).toBeInTheDocument()
    expect(screen.getByLabelText('order for 58')).toBeEmptyDOMElement()
  })
})

describe('StockMatrix — the paper sheet\'s Package column', () => {
  it('shows the supplier package size', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.getByRole('columnheader', { name: 'Box' })).toBeInTheDocument()
    expect(screen.getByLabelText('box size for 58')).toHaveTextContent('24')
  })

  // `boxSize: 1` is the placeholder every item was seeded with, not a real
  // carton of one. Printing `1` would claim a size the catalogue does not
  // know — blank is the honest reading.
  it('leaves the cell blank for an item whose carton size is still unknown', () => {
    const unknown: MatrixRow[] = [{ ...ROWS[0], boxSize: 1 }]
    render(<StockMatrix rows={unknown} machines={MACHINES} />)

    expect(screen.getByLabelText('box size for 58')).toBeEmptyDOMElement()
  })
})

describe('StockMatrix — fitting the columns on a phone in landscape', () => {
  // A full product name pushes the item column so wide that the figures are
  // driven off the right of the screen — the whole point of the table is
  // reading a row across, so the name yields, not the numbers.
  it('truncates an item name longer than 18 characters, keeping the full name reachable', () => {
    const longName = 'Jim Beam White Label Bourbon Whiskey & Cola 4.8% (Cube)'
    const rows: MatrixRow[] = [{ ...ROWS[0], itemName: longName }]
    render(<StockMatrix rows={rows} machines={MACHINES} />)

    const cell = screen.getByLabelText('item for 58')
    expect(cell.textContent).toMatch(/^.{1,19}$/)
    expect(cell.textContent).not.toBe(longName)
    expect(cell).toHaveAttribute('title', longName)
  })

  it('leaves a short name exactly as it is', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.getByLabelText('item for 58')).toHaveTextContent('Coke')
  })

  // 60 rows do not fit a 393px-tall landscape screen, so the body scrolls —
  // and a scrolled table whose header has left the screen is unreadable,
  // because every column but the first two is a bare number.
  it('freezes the header row so a scrolled column is still identifiable', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    const head = screen.getByRole('columnheader', { name: 'Slot' })
    expect(head.className).toContain('sticky')
    expect(head.className).toContain('top-0')
  })

  // The whole point of fixing the widths is that nothing scrolls sideways:
  // a table wider than the screen is what produced the horizontal
  // rubber-band on the phone.
  it('lays the columns out at fixed widths rather than sizing to content', () => {
    const { container } = render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    const table = container.querySelector('table')
    expect(table?.className).toContain('table-fixed')
    expect(table?.className).not.toContain('w-max')
    expect(table?.className).not.toContain('min-w-full')
  })
})

describe('StockMatrix — §11 restyle', () => {
  it('marks Order as the operator column, not the app column', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    const header = screen.getByRole('columnheader', { name: 'Order' })
    expect(header.className).toContain('text-accent')

    const cell = screen.getByLabelText(`order for ${ROWS[0].key}`)
    expect(cell.className).toContain('bg-accent-100')
    expect(cell).toBeEmptyDOMElement()
  })

  it('separates the summary columns from the machine block', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    expect(screen.getByRole('columnheader', { name: 'LG' }).className)
      .toContain('border-l-2')
  })

  it('says what the Order column is for', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    expect(screen.getByText(/Order stays blank for your pen/)).toBeInTheDocument()
  })

  it('carries no rounded corner and no legacy palette class', () => {
    const { container } = render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
