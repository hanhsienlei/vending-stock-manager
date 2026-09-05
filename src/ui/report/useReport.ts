import { useCallback, useEffect, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { listMachines } from '../../data/repositories/machines'
import { listPlacements } from '../../data/repositories/placements'
import { listRuns } from '../../data/repositories/runs'
import { salesForRange, type PeriodReport } from '../../data/repositories/sales'
import { storeroomAdjustments } from '../../data/repositories/adjustments'
import { listStoreroomBalances } from '../../data/repositories/storeroom'
import { listTrolleyLines } from '../../data/repositories/trolley'
import { historyForMachine } from '../../data/repositories/visits'
import { lastRecordedLevels } from '../../domain/levels'
import { effectivePlacement } from '../../domain/placement'
import { ledgerBalance, storeroomMovements } from '../../domain/storeroom'
import { buildStockMatrix, type MatrixRow } from '../../domain/stockMatrix'
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
  /** The paper stock sheet's rows, one per item — built once from
   * `levelsByMachine`, `storeroomOnHand` and the estate's placements. An item
   * in several slots is one row listing them all, so its storeroom balance is
   * counted once, not once per slot. */
  matrixRows: MatrixRow[]
  loading: boolean
}

export function useReport(from: string, to: string) {
  const [data, setData] = useState<ReportData>({
    reports: [], items: new Map(), machines: [],
    storeroomOnHand: new Map(), levelsByMachine: new Map(), matrixRows: [],
    loading: true,
  })

  const load = useCallback(async () => {
    const [reports, items, machines, balances, movements, placements, trolleyLines] =
      await Promise.all([
        from && to ? salesForRange(from, to) : Promise.resolve([]),
        listItems(),
        listMachines(),
        listStoreroomBalances(),
        storeroomAdjustments(),
        listPlacements(),
        listTrolleyLines(),
      ])

    const byItem = new Map<Id, typeof movements>()
    for (const m of movements) {
      const list = byItem.get(m.itemId) ?? []
      list.push(m)
      byItem.set(m.itemId, list)
    }

    // The trolley is a storeroom movement source from Phase 3 on (design
    // §3.5, §11). It is read here as well as on the storeroom screen because
    // the two must not print different figures for the same shelf.
    const trolleyByItem = new Map<Id, typeof trolleyLines>()
    for (const line of trolleyLines) {
      const list = trolleyByItem.get(line.itemId) ?? []
      list.push(line)
      trolleyByItem.set(line.itemId, list)
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

    const storeroomOnHand = new Map(items.map((i) => [
      i.id,
      ledgerBalance(
        balances.find((b) => b.itemId === i.id),
        storeroomMovements(byItem.get(i.id) ?? [], trolleyByItem.get(i.id) ?? []),
      ),
    ]))

    // Which slots each item occupies, anywhere in the estate — the base
    // placement unless a machine overrides it (`effectivePlacement`), unioned
    // across every machine so the matrix shows an item wherever it lives.
    const slotsByItem = new Map<Id, number[]>()
    for (const item of items) {
      const slots = new Set<number>()
      for (const machine of machines) {
        const placement = effectivePlacement(item.id, machine.id, placements)
        for (const slot of placement?.slots ?? []) slots.add(slot)
      }
      slotsByItem.set(item.id, [...slots])
    }

    const matrixRows = buildStockMatrix({
      items,
      machineIds: machines.map((m) => m.id),
      levelsByMachine,
      slotsByItem,
      storeroomOnHand,
    })

    setData({
      reports,
      items: new Map(items.map((i) => [i.id, i])),
      machines,
      storeroomOnHand,
      levelsByMachine,
      matrixRows,
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
