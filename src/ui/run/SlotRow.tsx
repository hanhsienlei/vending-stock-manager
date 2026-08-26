import { Stepper } from '../components/Stepper'
import { levelKey } from '../../domain/levels'
import type { Id, Item, ResolvedSlot } from '../../domain/types'

export function SlotRow({
  slot, items, before, isFilled, ranDry, onSetBefore, onToggleFill, onEdit,
}: {
  slot: ResolvedSlot
  items: Map<Id, Item>
  before: Map<string, number>
  isFilled: boolean
  ranDry: boolean
  onSetBefore: (slotNumber: number, itemId: Id, qty: number) => void
  onToggleFill: (slotNumber: number) => void
  onEdit: (slotNumber: number) => void
}) {
  const mixed = slot.accepts.length > 1

  return (
    <li
      className={`rounded-lg border p-2 ${ranDry ? 'border-red-500' : ''} ${
        mixed ? 'border-blue-500' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="w-8 text-sm font-bold text-gray-500">{slot.slotNumber}</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">
            {mixed ? `${slot.accepts.length} items` : items.get(slot.accepts[0])?.name}
          </div>
          <div className="text-xs text-gray-400">
            capacity {slot.capacity}
            {ranDry && <span className="ml-2 font-bold text-red-600">RAN DRY</span>}
          </div>
        </div>

        {!mixed && (
          <Stepper
            label={`slot ${slot.slotNumber}`}
            value={before.get(levelKey(slot.slotNumber, slot.accepts[0])) ?? 0}
            max={slot.capacity}
            onChange={(qty) => onSetBefore(slot.slotNumber, slot.accepts[0], qty)}
          />
        )}

        <button
          type="button"
          aria-label={`Fill slot ${slot.slotNumber}`}
          aria-pressed={isFilled}
          onClick={() => onToggleFill(slot.slotNumber)}
          className={`rounded-lg px-2 py-1 text-xs font-bold ${
            isFilled ? 'bg-green-600 text-white' : 'border text-gray-600'
          }`}
        >
          Fill
        </button>

        <button
          type="button"
          aria-label={`Edit slot ${slot.slotNumber}`}
          onClick={() => onEdit(slot.slotNumber)}
          className="px-1 text-lg text-gray-400"
        >
          ⋯
        </button>
      </div>

      {mixed &&
        slot.accepts.map((itemId) => (
          <div key={itemId} className="mt-1 flex items-center gap-2 pl-8">
            <span className="flex-1 text-sm">{items.get(itemId)?.name}</span>
            <Stepper
              label={`slot ${slot.slotNumber} ${items.get(itemId)?.name ?? ''}`}
              value={before.get(levelKey(slot.slotNumber, itemId)) ?? 0}
              max={slot.capacity}
              onChange={(qty) => onSetBefore(slot.slotNumber, itemId, qty)}
            />
          </div>
        ))}
    </li>
  )
}
