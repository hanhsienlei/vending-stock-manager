import { useEffect, useMemo, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { listPlacements } from '../../data/repositories/placements'
import { seedStarterCatalogue } from '../../data/repositories/seed'
import { TRAYS, trayOf, trayLabel } from '../../domain/trays'
import type { Id, Item, ItemPlacement } from '../../domain/types'

function ItemRow({ item, onSelect }: { item: Item; onSelect: (id: Id) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className="w-full rounded-lg border p-3 text-left"
      >
        <div className="font-semibold">{item.name}</div>
        <div className="text-xs text-gray-500">
          ${item.price.toFixed(2)} · par {item.basePar} · box of {item.boxSize}
          {item.size && <> · {item.size}</>}
        </div>
        {item.remark && (
          <div className="text-xs italic text-amber-700">{item.remark}</div>
        )}
      </button>
    </li>
  )
}

export function ItemListScreen({
  onSelect, onNew,
}: {
  onSelect: (id: Id) => void
  onNew: () => void
}) {
  const [items, setItems] = useState<Item[]>([])
  const [placements, setPlacements] = useState<ItemPlacement[]>([])
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

  async function reload() {
    const [allItems, allPlacements] = await Promise.all([listItems(), listPlacements()])
    setItems(allItems)
    setPlacements(allPlacements)
  }

  useEffect(() => {
    void reload()
  }, [])

  // The empty catalogue is the real safety mechanism (seedStarterCatalogue is
  // one atomic transaction, so two overlapping calls can't both land — see
  // seed.ts). `busy` is belt-and-braces on top of that: the write is ~135
  // records, so disabling on the very first tap means a double-tap never
  // gets a second call in, rather than merely relying on the button vanishing
  // once `items` repopulates after the fact.
  async function loadStarterCatalogue() {
    setBusy(true)
    try {
      await seedStarterCatalogue()
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (term === '') return items
    return items.filter((item) => item.name.toLowerCase().includes(term))
  }, [items, search])

  // Grouping is derived from each item's *base* placement only — this screen
  // has no machine in context, so a machine-scoped override can't apply
  // (spec §4.2). An item can land in more than one tray if its slots span
  // trays (rare, but the data can do it); an item with no base placement at
  // all — or an empty one — falls through to "Unplaced" rather than
  // vanishing, since it must still be findable.
  const traysByItemId = useMemo(() => {
    const byItem = new Map<Id, number[]>()
    for (const p of placements) {
      if (p.scope.kind !== 'base') continue
      byItem.set(p.itemId, p.slots)
    }
    const result = new Map<Id, number[]>()
    for (const item of items) {
      const slots = byItem.get(item.id) ?? []
      result.set(item.id, [...new Set(slots.map(trayOf))])
    }
    return result
  }, [items, placements])

  const groups = useMemo(() => {
    const byTray = new Map<number, Item[]>(TRAYS.map((t) => [t, []]))
    const unplaced: Item[] = []
    for (const item of filtered) {
      const trays = traysByItemId.get(item.id) ?? []
      if (trays.length === 0) {
        unplaced.push(item)
        continue
      }
      for (const tray of trays) {
        byTray.get(tray)?.push(item)
      }
    }
    return { byTray, unplaced }
  }, [filtered, traysByItemId])

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Items</h2>
        <button type="button" onClick={onNew} className="font-semibold text-blue-600">
          + New
        </button>
      </div>

      {/* One-handed on a phone: a single full-width field, no extra taps to
          reach it. */}
      <input
        type="search"
        aria-label="Search items"
        placeholder="Search items"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-lg border p-3"
      />

      {/* The empty catalogue is the safety mechanism: this button cannot
          fire over real data because it does not exist once any item does. */}
      {items.length === 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadStarterCatalogue()}
          className="mb-3 w-full rounded-lg border border-blue-600 p-3 font-semibold text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Loading…' : 'Load starter catalogue'}
        </button>
      )}

      {TRAYS.map((tray) => {
        const trayItems = groups.byTray.get(tray) ?? []
        if (trayItems.length === 0) return null
        return (
          <section key={tray} className="mb-4">
            <h3 className="mb-2 text-xs font-bold uppercase text-gray-500">
              {trayLabel(tray)}
            </h3>
            <ul className="flex flex-col gap-2">
              {trayItems.map((item) => (
                <ItemRow key={item.id} item={item} onSelect={onSelect} />
              ))}
            </ul>
          </section>
        )
      })}

      {groups.unplaced.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-2 text-xs font-bold uppercase text-gray-500">Unplaced</h3>
          <ul className="flex flex-col gap-2">
            {groups.unplaced.map((item) => (
              <ItemRow key={item.id} item={item} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
