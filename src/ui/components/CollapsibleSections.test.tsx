import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionBar, useCollapsedSections } from './CollapsibleSections'

// The one collapsible-section control, used by the item list, the storeroom,
// the stock matrix and a run's receipt. Every screen groups by tray, so the
// bar has to read the same on all four — and it has to keep saying what is
// inside a section that is shut, or a collapsed tray reads as an empty one.
describe('SectionBar', () => {
  it('names the section and reports itself open', () => {
    render(
      <SectionBar heading="TRAY 3 · CHOCOLATE" open count={10} onToggle={vi.fn()} />,
    )

    const bar = screen.getByRole('button', { name: /TRAY 3 · CHOCOLATE/ })
    expect(bar).toHaveAttribute('aria-expanded', 'true')
    expect(bar).not.toHaveTextContent(/hidden/)
  })

  it('says how many rows a shut section is holding', () => {
    render(
      <SectionBar
        heading="TRAY 3 · CHOCOLATE" open={false} count={10} onToggle={vi.fn()}
      />,
    )

    const bar = screen.getByRole('button', { name: /TRAY 3 · CHOCOLATE/ })
    expect(bar).toHaveAttribute('aria-expanded', 'false')
    expect(bar).toHaveTextContent('10 hidden')
  })

  it('reports one hidden row in the singular', () => {
    render(
      <SectionBar heading="TRAY 1 · CHIPS" open={false} count={1} onToggle={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: /TRAY 1 · CHIPS/ }))
      .toHaveTextContent('1 hidden')
  })

  it('toggles on tap', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <SectionBar heading="TRAY 1 · CHIPS" open count={3} onToggle={onToggle} />,
    )

    await user.click(screen.getByRole('button', { name: /TRAY 1 · CHIPS/ }))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  // 393px is the phone. A bar that overflows takes the whole screen sideways
  // with it, and a long heading beside a count is exactly where that starts.
  it('keeps a long heading inside the row rather than pushing the count off', () => {
    render(
      <SectionBar
        heading="TRAY 4 · JUICE, ENERGY AND WATER, THE LONG WAY"
        open={false}
        count={12}
        onToggle={vi.fn()}
      />,
    )

    const bar = screen.getByRole('button', { name: /TRAY 4/ })
    expect(bar.className).toContain('w-full')
    expect(bar.querySelector('.truncate')).not.toBeNull()
  })

  // The stock matrix's bar is as wide as the table — 722px at its narrowest,
  // against a 393px phone. Anything aligned to the right of that bar is off
  // the side of the screen, so nothing is: the heading, the count and the
  // marker pack to the left, and the heading takes its own width rather than
  // stretching to fill the bar.
  it('packs the count and the marker against the heading, not the right edge', () => {
    render(
      <SectionBar heading="TRAY 1 · CHIPS" open={false} count={4} onToggle={vi.fn()} />,
    )

    const heading = screen.getByText('TRAY 1 · CHIPS')
    expect(heading.className).not.toContain('flex-1')
    expect(heading.className).not.toContain('grow')
  })
})

function Harness({ keys }: { keys: string[] }) {
  const sections = useCollapsedSections('vsm.test.collapsed')
  return (
    <>
      {keys.map((key) => (
        <div key={key}>
          <SectionBar
            heading={key}
            open={sections.isOpen(key)}
            count={2}
            onToggle={() => sections.toggle(key)}
          />
          {sections.isOpen(key) && <p>{key} body</p>}
        </div>
      ))}
    </>
  )
}

describe('useCollapsedSections', () => {
  // This environment's `window.localStorage` is an object with no methods on
  // it, so every read and write here takes the caught path — the same one a
  // private-mode Safari takes. The sections must still work.
  it('starts every section open', () => {
    render(<Harness keys={['A', 'B']} />)

    expect(screen.getByText('A body')).toBeInTheDocument()
    expect(screen.getByText('B body')).toBeInTheDocument()
  })

  it('shuts and reopens one section without touching its neighbour', async () => {
    const user = userEvent.setup()
    render(<Harness keys={['A', 'B']} />)

    await user.click(screen.getByRole('button', { name: /A/ }))
    expect(screen.queryByText('A body')).not.toBeInTheDocument()
    expect(screen.getByText('B body')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /A/ }))
    expect(screen.getByText('A body')).toBeInTheDocument()
  })
})
