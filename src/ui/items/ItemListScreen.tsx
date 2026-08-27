import { useEffect, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { seedStarterCatalogue } from '../../data/repositories/seed'
import type { Id, Item } from '../../domain/types'

export function ItemListScreen({
  onSelect, onNew,
}: {
  onSelect: (id: Id) => void
  onNew: () => void
}) {
  const [items, setItems] = useState<Item[]>([])

  async function reload() {
    setItems(await listItems())
  }

  useEffect(() => {
    void reload()
  }, [])

  async function loadStarterCatalogue() {
    await seedStarterCatalogue()
    await reload()
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Items</h2>
        <button type="button" onClick={onNew} className="font-semibold text-blue-600">
          + New
        </button>
      </div>
      {/* The empty catalogue is the safety mechanism: this button cannot
          fire over real data because it does not exist once any item does. */}
      {items.length === 0 && (
        <button
          type="button"
          onClick={() => void loadStarterCatalogue()}
          className="mb-3 w-full rounded-lg border border-blue-600 p-3 font-semibold text-blue-600"
        >
          Load starter catalogue
        </button>
      )}
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
              {item.remark && (
                <div className="text-xs italic text-amber-700">{item.remark}</div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
