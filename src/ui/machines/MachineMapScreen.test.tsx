import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { setPlacement } from '../../data/repositories/placements'
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

  // Same relabelling as the item list (devs/debug/tray-name-should-be-
  // tray1-tray2-etc.png): physically these are the first through sixth
  // tray, and 10/20/… are slot-number prefixes, not tray names.
  it('labels tray sections Tray 1..Tray 6, not Tray 10..Tray 60', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])

    render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)

    expect(await screen.findByText('Tray 5')).toBeInTheDocument()
    expect(screen.queryByText('Tray 50')).not.toBeInTheDocument()
  })

  // Fix-plan item 14. This is *in addition to* correcting the map from the
  // counting screen, never instead of it — spec §5.1 puts correction on the
  // counting screen deliberately, because "a separate admin screen will never
  // get used". The sheet is the same component both paths open.
  describe('editing the map in place', () => {
    it('opens the slot edit sheet from a slot row', async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      await setPlacement(coke.id, { kind: 'base' }, [58])

      render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)
      await screen.findByText('Tray 5')

      expect(screen.queryByLabelText('Capacity')).not.toBeInTheDocument()

      await user.click(screen.getByLabelText('Edit slot 58'))

      expect(await screen.findByText('Slot 58')).toBeInTheDocument()
      expect(screen.getByLabelText('Capacity')).toBeInTheDocument()
    })

    it('adds an item to a slot and shows it on the map without a reload', async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      await saveItem({ name: 'Fanta', price: 3.5, basePar: 8, boxSize: 24 })
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      await setPlacement(coke.id, { kind: 'base' }, [58])

      render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)
      await screen.findByText('Tray 5')
      await user.click(screen.getByLabelText('Edit slot 58'))

      await user.click(await screen.findByText('Add Fanta'))

      // The sheet closes and the row re-reads from the database.
      await waitFor(() => {
        expect(screen.getByText('Coke / Fanta')).toBeInTheDocument()
      })
    })

    it('saves a per-slot capacity override from the map screen', async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      await setPlacement(coke.id, { kind: 'base' }, [58])

      render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)
      await screen.findByText('cap 8')

      await user.click(screen.getByLabelText('Edit slot 58'))
      const capacity = await screen.findByLabelText('Capacity')
      await user.clear(capacity)
      await user.type(capacity, '20')
      await user.click(screen.getByText('Save capacity'))

      await waitFor(() => {
        expect(screen.getByText('cap 20')).toBeInTheDocument()
      })
    })
  })
})
