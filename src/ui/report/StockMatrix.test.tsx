import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StockMatrix } from './StockMatrix'
import type { MatrixRow } from '../../domain/stockMatrix'
import type { Machine } from '../../domain/types'

const machines: Machine[] = [
  { id: 'm2', label: 'Gym', level: 2, updatedAt: 1 },
  { id: 'm7', label: 'Lift lobby', level: 7, updatedAt: 1 },
]

const rows: MatrixRow[] = [{
  key: '58', itemId: 'coke', itemName: 'Coke', size: '375ml',
  perMachine: new Map([['m2', 3], ['m7', 4]]),
  storeroom: 100, total: 107,
}]

describe('StockMatrix', () => {
  it('renders a column per machine, plus GF and Total', () => {
    render(<StockMatrix rows={rows} machines={machines} />)

    expect(screen.getByRole('columnheader', { name: 'L2' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'L7' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'GF' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument()
  })

  it('shows the slot as the locator and the size as Qty', () => {
    render(<StockMatrix rows={rows} machines={machines} />)

    const row = screen.getByLabelText('stock row 58')
    expect(row).toHaveTextContent('58')
    expect(row).toHaveTextContent('Coke')
    expect(row).toHaveTextContent('375ml')
  })

  // The toggles are what make a screenshot usable — 60 items by 17 columns is
  // not legible on a phone (design §7.3). They are not optional polish.
  it('hides a machine column when its toggle is turned off', async () => {
    const user = userEvent.setup()
    render(<StockMatrix rows={rows} machines={machines} />)

    await user.click(screen.getByRole('button', { name: 'Hide L2' }))

    expect(screen.queryByRole('columnheader', { name: 'L2' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'L7' })).toBeInTheDocument()
  })

  // Hiding a column changes what is shown, never what is counted.
  it('leaves the total unchanged when a column is hidden', async () => {
    const user = userEvent.setup()
    render(<StockMatrix rows={rows} machines={machines} />)

    await user.click(screen.getByRole('button', { name: 'Hide L2' }))

    expect(screen.getByLabelText('stock row 58')).toHaveTextContent('107')
  })

  it('leaves an Order column blank for hand-writing', () => {
    render(<StockMatrix rows={rows} machines={machines} />)

    expect(screen.getByRole('columnheader', { name: 'Order' })).toBeInTheDocument()
    expect(screen.getByLabelText('order for 58')).toBeEmptyDOMElement()
  })
})
