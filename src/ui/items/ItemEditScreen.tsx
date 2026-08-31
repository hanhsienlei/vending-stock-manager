import { Fragment, useEffect, useState } from 'react'
import { getItem, saveItem, deleteItem } from '../../data/repositories/items'
import { listMachines } from '../../data/repositories/machines'
import { getBasePlacement, setPlacement } from '../../data/repositories/placements'
import { pinSlotCapacities } from '../../data/repositories/slotConfigs'
import { TRAYS, allSlotsInTray, trayLabel } from '../../domain/trays'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
import type { Id } from '../../domain/types'

const numberOrNull = (raw: string) => (raw.trim() === '' ? null : Number(raw))

/** One cell of §12's 2×2 figure grid. Par is the only required field, so it
 * is the only one whose label and underline are accent.
 *
 * `ariaLabel` overrides the accessible name when it must diverge from the
 * visible caption — the fourth cell's caption reads `PACK SIZE` (§12) but its
 * accessible name stays `Size`, the pre-existing name the test suite and
 * every other caller already assert on. */
function FigureField({
  label, ariaLabel, value, onChange, required = false, type = 'number', step,
}: {
  label: string
  ariaLabel?: string
  value: string
  onChange: (raw: string) => void
  required?: boolean
  type?: 'number' | 'text'
  step?: string
}) {
  return (
    <label className="flex flex-col gap-1 bg-paper px-4 py-3">
      <span
        className={`text-[9.5px] font-bold uppercase tracking-[0.12em] ${
          required ? 'text-accent' : 'text-neutral-700'
        }`}
      >
        {label}
      </span>
      <input
        aria-label={ariaLabel ?? label}
        type={type}
        step={step}
        inputMode={type === 'number' ? 'numeric' : undefined}
        className={`w-full border-b-2 bg-transparent pb-1 text-[21px] font-extrabold tabular-nums outline-none ${
          required ? 'border-accent' : 'border-ink'
        }`}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

export function ItemEditScreen({ itemId, onDone }: { itemId?: Id; onDone: () => void }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState<number | null>(null)
  const [basePar, setBasePar] = useState<number | null>(null)
  const [boxSize, setBoxSize] = useState<number | null>(null)
  const [size, setSize] = useState('')
  const [remark, setRemark] = useState('')
  // A set, not typed text: the picker can only express real slot numbers,
  // so there is nothing left to parse or to reject (fix-plan item 13).
  const [slots, setSlots] = useState<Set<number>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function toggleSlot(slot: number) {
    setSlots((current) => {
      const next = new Set(current)
      if (!next.delete(slot)) next.add(slot)
      return next
    })
  }

  useEffect(() => {
    if (!itemId) return
    // One await, so the fields and the slots land in a single render.
    void (async () => {
      const [item, placement] = await Promise.all([
        getItem(itemId), getBasePlacement(itemId),
      ])
      if (item) {
        setName(item.name)
        setPrice(item.price)
        setBasePar(item.basePar)
        setBoxSize(item.boxSize)
        setSize(item.size ?? '')
        setRemark(item.remark ?? '')
      }
      setSlots(new Set(placement?.slots ?? []))
    })()
  }, [itemId])

  const valid =
    name.trim() !== '' && price !== null && basePar !== null && boxSize !== null

  async function handleSave() {
    if (!valid) return

    // Spec §4.2: set the slots once from the item — "Coke is at 58, 59" —
    // and note the exceptions per machine afterwards. The picker can only
    // produce physical slot numbers, so there is nothing to validate here;
    // the stored order stays ascending as every reader expects.
    const parsed = [...slots].sort((a, b) => a - b)

    // A base placement lands on all fifteen machines at once, so every slot
    // this edit newly occupies has to have its physical capacity pinned first
    // — on every machine — or adding this item's label re-derives the slot's
    // capacity from whichever item now sorts first. Pinned before the item is
    // saved, so a par edited in the same pass cannot leak into the pin.
    // Both directions move capacity: adding a label re-derives the slot from
    // whichever item now sorts first, and giving one up re-derives it from
    // whatever is left. Slots on both sides of the edit are unchanged and need
    // no new pin.
    const existingSlots = itemId ? (await getBasePlacement(itemId))?.slots ?? [] : []
    const added = parsed.filter((slot) => !existingSlots.includes(slot))
    const removed = existingSlots.filter((slot) => !parsed.includes(slot))
    const machines = await listMachines()
    await pinSlotCapacities(machines.map((m) => m.id), [...added, ...removed])

    const trimmedSize = size.trim()
    const trimmedRemark = remark.trim()
    const item = await saveItem({
      id: itemId,
      name: name.trim(),
      price,
      basePar,
      boxSize,
      ...(trimmedSize === '' ? {} : { size: trimmedSize }),
      ...(trimmedRemark === '' ? {} : { remark: trimmedRemark }),
    })
    await setPlacement(item.id, { kind: 'base' }, parsed)
    onDone()
  }

  async function handleDelete() {
    if (!itemId) return
    await deleteItem(itemId)
    onDone()
  }

  return (
    <ScreenLayout
      header={
        <ScreenHeader
          back={{ label: '← ITEMS', onClick: onDone }}
          title={
            <input
              aria-label="Name"
              placeholder="New item"
              className="w-full min-w-0 bg-transparent text-[27px] font-extrabold tracking-[-0.02em] outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          }
        />
      }
    >
      <div className="grid grid-cols-2 gap-px border-b-2 border-rule-strong bg-rule-light">
        <FigureField
          label="Price" type="number" step="0.01"
          value={price === null ? '' : String(price)}
          onChange={(raw) => setPrice(numberOrNull(raw))}
        />
        <FigureField
          label="Par level" required
          value={basePar === null ? '' : String(basePar)}
          onChange={(raw) => setBasePar(numberOrNull(raw))}
        />
        <FigureField
          label="Box size"
          value={boxSize === null ? '' : String(boxSize)}
          onChange={(raw) => setBoxSize(numberOrNull(raw))}
        />
        <FigureField
          label="Pack size" ariaLabel="Size" type="text"
          value={size}
          onChange={setSize}
        />
      </div>
      <p className="border-b border-rule-light px-4 py-2 text-[11px] font-medium text-neutral-700">
        Par level has no default and seeds slot capacity where this item is
        placed. Pack size is the label on the shelf — 375ml, 27g.
      </p>

      <label className="flex flex-col gap-1 border-b-2 border-rule-strong px-4 py-3">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          Remark
        </span>
        <input
          aria-label="Remark"
          className="w-full border-b-2 border-ink bg-transparent pb-1 text-[13.5px] outline-none"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
        <span className="text-[11px] font-medium text-neutral-700">
          Optional. A durable note about the product itself, e.g. an unverified size.
        </span>
      </label>

      {/* Fix-plan item 13. A toggle per physical slot, several selectable:
          three catalogue items legitimately occupy two slots each — Nu Pure
          Water 48/49, Coke No Sugar 56/57, Coke 58/59 — so a literal
          single-choice control would have been a regression. Offering only
          the 55 real slots also makes an invalid slot number unreachable,
          which is why there is no error message here any more.
          §12: ten columns, full width, one row per tray. The old flex-wrap
          sat inside a row that already spent 56px on a tray label, so tray
          rows overflowed at 393pt. */}
      <div className="px-4 py-3">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          Slots
        </span>
        <div
          data-testid="slot-picker"
          className="mt-1.5 grid grid-cols-[16px_repeat(10,1fr)] gap-px bg-rule-light"
        >
          {TRAYS.map((tray) => (
            <Fragment key={tray}>
              <span className="flex items-center bg-ground text-[11px] font-bold tabular-nums text-neutral-700">
                {trayLabel(tray).replace('Tray ', '')}
              </span>
              {allSlotsInTray(tray).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  aria-label={`Slot ${slot}`}
                  aria-pressed={slots.has(slot)}
                  onClick={() => toggleSlot(slot)}
                  className={`py-1.5 text-[11px] font-bold tabular-nums ${
                    slots.has(slot) ? 'bg-accent text-ground' : 'bg-paper text-neutral-700'
                  }`}
                >
                  {slot}
                </button>
              ))}
              {/* Tray 1 is short (10–14). The empty cells are what make the
                  machine read as a shape rather than a ragged list. */}
              {Array.from(
                { length: 10 - allSlotsInTray(tray).length },
                (_, i) => <span key={`pad-${i}`} className="bg-ground" />,
              )}
            </Fragment>
          ))}
        </div>
        <span className="mt-2 block text-[11px] font-medium text-neutral-700">
          Applies to every machine. Correct the exceptions at the machine.
        </span>
      </div>

      {/* Destructive, so it needs a second tap — a thumb landing on it once
          while scrolling must not delete anything. Accent TEXT, never a
          fill: Save is this screen's one accent action (tokens.md, colour
          budget). Only offered for an item that already exists. */}
      <div className="flex border-t-2 border-rule-strong">
        <button
          type="button"
          disabled={!valid}
          onClick={handleSave}
          className="flex-1 bg-accent px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-ground disabled:opacity-45"
        >
          Save
        </button>
        {itemId && (
          confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="bg-ground px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-accent-700"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="bg-ground px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-neutral-700"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="bg-ground px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-accent-700"
            >
              Delete item
            </button>
          )
        )}
      </div>
    </ScreenLayout>
  )
}
