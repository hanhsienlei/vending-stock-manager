import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  storeroom: 100, total: 107, full: 75, balance: 32,
}]

describe('StockMatrix', () => {
  it('renders a column per machine, plus GF and Total', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.getByRole('columnheader', { name: '2' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '7' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'GF' })).toBeInTheDocument()
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
    expect(screen.queryByRole('columnheader', { name: 'Storeroom' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'LG' })).not.toBeInTheDocument()
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

  // Both states are supported, and both must keep being covered: D7 fills the
  // column from the suggestion, with a toggle that hands it back to the pen.
  it('leaves an Order column blank for hand-writing when no suggestion is passed', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.getByRole('columnheader', { name: 'Order' })).toBeInTheDocument()
    expect(screen.getByLabelText('order for 58')).toBeEmptyDOMElement()
  })

  it('prints the suggested order when one is passed', () => {
    render(
      <StockMatrix
        rows={ROWS}
        machines={MACHINES}
        orderByItem={new Map([['coke', '2 \u00d7 24']])}
      />,
    )

    expect(screen.getByLabelText('order for 58')).toHaveTextContent('2 \u00d7 24')
  })

  // An item the app has no rate for is not given a zero: the cell stays blank
  // and stays the operator's, which is what it has always been.
  it('leaves the cell blank for an item the suggestion has no figure for', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} orderByItem={new Map()} />)

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
  it('truncates an item name longer than 26 characters, keeping the full name reachable', () => {
    const longName = 'Jim Beam White Label Bourbon Whiskey & Cola 4.8% (Cube)'
    const rows: MatrixRow[] = [{ ...ROWS[0], itemName: longName }]
    render(<StockMatrix rows={rows} machines={MACHINES} />)

    const cell = screen.getByLabelText('item for 58')
    expect(cell.textContent).toMatch(/^.{1,27}$/)
    expect(cell.textContent).not.toBe(longName)
    expect(cell).toHaveAttribute('title', longName)
  })

  it('leaves a short name exactly as it is', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.getByLabelText('item for 58')).toHaveTextContent('Coke')
  })

  // Regular weight is what buys the extra characters: lighter glyphs are
  // narrower, so the same column holds 26 of a real product name instead of
  // 18. A bold name would undo the width this change exists to win back.
  it('sets item names in regular weight, not bold', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    const cell = screen.getByLabelText('item for 58')
    expect(cell.className).toContain('font-normal')
    expect(cell.className).not.toMatch(/font-(semibold|bold|extrabold)/)
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

  // Filling it does not take it off the operator: the accent header and the
  // tinted cell stay, because the figure is still theirs to overrule.
  it('keeps the accent header and tint once the column is filled', () => {
    render(
      <StockMatrix
        rows={ROWS}
        machines={MACHINES}
        orderByItem={new Map([['coke', '48']])}
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'Order' }).className)
      .toContain('text-accent')
    expect(screen.getByLabelText('order for 58').className).toContain('bg-accent-100')
  })

  it('separates the summary columns from the machine block', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    expect(screen.getByRole('columnheader', { name: 'GF' }).className)
      .toContain('border-l-2')
  })

  it('says what the Order column is for', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    expect(screen.getByText(/Order stays blank for your pen/)).toBeInTheDocument()
    expect(screen.queryByText(/Phase 3/)).not.toBeInTheDocument()
  })

  it('says where the figure came from once it is filled', () => {
    render(
      <StockMatrix
        rows={ROWS}
        machines={MACHINES}
        orderByItem={new Map([['coke', '2 \u00d7 24']])}
      />,
    )

    expect(screen.getByText(/Order is the suggestion below/)).toBeInTheDocument()
  })

  it('carries no rounded corner and no legacy palette class', () => {
    const { container } = render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })

  // The Order column was sized at 38px when it was blank by design — "room
  // for a pen stroke", per the comment in the colgroup. Filling it (task 17)
  // made that width wrong without anyone noticing: `1 × 21` wrapped onto two
  // lines and the header clipped, which the operator reported as a broken
  // table. The widest cell the formatter can emit is a three-digit box count
  // against a three-digit carton, so the column has to hold `100 × 200` on
  // one line.
  it('gives Order room for a filled figure, on one line', () => {
    const { container } = render(
      <StockMatrix
        rows={ROWS}
        machines={MACHINES}
        orderByItem={new Map([[ROWS[0].itemId, '100 × 200']])}
      />,
    )

    const cols = container.querySelectorAll('colgroup col')
    const orderCol = cols[cols.length - 1] as HTMLElement
    expect(parseInt(orderCol.style.width, 10)).toBeGreaterThanOrEqual(72)

    const cell = screen.getByLabelText(`order for ${ROWS[0].key}`)
    expect(cell.className).toContain('whitespace-nowrap')
  })
})

// The sheet is sixty rows on one screen, and the operator asked for the same
// tray sections the item list and the storeroom now have. A table cannot hold
// a `<section>`, so the sections are one `<tbody>` per tray with the shared
// `SectionBar` inside a `<th colSpan>` — which is what keeps the columns
// aligned and the frozen header working.
describe('StockMatrix — tray sections', () => {
  const TRAY_ROWS: MatrixRow[] = [
    {
      key: '34', itemId: 'boost', itemName: 'Boost', boxSize: 30,
      perMachine: new Map([['m2', 1], ['m7', 2]]), storeroom: 5, total: 8,
      full: 10, balance: -2,
    },
    {
      key: '36', itemId: 'mars', itemName: 'Mars', boxSize: 30,
      perMachine: new Map([['m2', 1], ['m7', 2]]), storeroom: 5, total: 8,
      full: 10, balance: -2,
    },
    {
      key: '58, 59', itemId: 'coke', itemName: 'Coke', boxSize: 24,
      perMachine: new Map([['m2', 3], ['m7', 4]]), storeroom: 100, total: 107,
      full: 20, balance: 87,
    },
  ]

  it('heads each tray with its own section bar', () => {
    render(<StockMatrix rows={TRAY_ROWS} machines={MACHINES} />)

    expect(screen.getByRole('button', { name: /TRAY 3 · CHOCOLATE/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /TRAY 5 · CANS/ })).toBeInTheDocument()
  })

  it('spans the whole table with the bar, so no column is displaced by it', () => {
    const { container } = render(<StockMatrix rows={TRAY_ROWS} machines={MACHINES} />)

    const columns = container.querySelectorAll('colgroup col').length
    const bar = container.querySelector('tbody th')
    expect(bar?.getAttribute('colspan')).toBe(String(columns))
  })

  it('folds a tray away and says how many rows it is holding', async () => {
    const user = userEvent.setup()
    render(<StockMatrix rows={TRAY_ROWS} machines={MACHINES} />)

    await user.click(screen.getByRole('button', { name: /TRAY 3 · CHOCOLATE/ }))

    expect(screen.queryByLabelText('stock row 34')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('stock row 36')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /TRAY 3 · CHOCOLATE/ }))
      .toHaveTextContent('2 hidden')
    expect(screen.getByLabelText('stock row 58, 59')).toBeInTheDocument()
  })

  // The header is the only thing naming twenty-two columns of bare figures.
  // Sections must not cost it: it stays in the `<thead>`, above every
  // `<tbody>`.
  it('leaves the frozen header alone', () => {
    render(<StockMatrix rows={TRAY_ROWS} machines={MACHINES} />)

    const head = screen.getByRole('columnheader', { name: 'Slot' })
    expect(head.className).toContain('sticky')
    expect(head.closest('thead')).not.toBeNull()
  })

  it('keeps a row whose locator cannot be read as a slot', () => {
    const odd: MatrixRow[] = [{ ...TRAY_ROWS[0], key: '', itemId: 'odd' }]
    render(<StockMatrix rows={odd} machines={MACHINES} />)

    expect(screen.getByText('Boost')).toBeInTheDocument()
  })
})

// The operator's own pair, added 2026-09-23. `Full` is what the estate holds
// with every slot at par; `Balance` is the gap to it. They sit between Total
// and Order because they are read together with Total and they are what the
// order is argued from.
describe('StockMatrix — full and balance', () => {
  it('heads and fills both columns, between Total and Order', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.getByRole('columnheader', { name: 'Full' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Balance' })).toBeInTheDocument()
    expect(screen.getByLabelText('full for 58')).toHaveTextContent('75')
    expect(screen.getByLabelText('balance for 58')).toHaveTextContent('32')

    // Scoped to the header row: each tray's fold bar is a `<th colSpan>` and
    // therefore also a columnheader, so an unscoped query picks those up too.
    const headRow = screen.getAllByRole('row')[0]
    const heads = within(headRow).getAllByRole('columnheader').map((h) => h.textContent)
    expect(heads.slice(-3)).toEqual(['Full', 'Balance', 'Order'])
  })

  // Short is the direction that costs money, so it is the one that gets the
  // accent. A surplus is just a number.
  it('marks a negative balance, and leaves a positive one plain', () => {
    const short = [{ ...ROWS[0], key: '12', total: 58, full: 75, balance: -17 }]
    const { rerender } = render(<StockMatrix rows={short} machines={MACHINES} />)
    expect(screen.getByLabelText('balance for 12').className).toContain('text-accent-700')

    rerender(<StockMatrix rows={ROWS} machines={MACHINES} />)
    expect(screen.getByLabelText('balance for 58').className).not.toContain('text-accent-700')
  })
})

// The floor was written as a literal `min-w-[722px]` with a comment claiming
// it was "the sum of the column widths below". It stopped being that twice
// without anyone noticing — once when Order went 38px → 72px, again when Full
// and Balance added 106px — and the table then rendered narrower than its own
// columns, which `table-fixed` resolves by squashing every figure. This pins
// the invariant instead of the number.
describe('StockMatrix — the width floor tracks the columns', () => {
  it('sets a minimum width equal to the sum of its column widths', () => {
    const { container } = render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    const cols = [...container.querySelectorAll('colgroup col')] as HTMLElement[]
    const declared = cols.reduce((sum, col) => sum + parseInt(col.style.width, 10), 0)

    const table = container.querySelector('table') as HTMLElement
    expect(parseInt(table.style.minWidth, 10)).toBe(declared)
  })

  // Every machine adds a column, so the floor cannot be a constant either.
  it('grows the floor with the machine count', () => {
    const two = render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    const narrow = parseInt(
      (two.container.querySelector('table') as HTMLElement).style.minWidth, 10)
    two.unmount()

    const many = render(
      <StockMatrix
        rows={ROWS}
        machines={[...MACHINES, { id: 'm9', label: 'L9', level: 9, updatedAt: 1 }]}
      />,
    )
    const wide = parseInt(
      (many.container.querySelector('table') as HTMLElement).style.minWidth, 10)

    expect(wide).toBeGreaterThan(narrow)
  })
})
