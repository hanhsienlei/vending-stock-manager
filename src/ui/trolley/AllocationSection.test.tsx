import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { slotNeed } from '../../domain/forecast'
import { slotKey } from '../../domain/pick'
import type { SlotNeed } from '../../domain/forecast'
import type { Id, Item } from '../../domain/types'
import { AllocationSection } from './AllocationSection'
import type { TrolleyRow } from './useTrolley'

function item(name: string, id: Id): Item {
  return { id, name, price: 4.5, basePar: 10, boxSize: 24, updatedAt: 0 }
}

interface SlotSpec {
  machineId: Id
  slotNumber: number
  itemId: Id
  need: number
  rate: number | null
  ranDry?: boolean
}

/** One item's row, its slots, and the needs behind them. `lastLevel` is
 * derived from the need so the two agree: a slot of capacity 10 wanting 4 was
 * last at 6, and nothing here depends on a projection. */
function scenario(slots: SlotSpec[], taken: number, levels: Record<string, number>) {
  const needsBySlot = new Map<string, SlotNeed>()
  for (const slot of slots) {
    needsBySlot.set(slotKey(slot.machineId, slot.slotNumber), slotNeed({
      machineId: slot.machineId,
      slotNumber: slot.slotNumber,
      capacity: 10,
      lastLevel: 10 - slot.need,
      rate: slot.rate,
      daysSince: 0,
      ranDryLastPeriod: slot.ranDry ?? false,
    }))
  }

  const coke = item('Coke', 'coke')
  const rows: TrolleyRow[] = [{
    item: coke,
    needed: slots.reduce((sum, slot) => sum + slot.need, 0),
    taken,
    noneLeftInG: false,
    slots: slots.map((slot) => ({
      machineId: slot.machineId,
      slotNumber: slot.slotNumber,
      itemId: coke.id,
      units: slot.need,
    })),
    rate: null,
    days: 0,
  }]

  return { rows, needsBySlot, levelOf: new Map(Object.entries(levels)) }
}

describe('AllocationSection', () => {
  it('stays hidden when everything is covered', () => {
    const { rows, needsBySlot, levelOf } = scenario([
      { machineId: 'm2', slotNumber: 58, itemId: 'coke', need: 4, rate: 1 },
      { machineId: 'm7', slotNumber: 58, itemId: 'coke', need: 4, rate: 2 },
    ], 24, { m2: 2, m7: 7 })

    render(
      <AllocationSection rows={rows} needsBySlot={needsBySlot} levelOf={levelOf} />,
    )

    // Design §12.2: revealed only when something is short. A trade-off that
    // does not exist is not worth a band across the screen.
    expect(screen.queryByText(/short/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/cut line/i)).not.toBeInTheDocument()
  })

  it('draws the cut line where the trolley runs out', async () => {
    const user = userEvent.setup()
    const { rows, needsBySlot, levelOf } = scenario([
      { machineId: 'm2', slotNumber: 58, itemId: 'coke', need: 4, rate: 3 },
      { machineId: 'm7', slotNumber: 58, itemId: 'coke', need: 4, rate: 2 },
      { machineId: 'm11', slotNumber: 58, itemId: 'coke', need: 4, rate: 1 },
    ], 6, { m2: 2, m7: 7, m11: 11 })

    render(
      <AllocationSection rows={rows} needsBySlot={needsBySlot} levelOf={levelOf} />,
    )

    expect(screen.getByText(/1 item short — 2 slots go without/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /see who/i }))

    // Six units against three slots wanting four each: L2 is filled, L7 gets
    // the two that are left, L11 gets nothing. The cut goes above L7 — the
    // first slot that is not served in full — because the bar says nothing
    // below it is covered, and L7 is not.
    expect(screen.getAllByTestId(/^allocation-/).map((el) => el.dataset.testid))
      .toEqual([
        'allocation-slot-2-58',
        'allocation-cut-line',
        'allocation-slot-7-58',
        'allocation-slot-11-58',
      ])
    expect(screen.getByTestId('allocation-slot-2-58')).toHaveTextContent('4')
    expect(screen.getByTestId('allocation-slot-7-58')).toHaveTextContent('2')
    expect(screen.getByTestId('allocation-slot-11-58')).toHaveTextContent('0')
  })

  it('puts a slot that ran dry above a slot with a higher rate', async () => {
    const user = userEvent.setup()
    const { rows, needsBySlot, levelOf } = scenario([
      { machineId: 'm2', slotNumber: 58, itemId: 'coke', need: 4, rate: 4 },
      { machineId: 'm11', slotNumber: 58, itemId: 'coke', need: 4, rate: 1, ranDry: true },
    ], 4, { m2: 2, m11: 11 })

    render(
      <AllocationSection rows={rows} needsBySlot={needsBySlot} levelOf={levelOf} />,
    )
    await user.click(screen.getByRole('button', { name: /see who/i }))

    // Spec §6.2's first rule: proven unmet demand outranks a higher rate that
    // was being met. L11 sold out last period; L2 sells four a day and did
    // not, so it is the one that waits.
    expect(screen.getAllByTestId(/^allocation-slot/).map((el) => el.dataset.testid))
      .toEqual(['allocation-slot-11-58', 'allocation-slot-2-58'])
    expect(screen.getByTestId('allocation-slot-11-58')).toHaveTextContent('4')
    expect(screen.getByTestId('allocation-slot-2-58')).toHaveTextContent('0')
  })
})
