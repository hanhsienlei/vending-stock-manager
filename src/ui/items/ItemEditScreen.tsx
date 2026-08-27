import { useEffect, useState } from 'react'
import { getItem, saveItem, deleteItem } from '../../data/repositories/items'
import { listMachines } from '../../data/repositories/machines'
import { getBasePlacement, setPlacement } from '../../data/repositories/placements'
import { pinSlotCapacities } from '../../data/repositories/slotConfigs'
import { parseSlotNumbers } from '../../domain/trays'
import type { Id } from '../../domain/types'

const numberOrNull = (raw: string) => (raw.trim() === '' ? null : Number(raw))

export function ItemEditScreen({ itemId, onDone }: { itemId?: Id; onDone: () => void }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState<number | null>(null)
  const [basePar, setBasePar] = useState<number | null>(null)
  const [boxSize, setBoxSize] = useState<number | null>(null)
  const [size, setSize] = useState('')
  const [remark, setRemark] = useState('')
  const [slots, setSlots] = useState('')
  const [slotError, setSlotError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
      setSlots((placement?.slots ?? []).join(', '))
    })()
  }, [itemId])

  const valid =
    name.trim() !== '' && price !== null && basePar !== null && boxSize !== null

  async function handleSave() {
    if (!valid) return

    // Spec §4.2: set the slots once from the item — "Coke is at 58, 59" —
    // and note the exceptions per machine afterwards. A bad slot number is
    // shown, never dropped silently: a typo that vanishes leaves the operator
    // standing at a machine with a slot that never appears.
    const { slots: parsed, invalid } = parseSlotNumbers(slots)
    if (invalid.length > 0) {
      setSlotError(
        `Not slot numbers: ${invalid.join(', ')}. Slots run 10–14, 20–29, 30–39, 40–49, 50–59, 60–69.`,
      )
      return
    }
    setSlotError(null)

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
    <div className="flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-gray-500">Name</span>
        <input
          aria-label="Name"
          className="rounded-lg border p-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-gray-500">Price</span>
        <input
          aria-label="Price"
          type="number"
          step="0.01"
          className="rounded-lg border p-2"
          value={price ?? ''}
          onChange={(e) => setPrice(numberOrNull(e.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-gray-500">
          Par level <span className="text-red-600">• required</span>
        </span>
        <input
          aria-label="Par level"
          type="number"
          className="rounded-lg border p-2"
          value={basePar ?? ''}
          onChange={(e) => setBasePar(numberOrNull(e.target.value))}
        />
        <span className="text-xs text-gray-400">
          No default. Seeds slot capacity where this item is placed.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-gray-500">Box size</span>
        <input
          aria-label="Box size"
          type="number"
          className="rounded-lg border p-2"
          value={boxSize ?? ''}
          onChange={(e) => setBoxSize(numberOrNull(e.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-gray-500">Size</span>
        <input
          aria-label="Size"
          className="rounded-lg border p-2"
          value={size}
          onChange={(e) => setSize(e.target.value)}
        />
        <span className="text-xs text-gray-400">
          Optional. The pack size shown on the shelf, e.g. 375ml, 27g.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-gray-500">Remark</span>
        <input
          aria-label="Remark"
          className="rounded-lg border p-2"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
        <span className="text-xs text-gray-400">
          Optional. A durable note about the product itself, e.g. an unverified size.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-gray-500">Slots</span>
        <input
          aria-label="Slots"
          inputMode="numeric"
          placeholder="58, 59"
          className="rounded-lg border p-2"
          value={slots}
          onChange={(e) => setSlots(e.target.value)}
        />
        <span className="text-xs text-gray-400">
          Applies to every machine. Correct the exceptions at the machine.
        </span>
        {slotError && (
          <span role="alert" className="text-xs font-semibold text-red-600">
            {slotError}
          </span>
        )}
      </label>

      <button
        type="button"
        disabled={!valid}
        onClick={handleSave}
        className="rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:bg-gray-300"
      >
        Save
      </button>

      {/* Destructive, so it lives below Save, separated, and needs a second
          tap — a thumb landing on it once while scrolling must not delete
          anything. Only offered for an item that already exists. */}
      {itemId && (
        <div className="mt-4 border-t pt-4">
          {confirmingDelete ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="flex-1 rounded-lg bg-red-600 p-3 font-semibold text-white"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="text-sm text-gray-500"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="text-sm font-semibold text-red-600"
            >
              Delete item
            </button>
          )}
        </div>
      )}
    </div>
  )
}
