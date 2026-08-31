import { useEffect, useMemo, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { listPlacements } from '../../data/repositories/placements'
import { seedStarterCatalogue } from '../../data/repositories/seed'
import { TRAYS, trayOf, trayLabel } from '../../domain/trays'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
import type { Id, Item, ItemPlacement } from '../../domain/types'

/** Tray category words, from `docs/catalogue-transcription.md`'s own tray
 * titles. A UI constant rather than a field on `Item`: the machine's trays
 * are physically categorised, the catalogue records that, and adding a
 * `category` column would be a schema change for a display word. Tray 40 is
 * "juice, energy, water" in the catalogue, which does not fit a bar, so it
 * takes the spec's own example word. */
const TRAY_CATEGORY: Record<number, string> = {
  10: 'CHIPS', 20: 'SUNDRIES', 30: 'CHOCOLATE',
  40: 'DRINKS', 50: 'CANS', 60: 'ALCOHOL',
}

function trayHeading(tray: number): string {
  const label = trayLabel(tray).toUpperCase()
  const category = TRAY_CATEGORY[tray]
  return category ? `${label} · ${category}` : label
}

/** The remark, short enough to sit beside an item name (§12). The full
 * string stays reachable — as the tag's accessible name here, and in full on
 * the edit screen. */
function remarkTag(remark: string): string {
  return remark.trim().split(/\s+/).slice(0, 3).join(' ').toUpperCase()
}

const GRID = 'grid grid-cols-[34px_1fr_auto] items-center gap-2 px-4'

function ItemRow({
  item, baseSlot, onSelect,
}: {
  item: Item
  baseSlot?: number
  onSelect: (id: Id) => void
}) {
  return (
    <li data-testid={`item-row-${item.id}`} className="border-b border-rule-light bg-paper">
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className={`${GRID} w-full py-2.5 text-left`}
      >
        <span className="text-[15px] font-extrabold tabular-nums">{baseSlot ?? ''}</span>
        <span className="min-w-0">
          <span className="block truncate text-[14.5px] font-semibold">{item.name}</span>
          <span className="block truncate text-[11px] font-medium text-neutral-700">
            {item.size && <>{item.size} · </>}box of {item.boxSize}
          </span>
          {item.remark && (
            <span
              aria-label={item.remark}
              title={item.remark}
              className="mt-1 inline-block bg-accent-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.10em] text-accent-800"
            >
              {remarkTag(item.remark)}
            </span>
          )}
        </span>
        <span className="text-right">
          <span className="block text-[15px] font-extrabold tabular-nums">
            ${item.price.toFixed(2)}
          </span>
          <span className="block text-[11px] font-medium tabular-nums text-neutral-700">
            par {item.basePar}
          </span>
        </span>
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

  const baseSlotByItemId = useMemo(() => {
    const map = new Map<Id, number>()
    for (const p of placements) {
      if (p.scope.kind !== 'base') continue
      const first = [...p.slots].sort((a, b) => a - b)[0]
      if (first !== undefined) map.set(p.itemId, first)
    }
    return map
  }, [placements])

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
    <ScreenLayout
      header={<ScreenHeader eyebrow={`CATALOGUE · ${items.length} ITEMS`} title="Items" />}
    >
      <div className="flex items-center gap-3 border-b border-rule-light px-4 py-2">
        <input
          type="search"
          aria-label="Search items"
          placeholder="Search items"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 border-b-2 border-ink bg-transparent pb-1 text-[13.5px] outline-none"
        />
        <button
          type="button"
          onClick={onNew}
          className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent-700"
        >
          + New
        </button>
      </div>

      {/* The empty catalogue is the safety mechanism: this button cannot
          fire over real data because it does not exist once any item does. */}
      {items.length === 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadStarterCatalogue()}
          className="w-full bg-accent px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-ground disabled:opacity-45"
        >
          {busy ? 'Loading…' : 'Load starter catalogue'}
        </button>
      )}

      {TRAYS.map((tray) => {
        const trayItems = groups.byTray.get(tray) ?? []
        if (trayItems.length === 0) return null
        return (
          <section key={tray}>
            <h3 className="bg-surface px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
              {trayHeading(tray)}
            </h3>
            <ul>
              {trayItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  baseSlot={baseSlotByItemId.get(item.id)}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {groups.unplaced.length > 0 && (
        <section>
          <h3 className="bg-surface px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
            Unplaced
          </h3>
          <ul>
            {groups.unplaced.map((item) => (
              <ItemRow key={item.id} item={item} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      )}
    </ScreenLayout>
  )
}
