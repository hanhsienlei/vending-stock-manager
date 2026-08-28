import { levelKey } from '../../domain/levels'
import type { Id, Item, ResolvedSlot } from '../../domain/types'

/** The five-column grid from §3.2. Two steppers plus a name do not fit 393pt —
 * the arithmetic is in §3.1 and it is why the row overflowed its container.
 * Eleven slots now fit one screen instead of five, so a tray is one screen and
 * the operator stops scrolling mid-tray. The cost is that item names truncate;
 * accepted because the slot number is the identifier at the machine. */
const GRID = 'grid grid-cols-[30px_1fr_60px_60px_34px] items-stretch gap-2 px-3.5'

/** A count cell: an input styled as a cell, not as a field. The grid's rules
 * are its border. */
function CountCell({
  label, value, onChange, dimmed = false, accent = false, surface = false, className = '',
}: {
  label: string
  value: number
  onChange: (qty: number) => void
  dimmed?: boolean
  accent?: boolean
  surface?: boolean
  className?: string
}) {
  return (
    <input
      // `type="text"`, not `type="number"`: the WHATWG spec exempts number
      // inputs from text selection entirely (`select()` no-ops on them,
      // `selectionStart`/`selectionEnd` read null in every browser, not just
      // jsdom), so a number input cannot satisfy the "select on focus so the
      // first keystroke replaces rather than appends" requirement (§3.3) —
      // the exact regression this cell exists to fix. `inputMode="numeric"`
      // still gets the numeric keypad on mobile; the digit filter below
      // replaces the browser's own number-input constraint.
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={label}
      // No `max`, and no `min` attribute either — `type="text"` doesn't apply
      // one. The printed map is ~90% accurate and a channel can hold more
      // than its recorded capacity, so clamping would force an under-record
      // and book phantom sales through the residual. Over-capacity is
      // flagged, never prevented (§3.3) — unchanged from the stepper this
      // replaced. Non-negativity is enforced below instead of via `min`.
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '')
        onChange(digits === '' ? 0 : Math.max(0, Number(digits)))
      }}
      className={`w-full border-x border-rule-light bg-transparent text-center text-[19px] font-extrabold tabular-nums outline-none ${
        surface ? 'bg-surface ' : ''
      }${accent ? 'text-accent-700' : dimmed ? 'text-neutral-400' : 'text-ink'} ${className}`}
    />
  )
}

export function SlotRow({
  slot, items, before, after, touched, ranDry, onSetBefore, onSetAfter, onEdit,
}: {
  slot: ResolvedSlot
  items: Map<Id, Item>
  before: Map<string, number>
  after: Map<string, number>
  touched: Set<string>
  ranDry: boolean
  onSetBefore: (slotNumber: number, itemId: Id, qty: number) => void
  onSetAfter: (slotNumber: number, itemId: Id, qty: number) => void
  onEdit: (slotNumber: number) => void
}) {
  const mixed = slot.accepts.length > 1
  const total = slot.accepts.reduce(
    (sum, itemId) => sum + (before.get(levelKey(slot.slotNumber, itemId)) ?? 0),
    0,
  )
  const overCapacity = total > slot.capacity
  const name = mixed ? `${slot.accepts.length} items` : items.get(slot.accepts[0])?.name

  return (
    <li
      data-testid={`slot-row-${slot.slotNumber}`}
      data-ran-dry={ranDry ? 'true' : undefined}
      // §3.5: the 4px inset is a box-shadow, not a border, so it does not shift
      // the row's contents by 4px. `RAN DRY` on every zero row was the noise.
      className={`border-b border-rule-light bg-paper ${
        ranDry ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''
      }`}
    >
      <div className={`${GRID} ${mixed ? 'h-[34px]' : 'h-[46px]'}`}>
        <span className="self-center text-[15px] font-extrabold tabular-nums">
          {slot.slotNumber}
        </span>
        <span className="self-center truncate text-[13px] font-semibold">{name}</span>
        {mixed ? (
          <>
            <span className="border-x border-rule-light" />
            <span className="border-x border-rule-light bg-surface" />
          </>
        ) : (
          <>
            <CountCell
              label={`slot ${slot.slotNumber} counted`}
              value={before.get(levelKey(slot.slotNumber, slot.accepts[0])) ?? 0}
              dimmed={!touched.has(levelKey(slot.slotNumber, slot.accepts[0]))}
              accent={overCapacity}
              onChange={(qty) => onSetBefore(slot.slotNumber, slot.accepts[0], qty)}
            />
            <CountCell
              label={`slot ${slot.slotNumber} refilled to`}
              value={after.get(levelKey(slot.slotNumber, slot.accepts[0])) ?? 0}
              surface
              onChange={(qty) => onSetAfter(slot.slotNumber, slot.accepts[0], qty)}
            />
          </>
        )}
        <button
          type="button"
          aria-label={`Edit slot ${slot.slotNumber}`}
          onClick={() => onEdit(slot.slotNumber)}
          className="self-center text-lg text-neutral-400"
        >
          ⋯
        </button>
      </div>

      {/* §3.4: the grouping is the indent and the parent's empty cells, not a
          coloured border. `border-blue-500` on a mixed slot comes out. */}
      {mixed &&
        slot.accepts.map((itemId) => {
          const key = levelKey(slot.slotNumber, itemId)
          const itemName = items.get(itemId)?.name ?? ''
          return (
            <div key={itemId} className={`${GRID} h-[42px]`}>
              <span />
              <span className="self-center truncate pl-2.5 text-[12.5px] font-medium text-neutral-700">
                {itemName}
              </span>
              <CountCell
                label={`slot ${slot.slotNumber} ${itemName} counted`}
                value={before.get(key) ?? 0}
                dimmed={!touched.has(key)}
                // The slot as a whole is over capacity, not just whichever
                // item tipped it — every sub-row's Counted figure goes
                // accent together (§3.5; review fix round 1).
                accent={overCapacity}
                onChange={(qty) => onSetBefore(slot.slotNumber, itemId, qty)}
              />
              <CountCell
                label={`slot ${slot.slotNumber} ${itemName} refilled to`}
                value={after.get(key) ?? 0}
                surface
                onChange={(qty) => onSetAfter(slot.slotNumber, itemId, qty)}
              />
              <span />
            </div>
          )
        })}
    </li>
  )
}
