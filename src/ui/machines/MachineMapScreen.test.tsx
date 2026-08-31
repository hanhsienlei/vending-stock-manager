import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  // tray, and 10/20/… are slot-number prefixes, not tray names. §5 folds the
  // slot range being matched against the physical machine into the same
  // heading (task-7-brief.md's sibling, task-8-brief.md, step 1).
  it('labels tray sections Tray 1..Tray 6, not Tray 10..Tray 60', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])

    render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)

    expect(await screen.findByText(/^TRAY 5 · SLOTS 50–59$/)).toBeInTheDocument()
    expect(screen.queryByText(/TRAY 50/)).not.toBeInTheDocument()
  })

  // task-8-brief.md step 1.
  it('carries the slot range in the tray heading', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [10, 11])

    render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)

    expect(await screen.findByText(/SLOTS 10–14/)).toBeInTheDocument()
  })

  // §5: today an unmapped slot is simply absent from the map, so a hole in
  // the printed layout — a slot the operator can see on the machine but this
  // screen never mentions — is invisible. task-8-brief.md step 1.
  it('shows an unmapped slot as Not stocked rather than omitting it', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [10, 12])

    render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)
    const tray1 = (await screen.findByText(/^TRAY 1 ·/)).closest('section') as HTMLElement

    // Slots 11, 13 and 14 (tray 1's other three) have nothing placed in them.
    expect(await within(tray1).findAllByText('Not stocked')).toHaveLength(3)
  })

  // §5: a mixed slot lists both items stacked in the name cell rather than
  // joined with `/`, which is unreadable at two long names. task-8-brief.md
  // step 1.
  it('stacks a mixed slot rather than joining names with a slash', async () => {
    const sunkist = await saveItem({ name: 'Sunkist', price: 4.5, basePar: 8, boxSize: 24 })
    const fanta = await saveItem({ name: 'Fanta', price: 4.5, basePar: 8, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])
    await setPlacement(fanta.id, { kind: 'base' }, [52])

    render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)

    expect(screen.queryByText(/Sunkist \/ Fanta/)).not.toBeInTheDocument()
    expect(await screen.findByText('Sunkist')).toBeInTheDocument()
    expect(screen.getByText('Fanta')).toBeInTheDocument()
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
      await screen.findByText(/TRAY 5/)

      expect(screen.queryByLabelText('Capacity')).not.toBeInTheDocument()

      await user.click(screen.getByLabelText('Edit slot 58'))

      expect(await screen.findByText('Slot 58')).toBeInTheDocument()
      expect(screen.getByLabelText('Capacity')).toBeInTheDocument()
    })

    // §5 also opens the sheet for a slot with nothing mapped to it yet — the
    // footer legend ("Tap ⋯ on any slot") makes no exception for one that is
    // currently Not stocked.
    it('opens the slot edit sheet from an unmapped, Not stocked slot', async () => {
      const user = userEvent.setup()
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })

      render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)
      await screen.findAllByText('Not stocked')

      await user.click(screen.getByLabelText('Edit slot 10'))

      expect(await screen.findByText('Slot 10')).toBeInTheDocument()
      expect(screen.getByLabelText('Capacity')).toBeInTheDocument()
    })

    // Fix 4, 2026-08-28 whole-branch review: a "Not stocked" slot is
    // fabricated with capacity 0. The field used to pre-fill "0", and Save
    // was always enabled, so tapping Save on it silently did nothing
    // forever (`saveCapacity`'s `< 1` guard is correct and unchanged). The
    // field must start empty and Save must be disabled until a real value
    // is typed.
    it('starts the capacity field empty and Save disabled for a Not stocked slot', async () => {
      const user = userEvent.setup()
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })

      render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)
      await screen.findAllByText('Not stocked')

      await user.click(screen.getByLabelText('Edit slot 10'))

      expect(await screen.findByLabelText('Capacity')).toHaveValue(null)
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    // Caught by running the app, not by the tests above: the sheet is the last
    // thing in the document, so on a fully mapped machine it rendered ~3100px
    // down an 828px viewport. Every assertion still passed — jsdom has no
    // scroll position — while tapping ⋯ on screen looked like it did nothing.
    it('floats the sheet over the map rather than below fifty rows of it', async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      await setPlacement(coke.id, { kind: 'base' }, [58])

      render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)
      await screen.findByText(/TRAY 5/)
      await user.click(screen.getByLabelText('Edit slot 58'))

      const heading = await screen.findByText('Slot 58')
      expect(heading.closest('.fixed')).not.toBeNull()
    })

    // Fix round 1: the wrapper carried `rounded-lg`, the last `rounded-*` left
    // in either file this plan touches. The floating BEHAVIOUR and its
    // rationale comment above stay byte-for-byte — this is only the corner
    // radius, which Radius 0 (a global constraint) still applies to.
    it('keeps the floating sheet square, not rounded', async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      await setPlacement(coke.id, { kind: 'base' }, [58])

      render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)
      await screen.findByText(/TRAY 5/)
      await user.click(screen.getByLabelText('Edit slot 58'))

      const heading = await screen.findByText('Slot 58')
      const backdrop = heading.closest('.fixed') as HTMLElement
      const wrapper = backdrop.firstElementChild as HTMLElement
      expect(wrapper.className).not.toMatch(/rounded/)
    })

    it('closes the sheet when the backdrop is tapped', async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      await setPlacement(coke.id, { kind: 'base' }, [58])

      render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)
      await screen.findByText(/TRAY 5/)
      await user.click(screen.getByLabelText('Edit slot 58'))
      await screen.findByText('Slot 58')

      await user.click(screen.getByLabelText('Close slot editor'))

      await waitFor(() => {
        expect(screen.queryByText('Slot 58')).not.toBeInTheDocument()
      })
    })

    // §5, and the mirror of the new "stacks a mixed slot" test above: adding
    // a second item to a slot from the sheet must show the row stacked, not
    // joined with `/`, once it re-reads from the database.
    it('adds an item to a slot and shows both stacked on the map without a reload', async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      await saveItem({ name: 'Fanta', price: 3.5, basePar: 8, boxSize: 24 })
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      await setPlacement(coke.id, { kind: 'base' }, [58])

      render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)
      await screen.findByText(/TRAY 5/)
      await user.click(screen.getByLabelText('Edit slot 58'))

      await user.click(await screen.findByRole('button', { name: 'Add Fanta' }))

      // The sheet closes and the row re-reads from the database.
      await waitFor(() => {
        expect(screen.queryByText('Coke / Fanta')).not.toBeInTheDocument()
        expect(screen.getByText('Coke')).toBeInTheDocument()
        expect(screen.getByText('Fanta')).toBeInTheDocument()
      })
    })

    it('saves a per-slot capacity override from the map screen', async () => {
      const user = userEvent.setup()
      const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
      const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
      await setPlacement(coke.id, { kind: 'base' }, [58])

      render(<MachineMapScreen machine={l7} onBack={vi.fn()} />)
      const row = (await screen.findByLabelText('Edit slot 58')).closest('li') as HTMLElement
      expect(within(row).getByText('8')).toBeInTheDocument()

      await user.click(within(row).getByLabelText('Edit slot 58'))
      const capacity = await screen.findByLabelText('Capacity')
      await user.clear(capacity)
      await user.type(capacity, '20')
      await user.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(within(row).getByText('20')).toBeInTheDocument()
      })
    })
  })
})
