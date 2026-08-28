import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NavContext, ScreenLayout } from './ScreenLayout'
import { ScreenHeader } from './ScreenHeader'

function renderWith(active: 'machines' | 'items' | 'storeroom' | 'history', go = vi.fn()) {
  render(
    <NavContext.Provider value={{ active, go }}>
      <ScreenLayout header={<ScreenHeader eyebrow="RUN · THU 27 AUG" title="Machines" figure="3 / 15" />}>
        <p>body</p>
      </ScreenLayout>
    </NavContext.Provider>,
  )
  return go
}

describe('ScreenLayout', () => {
  it('renders the eyebrow, the title and the one figure the screen is about', () => {
    renderWith('machines')
    expect(screen.getByText('RUN · THU 27 AUG')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Machines' })).toBeInTheDocument()
    expect(screen.getByText('3 / 15')).toBeInTheDocument()
  })

  it('marks exactly one tab as current', () => {
    renderWith('storeroom')
    expect(screen.getByRole('button', { name: 'Storeroom' })).toHaveAttribute(
      'aria-current', 'page',
    )
    expect(screen.getByRole('button', { name: 'Machines' })).not.toHaveAttribute('aria-current')
  })

  it('navigates on a tab tap', async () => {
    const user = userEvent.setup()
    const go = renderWith('machines')
    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(go).toHaveBeenCalledWith('history')
  })

  it('renders a back affordance instead of an eyebrow on a nested screen', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <NavContext.Provider value={{ active: 'machines', go: vi.fn() }}>
        <ScreenLayout
          header={
            <ScreenHeader
              back={{ label: '← MACHINES', onClick }}
              state="COUNTING"
              title="L7"
              subtitle="Lift lobby"
              figure="22 / 54"
            />
          }
        >
          <p>body</p>
        </ScreenLayout>
      </NavContext.Provider>,
    )
    expect(screen.queryByText('RUN · THU 27 AUG')).not.toBeInTheDocument()
    expect(screen.getByText('COUNTING')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '← MACHINES' }))
    expect(onClick).toHaveBeenCalled()
  })
})
