import { entersResidual } from './adjustments'
import { levelKey } from './levels'
import type { Adjustment, CountLine, Id, Visit } from './types'

export type CensoredReason = 'no-previous-visit' | 'left-slot-with-stock'

export interface VisitRecord {
  visit: Visit
  lines: CountLine[]
}

export interface SalesLine {
  slotNumber: number
  itemId: Id
  /** What the previous visit left in the slot. */
  opening: number
  /** What this visit found. */
  closing: number
  /** Net signed adjustments in the period, miscounts excluded. */
  movements: number
  /** Units sold, or null when the period is censored. */
  sold: number | null
  censoredReason?: CensoredReason
  ranDry: boolean
  price: number
  revenue: number | null
}

/** The residual for one period — the gap between two consecutive finalized
 * visits to one machine (spec §3.3).
 *
 *     sales = opening − closing + Σ signed movements
 *
 * Signed units collapse the spec's longer formula into that one sum: 2 expired
 * is −2, 3 transferred in is +3. Fills need no term of their own, because a
 * fill happens *at* a visit and is therefore already inside `previous.after`;
 * adding one would double-count it.
 *
 * Pure: takes plain data, returns plain data, reads no database. */
export function salesForPeriod(
  previous: VisitRecord | null,
  current: VisitRecord,
  adjustments: Adjustment[],
): SalesLine[] {
  const openingAt = new Map<string, number>()
  for (const l of previous?.lines ?? []) {
    openingAt.set(levelKey(l.slotNumber, l.itemId), l.after)
  }

  const closingAt = new Map<string, CountLine>()
  for (const l of current.lines) {
    closingAt.set(levelKey(l.slotNumber, l.itemId), l)
  }

  // The period runs from the previous visit being finished to this one being
  // finished. `occurredAt` is the moment the adjustment was logged (design
  // §4.1), so one logged at the machine during this count falls inside it.
  const from = previous?.visit.finalizedAt ?? 0
  const to = current.visit.finalizedAt ?? Number.MAX_SAFE_INTEGER

  const movementAt = new Map<string, number>()
  for (const a of adjustments) {
    if (a.slotNumber === undefined) continue
    if (!entersResidual(a.reason)) continue
    if (a.occurredAt <= from || a.occurredAt > to) continue
    const key = levelKey(a.slotNumber, a.itemId)
    movementAt.set(key, (movementAt.get(key) ?? 0) + a.units)
  }

  const keys = new Set([...openingAt.keys(), ...closingAt.keys()])
  const results: SalesLine[] = []

  for (const key of keys) {
    const closingLine = closingAt.get(key)
    const opening = openingAt.get(key) ?? 0
    const movements = movementAt.get(key) ?? 0

    // The item is no longer in this slot. Its own last recorded level decides
    // whether that is knowable: drained to zero before removal is the normal
    // changeover and means zero sold; removed while still holding stock could
    // equally be a sale or a pull-out, so it is censored (design §3.4).
    if (!closingLine) {
      const [slotPart, itemPart] = splitKey(key)
      results.push({
        slotNumber: slotPart,
        itemId: itemPart,
        opening,
        closing: 0,
        movements,
        sold: opening > 0 ? null : 0,
        censoredReason: opening > 0 ? 'left-slot-with-stock' : undefined,
        ranDry: false,
        price: 0,
        revenue: opening > 0 ? null : 0,
      })
      continue
    }

    const closing = closingLine.before
    const censored: CensoredReason | undefined =
      previous === null ? 'no-previous-visit' : undefined

    // Clamped at zero: a negative residual means stock arrived without being
    // recorded, which is not a negative sale.
    const sold = censored ? null : Math.max(0, opening - closing + movements)

    results.push({
      slotNumber: closingLine.slotNumber,
      itemId: closingLine.itemId,
      opening,
      closing,
      movements,
      sold,
      censoredReason: censored,
      ranDry: closing === 0,
      price: closingLine.price,
      revenue: sold === null ? null : sold * closingLine.price,
    })
  }

  return results.sort(
    (a, b) => a.slotNumber - b.slotNumber || a.itemId.localeCompare(b.itemId),
  )
}

/** `levelKey` is `${slotNumber}:${itemId}`, and an itemId is a UUID that may
 * itself contain no colon — so the first colon is the boundary. */
function splitKey(key: string): [number, Id] {
  const at = key.indexOf(':')
  return [Number(key.slice(0, at)), key.slice(at + 1)]
}
