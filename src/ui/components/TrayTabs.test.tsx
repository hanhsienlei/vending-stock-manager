import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrayTabs } from './TrayTabs'

// devs/debug/tray-name-should-be-tray1-tray2-etc.png: the counting screen's
// tray tabs still read the raw slot-number prefixes (10 20 30 40 50 60)
// instead of Tray 1..6. `trayLabel` (src/domain/trays.ts) already exists and
// its own docstring claims this component uses it — it fell between two
// agents' scopes and was never wired in here.
describe('TrayTabs', () => {
  it('labels each tab Tray 1..6, not the raw slot-number prefix', () => {
    render(
      <TrayTabs
        active={10}
        onSelect={vi.fn()}
        present={new Set([10, 20, 30, 40, 50, 60])}
      />,
    )

    expect(screen.getByRole('button', { name: 'Tray 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tray 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tray 6' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '10' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '60' })).not.toBeInTheDocument()
  })

  it('only renders tabs for trays actually present, still labelled', () => {
    render(
      <TrayTabs active={20} onSelect={vi.fn()} present={new Set([20, 40])} />,
    )

    expect(screen.getByRole('button', { name: 'Tray 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tray 4' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tray 1' })).not.toBeInTheDocument()
  })
})
