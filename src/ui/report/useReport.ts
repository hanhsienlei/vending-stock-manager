import { useCallback, useEffect, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { listMachines } from '../../data/repositories/machines'
import { listPlacements } from '../../data/repositories/placements'
import { listRuns } from '../../data/repositories/runs'
import { forecastForRun } from '../../data/repositories/forecast'
import { salesForRange, type PeriodReport } from '../../data/repositories/sales'
import { storeroomAdjustments } from '../../data/repositories/adjustments'
import { listStoreroomBalances } from '../../data/repositories/storeroom'
import { listTrolleyLines } from '../../data/repositories/trolley'
import { historyForMachine } from '../../data/repositories/visits'
import { today } from '../../domain/date'
import { lastRecordedLevels } from '../../domain/levels'
import { slotRatesByItem, type OrderFlag, type OrderInput } from '../../domain/order'
import { effectivePlacement } from '../../domain/placement'
import { ledgerBalance, storeroomMovements } from '../../domain/storeroom'
import { buildStockMatrix, type MatrixRow } from '../../domain/stockMatrix'
import type { Id, Item, Machine, TrolleyLine } from '../../domain/types'

/** One item's input to `orderSuggestion`, plus what the screen needs to say
 * where the figure came from.
 *
 * `ratedSlots` is the honest half. A slot has no rate until two of its
 * periods are clean (`rate.ts`), and `orderSuggestion` counts a `null` rate
 * as no slot at all — so an item with none reads as a forecast of zero, which
 * is arithmetically right and, printed as an order, a lie. The screen uses
 * this to say "no rate yet" instead. */
export interface OrderItemInput extends OrderInput {
  itemName: string
  ratedSlots: number
  slotCount: number
}

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
  /** Per item, everything `orderSuggestion` needs — but NOT the suggestion
   * itself. The horizon and the safety days are edited on the screen, and
   * re-deriving them here would re-read the whole estate on every keystroke;
   * the arithmetic is pure and instant, so the screen does it. */
  orderInputs: OrderItemInput[]
  loading: boolean
}

export function useReport(from: string, to: string) {
  const [data, setData] = useState<ReportData>({
    reports: [], items: new Map(), machines: [],
    storeroomOnHand: new Map(), levelsByMachine: new Map(), matrixRows: [],
    orderInputs: [],
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

    const orderInputs = await buildOrderInputs(items, storeroomOnHand, trolleyLines)

    setData({
      reports,
      items: new Map(items.map((i) => [i.id, i])),
      machines,
      storeroomOnHand,
      levelsByMachine,
      matrixRows,
      orderInputs,
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

/** Every item the app has something to say about, ready for `orderSuggestion`.
 *
 * The rates come from `forecastForRun`, which is the one place that knows how
 * far back a rate looks, and they are attributed to items by `slotRatesByItem`
 * — **which is where spec §6.4's double-count is corrected**. §6.4's `Σ over
 * slots accepting this item` lands a mixed slot's whole rate in both its
 * items' forecasts; `slotRatesByItem` gives each slot to its `accepts[0]`, so
 * the slot rates partition (design §3.8, §16.1). Nothing here re-derives any
 * of that arithmetic.
 *
 * Desk work at G, never during a walk (spec §8.1): this reads twelve visits
 * per machine, the same read the load screen makes.
 */
async function buildOrderInputs(
  items: Item[],
  storeroomOnHand: Map<Id, number>,
  trolleyLines: TrolleyLine[],
): Promise<OrderItemInput[]> {
  const slots = await forecastForRun(today())

  const ratesByItem = slotRatesByItem(
    slots.map((slot) => ({ accepts: slot.itemIds, rate: slot.rate })),
  )

  const flags = new Map<Id, Set<OrderFlag>>()
  const flag = (itemId: Id, value: OrderFlag) => {
    const set = flags.get(itemId) ?? new Set<OrderFlag>()
    set.add(value)
    flags.set(itemId, set)
  }

  for (const slot of slots) {
    // The item the slot's rate was attributed to, so a flag lands on the same
    // row the forecast did.
    const owner = slot.itemIds[0]
    if (owner === undefined) continue
    if (slot.ranDryLastPeriod) flag(owner, 'ran-dry')
    // §7.2's unfulfillable need, by `buildPickList`'s rule: the slot wants
    // stock and every item it accepts is at a ledger balance of zero. A
    // binary, never a quantity (design §3.7).
    if (slot.need > 0 && slot.itemIds.every((id) => (storeroomOnHand.get(id) ?? 0) <= 0)) {
      flag(owner, 'unfulfillable')
    }
  }

  for (const line of trolleyLines) {
    // `None left in G` is a fact about a shelf on a day, not for ever. It is
    // carried only while the zero it wrote still stands: a delivery since then
    // has answered it, and the flag would otherwise mark the item for good.
    if (line.noneLeftInG && (storeroomOnHand.get(line.itemId) ?? 0) <= 0) {
      flag(line.itemId, 'none-left')
    }
  }

  return items
    .map((item): OrderItemInput => {
      const slotRates = ratesByItem.get(item.id) ?? []
      return {
        itemId: item.id,
        itemName: item.name,
        boxSize: item.boxSize,
        onHand: storeroomOnHand.get(item.id) ?? 0,
        slotRates,
        flags: [...(flags.get(item.id) ?? [])],
        ratedSlots: slotRates.filter((rate) => rate !== null).length,
        slotCount: slotRates.length,
      }
    })
    // An item with no measured rate and nothing wrong with it is left off
    // entirely rather than listed at zero — its Order cell stays blank, which
    // is the paper sheet's behaviour and the honest one.
    .filter((input) => input.ratedSlots > 0 || input.flags.length > 0)
}
