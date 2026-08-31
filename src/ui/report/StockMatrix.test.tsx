import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StockMatrix } from './StockMatrix'
import type { MatrixRow } from '../../domain/stockMatrix'
import type { Machine } from '../../domain/types'

const MACHINES: Machine[] = [
  { id: 'm2', label: 'Gym', level: 2, updatedAt: 1 },
  { id: 'm7', label: 'Lift lobby', level: 7, updatedAt: 1 },
]

const ROWS: MatrixRow[] = [{
  key: '58', itemId: 'coke', itemName: 'Coke', size: '375ml',
  perMachine: new Map([['m2', 3], ['m7', 4]]),
  storeroom: 100, total: 107,
}]

describe('StockMatrix', () => {
  it('renders a column per machine, plus GF and Total', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.getByRole('columnheader', { name: 'L2' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'L7' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'GF' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument()
  })

  it('shows the slot as the locator and the size as Qty', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    const row = screen.getByLabelText('stock row 58')
    expect(row).toHaveTextContent('58')
    expect(row).toHaveTextContent('Coke')
    expect(row).toHaveTextContent('375ml')
  })

  // The toggles are what make a screenshot usable — 60 items by 17 columns is
  // not legible on a phone (design §7.3). They are not optional polish.
  it('hides a machine column when its toggle is turned off', async () => {
    const user = userEvent.setup()
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    await user.click(screen.getByRole('button', { name: 'Hide L2' }))

    expect(screen.queryByRole('columnheader', { name: 'L2' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'L7' })).toBeInTheDocument()
  })

  // Hiding a column changes what is shown, never what is counted.
  it('leaves the total unchanged when a column is hidden', async () => {
    const user = userEvent.setup()
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    await user.click(screen.getByRole('button', { name: 'Hide L2' }))

    expect(screen.getByLabelText('stock row 58')).toHaveTextContent('107')
  })

  it('leaves an Order column blank for hand-writing', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    expect(screen.getByRole('columnheader', { name: 'Order' })).toBeInTheDocument()
    expect(screen.getByLabelText('order for 58')).toBeEmptyDOMElement()
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

  it('strikes a hidden machine through rather than colouring fifteen chips', async () => {
    const user = userEvent.setup()
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    const toggle = screen.getByRole('button', { name: `Hide L${MACHINES[0].level}` })
    expect(toggle.className).toContain('bg-ink')
    await user.click(toggle)

    const hidden = screen.getByRole('button', { name: `Show L${MACHINES[0].level}` })
    expect(hidden.className).toContain('line-through')
    expect(hidden.className).not.toContain('bg-accent')
  })

  it('separates the summary columns from the machine block', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    expect(screen.getByRole('columnheader', { name: 'GF' }).className)
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
