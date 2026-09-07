import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { storeroomAdjustments } from '../../data/repositories/adjustments'
import { forecastForRun, type ForecastRow } from '../../data/repositories/forecast'
import { listItems } from '../../data/repositories/items'
import { getRun } from '../../data/repositories/runs'
import { listStoreroomBalances } from '../../data/repositories/storeroom'
import {
  listTrolleyLines, recordTrolleyLoad, trolleyForRun,
} from '../../data/repositories/trolley'
import { getCountLines, listVisitsForRun } from '../../data/repositories/visits'
import { today } from '../../domain/date'
import { buildPickList, slotKey, type PickAssignment } from '../../domain/pick'
import { ledgerBalance, storeroomMovements } from '../../domain/storeroom'
import { trolleyRemaining } from '../../domain/trolley'
import type { SlotNeed } from '../../domain/forecast'
import type {
  Adjustment, CountLine, Id, Item, StoreroomBalance, TrolleyLine,
} from '../../domain/types'

/** One item's row on the load screen: what the machines want, what is going
 * on the trolley, and the workings that justify the first figure to the
 * operator (design §12.1). */
export interface TrolleyRow {
  item: Item
  needed: number
  taken: number
  noneLeftInG: boolean
  /** Every slot this line is going to, in walk order. */
  slots: PickAssignment[]
  /** Units a day across those slots, or null where not one of them has a
   * rate. The mean rather than the sum: the row prints "how fast this item
   * sells where it sells", and a sum would grow with the number of slots
   * while each slot's own drawdown stayed the same. */
  rate: number | null
  /** The longest any machine on this line has gone unseen. `daysSince` is
   * per machine (design §7.1), and the longest gap is the one that explains
   * the largest part of the need. */
  days: number
}

/** A slot on design §4.4's `Nothing expected` list, with what the screen
 * prints beside it: where it is, what is in it, and what it was last at. */
export interface QuietSlot {
  slotNumber: number
  level: number
  itemName: string
  lastLevel: number
}

/** D12: whole boxes off the shelf where a carton size is known, rounded up.
 * Fourteen of sixty items are loose sundries with no carton, and they stay in
 * units — rounding those "up to a box" would mean up to a box of one. */
export function defaultTaken(needed: number, boxSize: number): number {
  if (!Number.isFinite(boxSize) || boxSize <= 1) return needed
  return Math.ceil(needed / boxSize) * boxSize
}

/** The load screen's data, and the two numbers on it the operator can change.
 *
 * Everything is read once, at G, which spec §7 calls unhurried desk work —
 * the forecast reads six weeks of history for fifteen machines, and it must
 * never be on the walk (spec §8.1). Nothing here is read again while the
 * operator types: `taken` and `None left in G` are local state until
 * `Take the trolley up` writes them, so the arithmetic beneath them
 * (allocation, the cut line) recomputes in memory on every keystroke.
 *
 * The pick list is rebuilt through `buildPickList` rather than reimplemented:
 * this hook's whole job is to fetch, hold and hand over. */
export function useTrolley(runId: Id, mode: 'load' | 'return') {
  const [items, setItems] = useState<Item[]>([])
  const [forecast, setForecast] = useState<ForecastRow[]>([])
  const [outOfStock, setOutOfStock] = useState<Set<Id>>(new Set())
  const [saved, setSaved] = useState<TrolleyLine[]>([])
  const [countLines, setCountLines] = useState<CountLine[]>([])
  const [taken, setTakenState] = useState<Map<Id, number>>(new Map())
  const [noneLeft, setNoneLeftState] = useState<Set<Id>>(new Set())
  const [found, setFoundState] = useState<Map<Id, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    const run = await getRun(runId)
    const plannedDate = run?.date ?? today()

    const [loadedItems, balances, adjustments, allTrolley, lines] = await Promise.all([
      listItems(),
      listStoreroomBalances(),
      storeroomAdjustments(),
      listTrolleyLines(),
      trolleyForRun(runId),
    ])

    // The forecast is the expensive read and the return trip does not use it:
    // what is left on the trolley is `taken` minus what went into the
    // machines, and neither half is a projection.
    const rows = mode === 'load' ? await forecastForRun(plannedDate) : []

    const visits = mode === 'return' ? await listVisitsForRun(runId) : []
    const counted = (await Promise.all(visits.map((v) => getCountLines(v.id)))).flat()

    if (!mountedRef.current) return

    setItems(loadedItems)
    setForecast(rows)
    setSaved(lines)
    setCountLines(counted)
    setOutOfStock(emptyShelves(loadedItems, balances, adjustments, allTrolley))

    // A line already written for this run wins over the default: re-entering
    // the screen to correct a figure before leaving G must show the figure
    // that was corrected, not the suggestion it replaced.
    setTakenState(new Map(lines.map((line) => [line.itemId, line.taken])))
    setNoneLeftState(new Set(lines.filter((l) => l.noneLeftInG).map((l) => l.itemId)))
    setLoading(false)
  }, [runId, mode])

  useEffect(() => {
    mountedRef.current = true
    load().catch((err) => {
      if (mountedRef.current) throw err
    })
    return () => { mountedRef.current = false }
  }, [load])

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  )

  const needsBySlot = useMemo(() => {
    const map = new Map<string, SlotNeed>()
    for (const row of forecast) map.set(slotKey(row.machineId, row.slotNumber), row)
    return map
  }, [forecast])

  const levelOf = useMemo(() => {
    const map = new Map<Id, number>()
    for (const row of forecast) map.set(row.machineId, row.level)
    return map
  }, [forecast])

  /** The pick list, straight from the domain. The two inputs a `SlotNeed`
   * cannot carry — the walk's floor levels and which slots have not moved —
   * come from the forecast rows, which carry them because only the
   * repository holds the period history (`repositories/forecast.ts`). */
  const pick = useMemo(() => buildPickList({
    needs: forecast,
    accepts: new Map(forecast.map((row) =>
      [slotKey(row.machineId, row.slotNumber), row.itemIds])),
    outOfStock,
    unmovedSlots: new Set(forecast
      .filter((row) => row.unmoved)
      .map((row) => slotKey(row.machineId, row.slotNumber))),
    levelOf,
  }), [forecast, outOfStock, levelOf])

  const rows = useMemo((): TrolleyRow[] => {
    const built: TrolleyRow[] = []

    for (const line of pick.lines) {
      const item = itemsById.get(line.itemId)
      if (!item) continue
      const needs = line.slots.map((slot) =>
        needsBySlot.get(slotKey(slot.machineId, slot.slotNumber)))
      const rated = needs.filter((need) => need?.rate !== null && need !== undefined)

      built.push({
        item,
        needed: line.needed,
        taken: taken.get(item.id) ?? defaultTaken(line.needed, item.boxSize),
        noneLeftInG: noneLeft.has(item.id),
        slots: line.slots,
        rate: rated.length === 0
          ? null
          : rated.reduce((sum, need) => sum + (need?.rate ?? 0), 0) / rated.length,
        days: needs.reduce((most, need) => Math.max(most, need?.daysSince ?? 0), 0),
      })
    }

    // An item already on the trolley that the pick list no longer asks for.
    // The commonest cause is the operator's own doing: `None left in G`
    // anchors the shelf at zero, and an item the storeroom is out of is not
    // resolved to a slot (design §3.7). A row that vanishes the moment it is
    // filled in is a row the operator cannot correct.
    const listed = new Set(built.map((row) => row.item.id))
    for (const line of saved) {
      if (listed.has(line.itemId)) continue
      const item = itemsById.get(line.itemId)
      if (!item) continue
      built.push({
        item,
        needed: line.needed,
        taken: taken.get(item.id) ?? line.taken,
        noneLeftInG: noneLeft.has(item.id),
        slots: [],
        rate: null,
        days: 0,
      })
    }

    return built
  }, [pick, itemsById, needsBySlot, taken, noneLeft, saved])

  const quiet = useMemo((): QuietSlot[] => pick.quiet.map((need) => ({
    slotNumber: need.slotNumber,
    level: levelOf.get(need.machineId) ?? 0,
    itemName: itemsById.get(
      forecast.find((row) =>
        row.machineId === need.machineId && row.slotNumber === need.slotNumber,
      )?.itemIds[0] ?? '',
    )?.name ?? '',
    lastLevel: need.lastLevel,
  })), [pick, levelOf, itemsById, forecast])

  /** What the trolley should still be holding — `taken` minus everything
   * that went into a machine this run, signed so a redistribution back onto
   * the trolley counts too (`domain/trolley.ts`). */
  const remaining = useMemo(() => {
    const takenByItem = new Map(saved.map((line) => [line.itemId, line.taken]))
    return trolleyRemaining(takenByItem, countLines)
  }, [saved, countLines])

  const returnRows = useMemo(() => saved
    .map((line) => ({
      line,
      item: itemsById.get(line.itemId),
      predicted: remaining.get(line.itemId) ?? 0,
    }))
    .filter((row): row is { line: TrolleyLine; item: Item; predicted: number } =>
      row.item !== undefined)
    .sort((a, b) => a.item.name.localeCompare(b.item.name)),
  [saved, itemsById, remaining])

  const setTaken = useCallback((itemId: Id, units: number) => {
    setTakenState((current) => new Map(current).set(itemId, units))
  }, [])

  const toggleNoneLeft = useCallback((itemId: Id) => {
    setNoneLeftState((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }, [])

  const setFound = useCallback((itemId: Id, units: number) => {
    setFoundState((current) => new Map(current).set(itemId, units))
  }, [])

  /** Every row on the trolley, written at the moment the operator says the
   * trolley is loaded. Rows nobody is taking and nobody has flagged are not
   * written: a line of zero taken is a movement of nothing, and the ledger
   * has enough real rows in it. */
  const save = useCallback(async () => {
    for (const row of rows) {
      if (row.taken <= 0 && !row.noneLeftInG) continue
      await recordTrolleyLoad({
        runId,
        itemId: row.item.id,
        needed: row.needed,
        taken: row.taken,
        noneLeftInG: row.noneLeftInG,
      })
    }
  }, [rows, runId])

  return {
    loading, rows, quiet, unfulfillable: pick.unfulfillable,
    needsBySlot, levelOf, itemsById,
    remaining, returnRows, found,
    setTaken, toggleNoneLeft, setFound, save, refresh: load,
  }
}

/** Items the storeroom is known to be out of — a binary, never a quantity
 * (design §3.7). The ledger is an estimate and the operator is standing in
 * front of the actual shelf; rationing the pick list against a wrong estimate
 * produces a list that disagrees with what they can see. */
function emptyShelves(
  items: Item[],
  balances: StoreroomBalance[],
  adjustments: Adjustment[],
  trolleyLines: TrolleyLine[],
): Set<Id> {
  const anchorByItem = new Map(balances.map((b) => [b.itemId, b]))
  const empty = new Set<Id>()

  for (const item of items) {
    const balance = ledgerBalance(
      anchorByItem.get(item.id),
      storeroomMovements(
        adjustments.filter((a) => a.itemId === item.id),
        trolleyLines.filter((line) => line.itemId === item.id),
      ),
    )
    if (balance <= 0) empty.add(item.id)
  }

  return empty
}
