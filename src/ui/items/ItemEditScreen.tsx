import { useEffect, useState } from 'react'
import { getItem, saveItem } from '../../data/repositories/items'
import type { Id } from '../../domain/types'

const numberOrNull = (raw: string) => (raw.trim() === '' ? null : Number(raw))

export function ItemEditScreen({ itemId, onDone }: { itemId?: Id; onDone: () => void }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState<number | null>(null)
  const [basePar, setBasePar] = useState<number | null>(null)
  const [boxSize, setBoxSize] = useState<number | null>(null)

  useEffect(() => {
    if (!itemId) return
    getItem(itemId).then((item) => {
      if (!item) return
      setName(item.name)
      setPrice(item.price)
      setBasePar(item.basePar)
      setBoxSize(item.boxSize)
    })
  }, [itemId])

  const valid =
    name.trim() !== '' && price !== null && basePar !== null && boxSize !== null

  async function handleSave() {
    if (!valid) return
    await saveItem({ id: itemId, name: name.trim(), price, basePar, boxSize })
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

      <button
        type="button"
        disabled={!valid}
        onClick={handleSave}
        className="rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:bg-gray-300"
      >
        Save
      </button>
    </div>
  )
}
