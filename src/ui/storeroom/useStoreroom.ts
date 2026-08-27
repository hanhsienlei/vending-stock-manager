import { useCallback, useEffect, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { listStoreroomBalances, setStoreroomBalance } from '../../data/repositories/storeroom'
import type { Id, Item } from '../../domain/types'

/** Same shape as `useCounting`: local state per keystroke, committed
 * optimistically and persisted behind it, rolled back on a rejected write.
 * No Save step (spec §8.1, §8.5). */
export function useStoreroom() {
  const [items, setItems] = useState<Item[]>([])
  const [units, setUnitsState] = useState<Map<Id, number>>(new Map())
  const [verifiedAt, setVerifiedAtState] = useState<Map<Id, number>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [loadedItems, balances] = await Promise.all([
        listItems(), listStoreroomBalances(),
      ])
      if (cancelled) return

      setItems(loadedItems)
      setUnitsState(new Map(balances.map((b) => [b.itemId, b.units])))
      setVerifiedAtState(new Map(balances.map((b) => [b.itemId, b.verifiedAt])))
      setLoading(false)
    }

    load().catch((err) => {
      if (!cancelled) throw err
    })

    return () => {
      cancelled = true
    }
  }, [])

  const setUnits = useCallback(
    async (itemId: Id, qty: number) => {
      const prevUnits = units
      const prevVerifiedAt = verifiedAt

      setUnitsState(new Map(units).set(itemId, qty))

      try {
        const saved = await setStoreroomBalance(itemId, qty)
        setVerifiedAtState((current) => new Map(current).set(itemId, saved.verifiedAt))
      } catch (err) {
        setUnitsState(prevUnits)
        setVerifiedAtState(prevVerifiedAt)
        throw err
      }
    },
    [units, verifiedAt],
  )

  return { items, units, verifiedAt, loading, setUnits }
}
