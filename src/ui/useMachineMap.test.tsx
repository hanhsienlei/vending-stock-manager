import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { saveItem } from '../data/repositories/items'
import { saveMachine } from '../data/repositories/machines'
import { setPlacement } from '../data/repositories/placements'
import { useMachineMap } from './useMachineMap'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('useMachineMap', () => {
  it('resolves the map for one machine, honouring overrides', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const l5 = await saveMachine({ label: 'Lift lobby', level: 5 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })

    await setPlacement(coke.id, { kind: 'base' }, [58, 59])
    await setPlacement(coke.id, { kind: 'machine', machineId: l5.id }, [57])

    const l7Hook = renderHook(() => useMachineMap(l7.id))
    await waitFor(() => expect(l7Hook.result.current.loading).toBe(false))
    expect(l7Hook.result.current.map.map((s) => s.slotNumber)).toEqual([58, 59])

    const l5Hook = renderHook(() => useMachineMap(l5.id))
    await waitFor(() => expect(l5Hook.result.current.loading).toBe(false))
    expect(l5Hook.result.current.map.map((s) => s.slotNumber)).toEqual([57])
  })

  it('exposes items by id for rendering names', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])

    const { result } = renderHook(() => useMachineMap(l7.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items.get(coke.id)?.name).toBe('Coke')
  })
})
