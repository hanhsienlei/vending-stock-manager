import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db'
import {
  recordAdjustment, recordTransfer, listAdjustments,
  adjustmentsForMachine, storeroomAdjustments,
} from './adjustments'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('recordAdjustment', () => {
  it('stamps occurredAt from the clock, not from the caller', async () => {
    const before = Date.now()
    const saved = await recordAdjustment({
      itemId: 'coke', locationKind: 'storeroom',
      reason: 'delivery', units: 24,
    })

    expect(saved.occurredAt).toBeGreaterThanOrEqual(before)
    expect(saved.occurredAt).toBeLessThanOrEqual(Date.now())
  })

  it('keeps the sign it was given, so a loss stays negative', async () => {
    await recordAdjustment({
      itemId: 'coke', locationKind: 'machine',
      machineId: 'L7', slotNumber: 58, reason: 'expired', units: -2,
    })

    expect((await listAdjustments())[0].units).toBe(-2)
  })

  it('finds a machine\'s adjustments through the index', async () => {
    await recordAdjustment({
      itemId: 'coke', locationKind: 'machine',
      machineId: 'L7', slotNumber: 58, reason: 'expired', units: -2,
    })
    await recordAdjustment({
      itemId: 'coke', locationKind: 'machine',
      machineId: 'L2', slotNumber: 58, reason: 'expired', units: -1,
    })

    const found = await adjustmentsForMachine('L7')
    expect(found).toHaveLength(1)
    expect(found[0].machineId).toBe('L7')
  })

  it('separates storeroom adjustments from machine ones', async () => {
    await recordAdjustment({
      itemId: 'coke', locationKind: 'storeroom', reason: 'delivery', units: 24,
    })
    await recordAdjustment({
      itemId: 'coke', locationKind: 'machine',
      machineId: 'L7', slotNumber: 58, reason: 'expired', units: -2,
    })

    const storeroom = await storeroomAdjustments()
    expect(storeroom).toHaveLength(1)
    expect(storeroom[0].reason).toBe('delivery')
  })
})

describe('recordTransfer', () => {
  // Spec §5.3: "A transfer is a single action that updates both locations
  // atomically."
  it('writes both sides, opposite signs, sharing a transferId', async () => {
    const [out, into] = await recordTransfer({
      itemId: 'coke',
      units: 3,
      from: { kind: 'machine', machineId: 'L7', slotNumber: 58 },
      to: { kind: 'storeroom' },
    })

    expect(out.units).toBe(-3)
    expect(into.units).toBe(3)
    expect(out.transferId).toBe(into.transferId)
    expect(out.transferId).toBeDefined()
    expect(out.reason).toBe('transfer')
    expect(into.reason).toBe('transfer')
    expect(out.machineId).toBe('L7')
    expect(into.locationKind).toBe('storeroom')
  })

  it('rejects a transfer to the place it came from', async () => {
    await expect(recordTransfer({
      itemId: 'coke',
      units: 3,
      from: { kind: 'machine', machineId: 'L7', slotNumber: 58 },
      to: { kind: 'machine', machineId: 'L7', slotNumber: 58 },
    })).rejects.toThrow(/same location/i)

    expect(await listAdjustments()).toEqual([])
  })

  it('rejects a transfer of zero or fewer units', async () => {
    await expect(recordTransfer({
      itemId: 'coke',
      units: 0,
      from: { kind: 'storeroom' },
      to: { kind: 'machine', machineId: 'L7', slotNumber: 58 },
    })).rejects.toThrow(/at least one unit/i)

    expect(await listAdjustments()).toEqual([])
  })

  // The half-written transfer is the failure that matters: stock that left one
  // place and arrived nowhere silently becomes shrinkage in the residual.
  it('writes neither side when the write fails', async () => {
    const bulkPut = vi.spyOn(db.adjustments, 'bulkPut')
      .mockRejectedValueOnce(new Error('disk full'))

    await expect(recordTransfer({
      itemId: 'coke',
      units: 3,
      from: { kind: 'machine', machineId: 'L7', slotNumber: 58 },
      to: { kind: 'storeroom' },
    })).rejects.toThrow('disk full')

    expect(await listAdjustments()).toEqual([])
    bulkPut.mockRestore()
  })
})
