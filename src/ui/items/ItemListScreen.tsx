import { useEffect, useMemo, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { listPlacements } from '../../data/repositories/placements'
import { seedStarterCatalogue } from '../../data/repositories/seed'
import { TRAYS, trayOf, trayHeading } from '../../domain/trays'
import { SectionBar, useCollapsedSections } from '../components/CollapsibleSections'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
import type { Id, Item, ItemPlacement } from '../../domain/types'

/** The fold state is keyed by tray number, so the group with no tray needs a
 * key of its own that no tray can collide with. */
const UNPLACED = 'unplaced'

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
  const sections = useCollapsedSections('vsm.items.collapsedTrays')

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

  // Slot order within a tray, never name order. The operator walks a machine
  // top to bottom, so a tray that reads 34, 33, 39, 30 … is a list they have
  // to re-sort in their head at every slot — which is what they reported.
  // `listItems` returns the catalogue by name, so the sort has to happen
  // here; the tie-break keeps two items in one mixed slot in a stable order,
  // and an item with no base slot at all cannot reach a tray group anyway.
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
    for (const trayItems of byTray.values()) {
      trayItems.sort((a, b) => (
        (baseSlotByItemId.get(a.id) ?? Infinity) - (baseSlotByItemId.get(b.id) ?? Infinity)
        || a.name.localeCompare(b.name)
      ))
    }
    return { byTray, unplaced }
  }, [filtered, traysByItemId, baseSlotByItemId])

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
        const open = sections.isOpen(String(tray))
        return (
          <section key={tray}>
            {/* The bar stays an `h3` — it is still this section's heading,
                and a button inside one keeps both readings. */}
            <h3>
              <SectionBar
                heading={trayHeading(tray)}
                open={open}
                count={trayItems.length}
                onToggle={() => sections.toggle(String(tray))}
              />
            </h3>
            {open && (
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
            )}
          </section>
        )
      })}

      {groups.unplaced.length > 0 && (
        <section>
          <h3>
            <SectionBar
              heading="UNPLACED"
              open={sections.isOpen(UNPLACED)}
              count={groups.unplaced.length}
              onToggle={() => sections.toggle(UNPLACED)}
            />
          </h3>
          {sections.isOpen(UNPLACED) && (
            <ul>
              {groups.unplaced.map((item) => (
                <ItemRow key={item.id} item={item} onSelect={onSelect} />
              ))}
            </ul>
          )}
        </section>
      )}
    </ScreenLayout>
  )
}
