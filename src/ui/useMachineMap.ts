import { useCallback, useEffect, useState } from 'react'
import { listItems } from '../data/repositories/items'
import { listPlacements } from '../data/repositories/placements'
import { listSlotConfigs } from '../data/repositories/slotConfigs'
import { resolveMachineMap } from '../domain/placement'
import type { Id, Item, MachineMap } from '../domain/types'

export function useMachineMap(machineId: Id) {
  const [map, setMap] = useState<MachineMap>([])
  const [items, setItems] = useState<Map<Id, Item>>(new Map())
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [allItems, placements, slotConfigs] = await Promise.all([
      listItems(), listPlacements(), listSlotConfigs(),
    ])
    setItems(new Map(allItems.map((i) => [i.id, i])))
    setMap(resolveMachineMap(machineId, allItems, placements, slotConfigs))
    setLoading(false)
  }, [machineId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { map, items, reload, loading }
}
