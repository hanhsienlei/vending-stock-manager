import { useEffect, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import type { Id, Item } from '../../domain/types'

export function ItemListScreen({
  onSelect, onNew,
}: {
  onSelect: (id: Id) => void
  onNew: () => void
}) {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    listItems().then(setItems)
  }, [])

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Items</h2>
        <button type="button" onClick={onNew} className="font-semibold text-blue-600">
          + New
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className="w-full rounded-lg border p-3 text-left"
            >
              <div className="font-semibold">{item.name}</div>
              <div className="text-xs text-gray-500">
                ${item.price.toFixed(2)} · par {item.basePar} · box of {item.boxSize}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
