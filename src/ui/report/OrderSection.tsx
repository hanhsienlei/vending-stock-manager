import { useCallback, useState } from 'react'
import {
  ORDER_HORIZON_DAYS, ORDER_SAFETY_DAYS, orderSuggestion,
  type OrderFlag, type OrderLine,
} from '../../domain/order'
import type { MatrixRow } from '../../domain/stockMatrix'
import type { OrderItemInput } from './useReport'

/** One `OrderLine`, plus what the screen needs to say where it came from.
 *
 * `ratedSlots` / `slotCount` are the honesty fields. A rate needs two clean
 * periods on a slot (`rate.ts`), and on this route most slots do not have them
 * yet — so a row built from no measured rate at all must say so rather than
 * print the zero the arithmetic produces. */
export interface OrderRow extends OrderLine {
  itemName: string
  boxSize: number
  /** How many of the item's own slots (design §3.8) have a measured rate. */
  ratedSlots: number
  slotCount: number
  /** The demand rate × 7 — the forecast's own number, in the unit a
   * Tuesday/Friday route thinks in. Rounded for reading. */
  sellsPerWeek: number
  /** The matrix's `balance`, sign-flipped so a shortfall reads positive:
   * "under full 17" is faster than "−17". Zero when at or over full. */
  underFull: number
}

/** The order rows both the report and the printable sheet render. One builder,
 * because the two must never disagree — the same reason `orderCell` is shared. */
export function buildOrderRows(
  inputs: OrderItemInput[],
  matrixRows: MatrixRow[],
  horizon: number,
  safety: number,
): OrderRow[] {
  const matrixByItem = new Map(matrixRows.map((r) => [r.itemId, r]))

  return orderSuggestion(inputs, horizon, safety).map((line, index) => ({
    ...line,
    itemName: inputs[index].itemName,
    boxSize: inputs[index].boxSize,
    ratedSlots: inputs[index].ratedSlots,
    slotCount: inputs[index].slotCount,
    sellsPerWeek: Math.round(line.ratePerDay * 7),
    // An item with no matrix row is in no machine's map at all: neither short
    // nor full, so zero is the honest figure rather than a fabricated gap.
    underFull: Math.max(0, -(matrixByItem.get(line.itemId)?.balance ?? 0)),
  }))
}

const FLAG_LABELS: Record<OrderFlag, string> = {
  'ran-dry': 'Ran dry',
  'none-left': 'None left in G',
  // §7.2's unfulfillable need: a slot asked for this item and the shelf was
  // already at zero. Named for what happened, not for the internal term.
  unfulfillable: 'None to give',
}

/** The `Order` column's text for one item, or `null` when the app has no
 * figure — which is not the same as an order of nothing.
 *
 * Exported because `ReportScreen` builds the stock matrix's `orderByItem` map
 * from it: one formatter, so the column and the table below it can never print
 * different answers for the same item. */
export function orderCell(row: OrderRow): string | null {
  if (row.ratedSlots === 0) return null
  // D12: whole boxes where a carton size is known, plain units at `boxSize: 1`
  // — where `packs.ts` degrades to units and nothing special-cases it.
  if (row.boxSize > 1 && row.boxes > 0) return `${row.boxes} × ${row.boxSize}`
  return `${row.units}`
}

/** Round for reading, not for arithmetic: the forecast is printed unrounded
 * except for the tail a mean of integers over integers produces. */
const trim = (n: number) => Number(n.toFixed(1)).toString()

const HEAD = 'text-[9.5px] font-bold uppercase tracking-[0.12em]'
const GRID = 'grid grid-cols-[1fr_44px_44px_54px] items-baseline gap-2 px-3.5'

/** The order suggestion, spec §6.4 and design §12.4.
 *
 * Presentational: it computes nothing. `orderSuggestion` in `src/domain/order.ts`
 * does the arithmetic — including the correction that stops a mixed slot being
 * counted in both its items' forecasts — and this prints it with enough of the
 * working shown that the operator can check a row by hand. Spec §6.1 is the
 * reason: "an explainable forecast that is slightly worse beats an opaque one
 * that is slightly better", and a figure nobody can check is not trusted. */
export function OrderSection({
  rows, horizon, safety, filled,
  onHorizonChange, onSafetyChange, onFilledChange,
}: {
  rows: OrderRow[]
  horizon: number
  safety: number
  /** Whether the matrix's `Order` column is carrying these figures (D7). */
  filled: boolean
  onHorizonChange: (days: number) => void
  onSafetyChange: (days: number) => void
  onFilledChange: (filled: boolean) => void
}) {
  const days = horizon + safety
  const rated = rows.filter((r) => r.ratedSlots > 0).length

  return (
    <div aria-label="order suggestion">
      <div className={`bg-ink px-4 py-2 text-ground ${HEAD}`}>Order</div>

      {/* The same pattern the From / To dates use: a figure on a 2px ink
          underline, no box. They are a preference, not a record — kept in
          `localStorage` by `useOrderPreferences`, never in Dexie. */}
      <div className="grid grid-cols-2 gap-px border-b-2 border-rule-strong bg-rule-light">
        {([
          ['Horizon', horizon, onHorizonChange],
          ['Safety', safety, onSafetyChange],
        ] as const).map(([label, value, set]) => (
          <DaysField key={label} label={label} value={value} onChange={set} />
        ))}
      </div>

      <div className="flex items-baseline justify-between gap-3 bg-surface px-4 py-2.5">
        <span className="text-[11px] font-medium text-neutral-700">
          Covers {days} days — {horizon} to the next order, {safety} spare.
          Machine stock is not subtracted: the storeroom refills it as it drains.
        </span>
        <button
          type="button"
          aria-pressed={filled}
          onClick={() => onFilledChange(!filled)}
          className={`shrink-0 border-2 border-ink px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
            filled ? 'bg-ink text-ground' : 'bg-paper text-ink'
          }`}
        >
          {filled ? 'Order column filled' : 'Order column blank'}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-neutral-500">
          Nothing to suggest yet — a slot needs two clean periods before it has
          a rate, and no slot has them. Until then the Order column stays yours.
        </p>
      ) : (
        <>
          <div className={`${GRID} bg-ink py-2 text-ground ${HEAD}`}>
            <span>Item</span>
            <span className="text-right">/day</span>
            <span className="text-right">On hand</span>
            <span className="text-right">Order</span>
          </div>

          <ul>
            {rows.map((row) => {
              const cell = orderCell(row)
              return (
                <li
                  key={row.itemId}
                  aria-label={`order for ${row.itemName}`}
                  className={`border-b border-rule-light bg-paper py-2 ${
                    row.flags.length > 0
                      ? 'shadow-[inset_4px_0_0_var(--color-accent)]'
                      : ''
                  }`}
                >
                  <div className={GRID}>
                    <span className="min-w-0 truncate text-[13px] font-semibold">
                      {row.itemName}
                      {row.flags.map((flag) => (
                        <span
                          key={flag}
                          className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-700"
                        >
                          {FLAG_LABELS[flag]}
                        </span>
                      ))}
                    </span>
                    <span className="text-right text-[15px] font-extrabold tabular-nums">
                      {row.ratedSlots > 0 ? trim(row.ratePerDay) : '—'}
                    </span>
                    <span className="text-right text-[15px] font-extrabold tabular-nums">
                      {row.onHand}
                    </span>
                    <span className="text-right text-[15px] font-extrabold tabular-nums text-accent-700">
                      {cell ?? '—'}
                    </span>
                  </div>

                  {/* The working, so the row can be checked by hand. */}
                  <p className="px-3.5 pt-0.5 text-[10.5px] font-medium tabular-nums text-neutral-700">
                    {row.ratedSlots === 0
                      ? `No rate yet — 0 of ${row.slotCount} ${
                          row.slotCount === 1 ? 'slot has' : 'slots have'
                        } two clean periods, so this one is still yours to write.`
                      : `${trim(row.ratePerDay)} a day over ${days} days = ${
                          trim(row.forecast)
                        } needed, ${row.onHand} on hand, ${row.suggested} short${
                          row.ratedSlots < row.slotCount
                            ? ` · rate from ${row.ratedSlots} of ${row.slotCount} slots`
                            : ''
                        }`}
                  </p>

                  {/* The two reference figures: what the item sells in a
                      week, and how far under full the estate is — so the
                      operator can judge the suggestion above rather than
                      just trust or correct it blind. */}
                  <div className="flex flex-wrap gap-3 px-3.5 pt-1 text-[11px] font-medium text-neutral-700">
                    {row.ratedSlots > 0 && (
                      <span>sells <b className="text-[12px] font-extrabold text-ink tabular-nums">{row.sellsPerWeek}</b>/wk</span>
                    )}
                    <span aria-label={`under full for ${row.itemId}`}>
                      under full{' '}
                      <b className={`text-[12px] font-extrabold tabular-nums ${row.underFull > 0 ? 'text-accent-700' : 'text-ink'}`}>
                        {row.underFull}
                      </b>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>

          <p className="bg-surface px-4 py-2.5 text-[11px] font-medium text-neutral-700">
            {rated} of {rows.length} {rows.length === 1 ? 'item has' : 'items have'}{' '}
            a measured rate. Nothing here knows what is already on order.
          </p>
        </>
      )}
    </div>
  )
}

/** One of the two day counts, on a 2px ink underline.
 *
 * It keeps its own draft string rather than being driven straight off the
 * committed number, because a controlled numeric field that refuses an empty
 * value cannot be cleared: React puts the old number straight back, and the
 * operator has to select the digits to replace them. The draft holds whatever
 * is typed; only a positive number is committed, and blurring an unfinished
 * field snaps it back to what is actually in force. */
function DaysField({ label, value, onChange }: {
  label: string
  value: number
  onChange: (days: number) => void
}) {
  const [draft, setDraft] = useState(() => String(value))

  return (
    <label className="flex flex-col gap-1 bg-paper px-4 py-3">
      <span className={`${HEAD} text-neutral-700`}>{label} · days</span>
      <input
        aria-label={label}
        type="number"
        inputMode="numeric"
        min={1}
        className="w-full border-b-2 border-ink bg-transparent pb-1 text-[15px] font-bold tabular-nums outline-none"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const parsed = Number(e.target.value)
          // An empty or nonsense field is not a horizon of zero — it is a
          // field mid-edit, and a zero horizon would silently order nothing.
          if (e.target.value.trim() !== '' && Number.isFinite(parsed) && parsed > 0) {
            onChange(Math.floor(parsed))
          }
        }}
        onBlur={() => setDraft(String(value))}
      />
    </label>
  )
}

const KEYS = {
  horizon: 'vsm.order.horizon',
  safety: 'vsm.order.safety',
  filled: 'vsm.order.filled',
  overrides: 'vsm.order.overrides',
} as const

function read(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw === null ? NaN : Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  } catch {
    // Private-mode Safari throws on access, and a preference is never worth
    // taking the screen down for.
    return fallback
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch { /* see `read` */ }
}

/** Horizon, safety, and whether the matrix's `Order` column carries the
 * suggestion — the three preferences this screen keeps.
 *
 * `localStorage`, deliberately, and not Dexie: they are a preference, not a
 * record. Nothing derives from them after the fact, so they are not worth a
 * table or the migration that would come with one (design §3.9). */
export function useOrderPreferences() {
  const [horizon, setHorizonState] = useState(() => read(KEYS.horizon, ORDER_HORIZON_DAYS))
  const [safety, setSafetyState] = useState(() => read(KEYS.safety, ORDER_SAFETY_DAYS))
  const [filled, setFilledState] = useState(() => {
    try {
      return window.localStorage.getItem(KEYS.filled) !== 'false'
    } catch {
      return true
    }
  })

  const setHorizon = useCallback((days: number) => {
    setHorizonState(days)
    write(KEYS.horizon, String(days))
  }, [])

  const setSafety = useCallback((days: number) => {
    setSafetyState(days)
    write(KEYS.safety, String(days))
  }, [])

  const setFilled = useCallback((next: boolean) => {
    setFilledState(next)
    write(KEYS.filled, String(next))
  }, [])

  return { horizon, safety, filled, setHorizon, setSafety, setFilled }
}

/** The operator's corrections to the suggestion, by item id — boxes where a
 * carton size is known, units where `boxSize` is 1, matching `orderCell`'s two
 * forms. A preference, not a record (design §1): nothing dates it, nothing
 * subtracts it later, and it is NOT the fix for "does not know what has
 * already been ordered".
 *
 * One key holding a JSON object rather than a key per item, so the whole set
 * clears in a single write and a malformed value costs one parse. */
function readOverrides(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(KEYS.overrides)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const clean: Record<string, number> = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        clean[id] = Math.floor(value)
      }
    }
    return clean
  } catch {
    return {}
  }
}

/** The single writer behind every mutation below: perform the try/catch
 * `setItem` and hand back what was written, so each caller can use it as the
 * next state in one expression. */
function writeOverrides(next: Record<string, number>): Record<string, number> {
  try {
    window.localStorage.setItem(KEYS.overrides, JSON.stringify(next))
  } catch {
    // In memory is still correct for this tab, and the print tab simply sees
    // the suggestion. A preference is never worth a broken screen.
  }
  return next
}

export function useOrderOverrides() {
  const [overrides, setOverrides] = useState<Record<string, number>>(readOverrides)

  const setOverride = useCallback((itemId: string, boxes: number) => {
    setOverrides((prev) => writeOverrides({ ...prev, [itemId]: Math.max(0, Math.floor(boxes)) }))
  }, [])

  const clearOverride = useCallback((itemId: string) => {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return writeOverrides(next)
    })
  }, [])

  const clearAll = useCallback(() => setOverrides(writeOverrides({})), [])

  return { overrides, setOverride, clearOverride, clearAll }
}
