import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../../data/db'
import { saveMachine } from '../../data/repositories/machines'
import { MachineMapScreen } from './MachineMapScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('MachineMapScreen', () => {
  // Fifteen near-identical maps and the header was just "← Back"
  // (devs/debug/machine-page-should-show-level-number.png). Nothing said
  // which one was open.
  it("shows the machine's level in the header", async () => {
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })

    render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)

    expect(await screen.findByText('L7')).toBeInTheDocument()
  })

  // Same duplicate the list screen had (devs/debug/machine-list-page-no-
  // need-location.png): the seed writes "Level 7" as the label, which just
  // restates the "L7" chip right next to it.
  it("hides a label in the header that just restates the level", async () => {
    const l2 = await saveMachine({ label: 'Level 2', level: 2 })

    render(<MachineMapScreen machine={l2} onBack={vi.fn()} />)
    await screen.findByText('L2')

    expect(screen.queryByText('Level 2')).not.toBeInTheDocument()
  })
})
