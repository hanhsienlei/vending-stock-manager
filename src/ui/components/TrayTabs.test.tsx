import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrayTabs } from './TrayTabs'

// §3.7: the tray tabs became the same flush-left underline pattern as the
// main tab bar — the active tray is spelled out (`trayLabel`, e.g. "Tray 1"),
// the rest are bare numerals, exactly like the main bar's active/inactive
// split. devs/debug/tray-name-should-be-tray1-tray2-etc.png was about a
// different, now-superseded rendering where every tab spelled out its name;
// `trayLabel` is still what produces the active tab's text.
describe('TrayTabs', () => {
  it('spells out the active tray and leaves the rest as bare numerals', () => {
    render(
      <TrayTabs
        active={10}
        onSelect={vi.fn()}
        present={new Set([10, 20, 30, 40, 50, 60])}
      />,
    )

    expect(screen.getByRole('button', { name: 'Tray 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '6' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tray 2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument()
  })

  it('only renders tabs for trays actually present', () => {
    render(
      <TrayTabs active={20} onSelect={vi.fn()} present={new Set([20, 40])} />,
    )

    expect(screen.getByRole('button', { name: 'Tray 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tray 1' })).not.toBeInTheDocument()
  })

  it('marks a tab whose tray is complete with a tick', () => {
    render(
      <TrayTabs
        active={30}
        onSelect={vi.fn()}
        present={new Set([10, 20, 30])}
        complete={new Set([10, 20])}
      />,
    )

    expect(screen.getByRole('button', { name: '1 ✓' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2 ✓' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tray 3' })).toBeInTheDocument()
  })

  it('marks the current tray for assistive tech', () => {
    render(
      <TrayTabs active={20} onSelect={vi.fn()} present={new Set([10, 20])} />,
    )

    expect(screen.getByRole('button', { name: 'Tray 2' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: '1' })).not.toHaveAttribute('aria-current')
  })
})
