import { useCallback, useEffect, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { listMachines } from '../../data/repositories/machines'
import { listRuns } from '../../data/repositories/runs'
import { salesForRange, type PeriodReport } from '../../data/repositories/sales'
import { storeroomAdjustments } from '../../data/repositories/adjustments'
import { listStoreroomBalances } from '../../data/repositories/storeroom'
import { historyForMachine } from '../../data/repositories/visits'
import { lastRecordedLevels } from '../../domain/levels'
import { ledgerBalance } from '../../domain/storeroom'
import type { Id, Item, Machine } from '../../domain/types'

export interface ReportData {
  reports: PeriodReport[]
  items: Map<Id, Item>
  machines: Machine[]
  /** Current storeroom units per item — not scoped to the range. */
  storeroomOnHand: Map<Id, number>
  /** Each machine's latest recorded levels — `levelKey(slotNumber, itemId)` to
   * closing units — read from its most recent finalized visit, independent of
   * the selected range. Stock on hand is a current figure, not a period one
   * (design §7.2), so it must not vary with `from`/`to`. Exposed under this
   * name because a later task (the stock matrix) consumes it directly. */
  levelsByMachine: Map<Id, Map<string, number>>
  loading: boolean
}

export function useReport(from: string, to: string) {
  const [data, setData] = useState<ReportData>({
    reports: [], items: new Map(), machines: [],
    storeroomOnHand: new Map(), levelsByMachine: new Map(), loading: true,
  })

  const load = useCallback(async () => {
    const [reports, items, machines, balances, movements] = await Promise.all([
      from && to ? salesForRange(from, to) : Promise.resolve([]),
      listItems(),
      listMachines(),
      listStoreroomBalances(),
      storeroomAdjustments(),
    ])

    const byItem = new Map<Id, typeof movements>()
    for (const m of movements) {
      const list = byItem.get(m.itemId) ?? []
      list.push(m)
      byItem.set(m.itemId, list)
    }

    // Latest levels per machine, read fresh from each machine's own history
    // rather than derived from `reports` — the range picked above must never
    // change which visit counts as "current".
    const levelsByMachine = new Map<Id, Map<string, number>>(
      await Promise.all(
        machines.map(async (machine): Promise<[Id, Map<string, number>]> => {
          const history = await historyForMachine(machine.id, 1)
          return [machine.id, lastRecordedLevels(history)]
        }),
      ),
    )

    setData({
      reports,
      items: new Map(items.map((i) => [i.id, i])),
      machines,
      storeroomOnHand: new Map(items.map((i) => [
        i.id,
        ledgerBalance(balances.find((b) => b.itemId === i.id), byItem.get(i.id) ?? []),
      ])),
      levelsByMachine,
      loading: false,
    })
  }, [from, to])

  useEffect(() => { void load() }, [load])

  return { ...data, reload: load }
}

/** The most recent run's date, used as the default range. Returns an empty
 * string when no run exists, which `useReport` reads as "nothing to load". */
export async function latestRunDate(): Promise<string> {
  const runs = await listRuns()
  return runs[0]?.date ?? ''
}
