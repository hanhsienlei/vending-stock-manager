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
})
