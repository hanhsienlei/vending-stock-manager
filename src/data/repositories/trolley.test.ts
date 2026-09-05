import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { db } from '../db'
import {
  listTrolleyLines, recordTrolleyLoad, recordTrolleyReturn, trolleyForRun,
} from './trolley'
import { recordAdjustment, storeroomAdjustments } from './adjustments'
import { getStoreroomBalance, setStoreroomBalance } from './storeroom'
import { ledgerBalance, storeroomMovements } from '../../domain/storeroom'
import type { Id } from '../../domain/types'

/** A clock that advances a second per reading, the same device
 * `StoreroomScreen.test.tsx` and `visits.test.ts` use. Without it every write
 * in a test lands in the same millisecond, and `ledgerBalance`'s exact-instant
 * rule then reads a manual count as superseding a load recorded after it —
 * a test artifact, not a behaviour: real seconds pass between typing a count
 * and loading the trolley.
 *
 * It does NOT paper over the case that matters. `recordTrolleyLoad` reads the
 * clock once, so `loadedAt` and the zero anchor's `verifiedAt` are still the
 * same instant to the millisecond, which is exactly what design §3.6 relies
 * on. */
beforeEach(async () => {
  let t = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => (t += 1000))

  await db.delete()
  await db.open()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** The storeroom figure exactly as the screens compute it — the anchor plus
 * every movement since, from both producers. Composed here rather than added
 * to the repository so the test exercises the same path `useStoreroom` does. */
async function balanceOf(itemId: Id): Promise<number> {
  const [anchor, adjustments, lines] = await Promise.all([
    getStoreroomBalance(itemId),
    storeroomAdjustments(),
    listTrolleyLines(),
  ])

  return ledgerBalance(
    anchor,
    storeroomMovements(
      adjustments.filter((a) => a.itemId === itemId),
      lines.filter((l) => l.itemId === itemId),
    ),
  )
}

describe('recordTrolleyLoad', () => {
  it('records what was needed and what was taken', async () => {
    const saved = await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 24, noneLeftInG: false,
    })

    expect(saved).toMatchObject({ runId: 'r1', itemId: 'coke', needed: 18, taken: 24 })
    expect(saved.loadedAt).toBeGreaterThan(0)
    expect(saved.returned).toBeUndefined()
    expect(await trolleyForRun('r1')).toHaveLength(1)
  })

  // Design §5.1: one row per (runId, itemId), upserted. Re-typing the taken
  // figure before leaving G corrects the row rather than appending — the
  // trolley is a working record of the current load, not a ledger.
  it('corrects the existing line rather than appending a second one', async () => {
    const first = await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 24, noneLeftInG: false,
    })
    const second = await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 12, noneLeftInG: false,
    })

    expect(second.id).toBe(first.id)
    const lines = await trolleyForRun('r1')
    expect(lines).toHaveLength(1)
    expect(lines[0].taken).toBe(12)
  })

  it('keeps one run\'s trolley separate from another\'s', async () => {
    await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 24, noneLeftInG: false,
    })
    await recordTrolleyLoad({
      runId: 'r2', itemId: 'coke', needed: 6, taken: 6, noneLeftInG: false,
    })

    expect((await trolleyForRun('r1')).map((l) => l.taken)).toEqual([24])
    expect((await trolleyForRun('r2')).map((l) => l.taken)).toEqual([6])
  })

  it('takes the load off the storeroom balance', async () => {
    await setStoreroomBalance('coke', 40)
    await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 6, noneLeftInG: false,
    })

    expect(await balanceOf('coke')).toBe(34)
  })
})

describe('None left in G', () => {
  // Design §3.6: the flag writes an ordinary manual count of zero, stamped at
  // the same instant as the load, and `ledgerBalance` excludes movements at
  // exactly `verifiedAt` — so the load's own −taken is correctly not applied
  // on top of it.
  it('leaves the balance at zero, not at minus what was taken', async () => {
    await setStoreroomBalance('coke', 40)
    await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 6, noneLeftInG: true,
    })

    expect(await balanceOf('coke')).toBe(0)
  })

  // THE test. Without it, −taken clamped at zero gives the same answer as the
  // correct behaviour; the two only diverge once stock arrives.
  it('and a delivery that afternoon takes it to the delivered figure', async () => {
    await setStoreroomBalance('coke', 40)
    await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 6, noneLeftInG: true,
    })
    await recordAdjustment({
      itemId: 'coke', locationKind: 'storeroom', reason: 'delivery', units: 24,
    })

    expect(await balanceOf('coke')).toBe(24)
  })

  it('stamps the zero anchor at exactly the load\'s own instant', async () => {
    const line = await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 6, noneLeftInG: true,
    })

    const anchor = await getStoreroomBalance('coke')
    expect(anchor?.units).toBe(0)
    expect(anchor?.verifiedAt).toBe(line.loadedAt)
  })

  it('re-anchors the existing balance row rather than adding a second', async () => {
    const before = await setStoreroomBalance('coke', 40)
    await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 6, noneLeftInG: true,
    })

    const balances = await db.storeroomBalances.where('itemId').equals('coke').toArray()
    expect(balances).toHaveLength(1)
    expect(balances[0].id).toBe(before.id)
  })

  it('leaves the balance alone when the flag is not set', async () => {
    const before = await setStoreroomBalance('coke', 40)
    await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 6, noneLeftInG: false,
    })

    expect(await getStoreroomBalance('coke')).toEqual(before)
  })
})

describe('recordTrolleyReturn', () => {
  it('puts what came back onto the balance', async () => {
    await setStoreroomBalance('coke', 40)
    await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 24, noneLeftInG: false,
    })

    const returned = await recordTrolleyReturn('r1', 'coke', 4)

    expect(returned.returned).toBe(4)
    expect(returned.returnedAt).toBeGreaterThanOrEqual(returned.loadedAt)
    expect(await balanceOf('coke')).toBe(20)
  })

  it('refuses a return for an item that was never loaded', async () => {
    await expect(recordTrolleyReturn('r1', 'coke', 4)).rejects.toThrow(/no trolley line/i)
  })

  it('corrects a return that was already recorded', async () => {
    await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 24, noneLeftInG: false,
    })
    await recordTrolleyReturn('r1', 'coke', 4)
    await recordTrolleyReturn('r1', 'coke', 6)

    const lines = await trolleyForRun('r1')
    expect(lines).toHaveLength(1)
    expect(lines[0].returned).toBe(6)
  })
})

describe('listTrolleyLines', () => {
  it('returns every run\'s lines, for the ledger', async () => {
    await recordTrolleyLoad({
      runId: 'r1', itemId: 'coke', needed: 18, taken: 24, noneLeftInG: false,
    })
    await recordTrolleyLoad({
      runId: 'r2', itemId: 'fanta', needed: 6, taken: 6, noneLeftInG: false,
    })

    expect(await listTrolleyLines()).toHaveLength(2)
  })
})
