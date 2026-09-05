import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { listStoreroomBalances, setStoreroomBalance } from '../../data/repositories/storeroom'
import { storeroomAdjustments } from '../../data/repositories/adjustments'
import { listTrolleyLines } from '../../data/repositories/trolley'
import { ledgerBalance, storeroomMovements } from '../../domain/storeroom'
import type { Adjustment, Id, Item, StoreroomBalance, TrolleyLine } from '../../domain/types'

/** Same shape as `useCounting`: local state per keystroke, committed
 * optimistically and persisted behind it, rolled back on a rejected write.
 * No Save step (spec §8.1, §8.5).
 *
 * `units`/`verifiedAt` back the manual-count input, which stays the
 * anchor-setting control. `onHand` is the separate, ledger-derived figure
 * (spec §6.5): the anchor plus every storeroom movement logged since — since
 * Phase 3, trolley loads and returns as well as adjustments, normalised by
 * `storeroomMovements` and summed by `ledgerBalance`, which keeps one
 * implementation of the arithmetic (design §3.5). Never a stocktake in its
 * own right. `refresh` re-runs
 * the same load and is exposed for the adjustment sheet (design §7.1,
 * fix round 1, finding 2): recording an adjustment there does not touch
 * this hook's state on its own, so the screen calls `refresh` once the
 * sheet reports a save. */
export function useStoreroom() {
  const [items, setItems] = useState<Item[]>([])
  const [units, setUnitsState] = useState<Map<Id, number>>(new Map())
  const [verifiedAt, setVerifiedAtState] = useState<Map<Id, number>>(new Map())
  const [anchors, setAnchors] = useState<Map<Id, StoreroomBalance>>(new Map())
  const [movements, setMovements] = useState<Map<Id, Adjustment[]>>(new Map())
  const [trolley, setTrolley] = useState<Map<Id, TrolleyLine[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    const [loadedItems, balances, adjustments, trolleyLines] = await Promise.all([
      listItems(), listStoreroomBalances(), storeroomAdjustments(), listTrolleyLines(),
    ])
    if (!mountedRef.current) return

    const movementsByItem = new Map<Id, Adjustment[]>()
    for (const adjustment of adjustments) {
      const existing = movementsByItem.get(adjustment.itemId)
      if (existing) existing.push(adjustment)
      else movementsByItem.set(adjustment.itemId, [adjustment])
    }

    // Every run's lines, not just today's: `ledgerBalance` decides what the
    // anchor has already superseded, and a load from three weeks ago is still
    // a movement if nobody has counted the shelf since.
    const trolleyByItem = new Map<Id, TrolleyLine[]>()
    for (const line of trolleyLines) {
      const existing = trolleyByItem.get(line.itemId)
      if (existing) existing.push(line)
      else trolleyByItem.set(line.itemId, [line])
    }

    setItems(loadedItems)
    setUnitsState(new Map(balances.map((b) => [b.itemId, b.units])))
    setVerifiedAtState(new Map(balances.map((b) => [b.itemId, b.verifiedAt])))
    setAnchors(new Map(balances.map((b) => [b.itemId, b])))
    setMovements(movementsByItem)
    setTrolley(trolleyByItem)
    setLoading(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true

    load().catch((err) => {
      if (mountedRef.current) throw err
    })

    return () => {
      mountedRef.current = false
    }
  }, [load])

  const onHand = useMemo(() => {
    const result = new Map<Id, number>()
    for (const item of items) {
      result.set(item.id, ledgerBalance(
        anchors.get(item.id),
        storeroomMovements(movements.get(item.id) ?? [], trolley.get(item.id) ?? []),
      ))
    }
    return result
  }, [items, anchors, movements, trolley])

  const setUnits = useCallback(
    async (itemId: Id, qty: number) => {
      const prevUnits = units
      const prevVerifiedAt = verifiedAt
      const prevAnchors = anchors

      setUnitsState(new Map(units).set(itemId, qty))

      try {
        const saved = await setStoreroomBalance(itemId, qty)
        setVerifiedAtState((current) => new Map(current).set(itemId, saved.verifiedAt))
        setAnchors((current) => new Map(current).set(itemId, saved))
      } catch (err) {
        setUnitsState(prevUnits)
        setVerifiedAtState(prevVerifiedAt)
        setAnchors(prevAnchors)
        throw err
      }
    },
    [units, verifiedAt, anchors],
  )

  return { items, units, verifiedAt, onHand, loading, setUnits, refresh: load }
}
