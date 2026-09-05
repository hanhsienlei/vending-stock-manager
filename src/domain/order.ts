import type { Id } from './types'

/** Days of sales the order is expected to cover (spec §6.4, decision D2).
 *
 * Seven covers a full week, so both runs. Runs are Tuesday and Friday, so the
 * gaps are 3 and 4 days; three days of safety covers the longer Fri→Tue gap,
 * meaning one missed run does not empty a machine. Spec §6.4's default of two
 * would be tight against a 4-day gap. Both are editable on the report. */
export const ORDER_HORIZON_DAYS = 7
export const ORDER_SAFETY_DAYS = 3

export type OrderFlag = 'ran-dry' | 'none-left' | 'unfulfillable'

export interface OrderInput {
  itemId: Id
  /** Units per supplier carton. 46 of the 60 catalogue items carry a real
   * one; the remaining loose sundries sit at 1, where this reads in units. */
  boxSize: number
  /** The storeroom's ledger balance. Machine stock is deliberately absent —
   * see the note on `orderSuggestion`. */
  onHand: number
  /** The rates of the slots this item is responsible for — the slots whose
   * `accepts[0]` is this item (design §3.8). Build it with
   * `slotRatesByItem`, which is what stops the double-count. */
  slotRates: (number | null)[]
  /** Why this item is costing sales, if it is: it ran dry somewhere, the
   * shelf at G was found empty, or a slot wanted it and could not have it.
   * Spec §6.4 marks these rows. */
  flags: OrderFlag[]
}

export interface OrderLine {
  itemId: Id
  /** Σ of the item's slot rates. Printed as the `/DAY` column. */
  ratePerDay: number
  /** `ratePerDay × (horizon + safety)`, unrounded, so the arithmetic on the
   * row can be checked: 3 a day over 10 days is 30. */
  forecast: number
  onHand: number
  /** Units short of the forecast, rounded up — you cannot order a tenth. */
  suggested: number
  /** Whole cartons to order. At `boxSize: 1` this equals `units`. */
  boxes: number
  /** What those cartons actually deliver. */
  units: number
  flags: OrderFlag[]
}

/** Attribute each slot's rate to exactly one item — the one it will actually
 * be filled with (design §3.8, §16.1).
 *
 * **This is where spec §6.4's formula is corrected.** `Σ over slots accepting
 * this item` counts a slot whose `accepts` is `[Coke, Fanta]` in Coke's
 * forecast *and* in Fanta's, so every mixed slot is double-counted — and so
 * is every slot that has ever had a second item added, which is how a
 * changeover is recorded, for as long as both items remain listed. Taken
 * literally it over-orders, and by a lot.
 *
 * `accepts[0]` was chosen over splitting a slot's rate across its occupants
 * in proportion to their levels. Proportional splitting is more accurate
 * mid-changeover and much harder to explain: the operator would see a
 * fractional slot contribution with no way to check it. `accepts[0]` gives
 * one legible line — "slot 52 · 1.4 a day · Coke" — and an operator who can
 * see the attribution is wrong can fix it by reordering the slot.
 *
 * **The cost, stated plainly:** through a Coke → Coke + Fanta → Fanta
 * changeover the outgoing item is forecast demand it will never take and the
 * incoming item gets none, until the outgoing item is removed from the slot.
 * That is the same root cause as `known-gaps.md`'s "Fill fights a product
 * changeover" — `SlotConfig.accepts` cannot be reordered — and this is what
 * makes fixing it worth doing. */
export function slotRatesByItem(
  slots: { accepts: Id[]; rate: number | null }[],
): Map<Id, (number | null)[]> {
  const byItem = new Map<Id, (number | null)[]>()

  for (const slot of slots) {
    const itemId = slot.accepts[0]
    if (itemId === undefined) continue
    const rates = byItem.get(itemId) ?? []
    rates.push(slot.rate)
    byItem.set(itemId, rates)
  }

  return byItem
}

/** How much of each item to order, spec §6.4.
 *
 *     ratePerDay = Σ rate over the item's own slots     (slotRatesByItem)
 *     forecast   = ratePerDay × (horizon + safety)
 *     suggested  = max(0, ceil(forecast − onHand))
 *     boxes      = ceil(suggested / boxSize)
 *
 * **Machine stock is not subtracted, and that is not an oversight.** The
 * formula looks like it should net it off, so the reason is recorded here
 * before someone "fixes" it (design §10): the machines are full at the start
 * of the horizon and drain over it, and every unit that drains is replaced
 * from the storeroom. The storeroom therefore has to supply the whole
 * horizon's sales regardless of what is currently sitting in the machines.
 * Spec §6.4 has this right and does not say why.
 *
 * A `null` slot rate contributes no slot to the sum. It is not a zero-rate
 * slot dragging anything down, and it must not turn the total into `NaN`.
 *
 * **What this deliberately does not do:** nothing records that an order was
 * placed, so nothing subtracts stock already on order. Two runs before a
 * delivery lands will each suggest the same order. A real limitation, out of
 * scope, and stated so it is a known boundary rather than a surprise.
 *
 * Pure: plain data in, plain data out. */
export function orderSuggestion(
  inputs: OrderInput[],
  horizon = ORDER_HORIZON_DAYS,
  safety = ORDER_SAFETY_DAYS,
): OrderLine[] {
  const days = horizon + safety

  return inputs.map((input) => {
    const ratePerDay = input.slotRates.reduce<number>(
      (sum, rate) => sum + (rate ?? 0), 0,
    )
    const forecast = ratePerDay * days
    const suggested = Math.max(0, Math.ceil(forecast - input.onHand))
    const boxSize = Number.isFinite(input.boxSize) && input.boxSize > 1
      ? input.boxSize
      : 1
    const boxes = Math.ceil(suggested / boxSize)

    return {
      itemId: input.itemId,
      ratePerDay,
      forecast,
      onHand: input.onHand,
      suggested,
      boxes,
      units: boxes * boxSize,
      flags: input.flags,
    }
  })
}
