import { listPlacements, setPlacement } from '../../data/repositories/placements'
import { ensureSlotConfig } from '../../data/repositories/slotConfigs'
import { effectivePlacement } from '../../domain/placement'
import type { Id, Item } from '../../domain/types'

export function SlotEditSheet({
  machineId, slotNumber, capacity, items, currentItemIds, onSaved, onCancel,
}: {
  machineId: Id
  slotNumber: number
  /** The slot's resolved capacity *before* this edit, or null when the slot
   * holds nothing yet and therefore has no capacity to preserve. */
  capacity: number | null
  items: Item[]
  currentItemIds: Id[]
  onSaved: () => void
  onCancel: () => void
}) {
  async function slotsFor(itemId: Id): Promise<number[]> {
    const placements = await listPlacements()
    return effectivePlacement(itemId, machineId, placements)?.slots ?? []
  }

  /** Capacity is physical and shared across everything in the slot (spec §4.3),
   * so it must not move because a label was added or removed. Without a
   * SlotConfig the resolved capacity falls back to the basePar of whichever
   * item happens to sort first, which changes the moment the membership does.
   * Materialising the config with the pre-change capacity and the current
   * accepts order pins both — and gives Fill a real preference order instead
   * of an alphabetical accident. */
  async function pinSlot() {
    if (capacity === null) return   // nothing placed yet — first assignment seeds it
    await ensureSlotConfig(machineId, slotNumber, {
      capacity, accepts: currentItemIds,
    })
  }

  async function add(itemId: Id) {
    const slots = await slotsFor(itemId)
    if (!slots.includes(slotNumber)) {
      await pinSlot()
      await setPlacement(itemId, { kind: 'machine', machineId }, [...slots, slotNumber])
    }
    onSaved()
  }

  async function remove(itemId: Id) {
    const slots = await slotsFor(itemId)
    await pinSlot()
    await setPlacement(
      itemId,
      { kind: 'machine', machineId },
      slots.filter((s) => s !== slotNumber),
    )
    onSaved()
  }

  const present = items.filter((i) => currentItemIds.includes(i.id))
  const absent = items.filter((i) => !currentItemIds.includes(i.id))

  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 font-semibold">Slot {slotNumber}</h3>

      <ul className="mb-3 flex flex-col gap-1">
        {present.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{item.name}</span>
            <button
              type="button"
              onClick={() => void remove(item.id)}
              className="text-xs font-bold text-red-600"
            >
              {`Remove ${item.name}`}
            </button>
          </li>
        ))}
      </ul>

      <ul className="mb-3 flex max-h-48 flex-col gap-1 overflow-y-auto">
        {absent.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="flex-1 text-sm text-gray-500">{item.name}</span>
            <button
              type="button"
              onClick={() => void add(item.id)}
              className="text-xs font-bold text-blue-600"
            >
              {`Add ${item.name}`}
            </button>
          </li>
        ))}
      </ul>

      <button type="button" onClick={onCancel} className="text-sm text-gray-500">
        Close
      </button>
    </div>
  )
}
