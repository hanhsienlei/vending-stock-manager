# Interface refinement, steps 4–12 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the eight screens the 2026-08-28 round deliberately skipped — the slot editor, the adjustment sheet, the storeroom, history and its receipt, the report, the stock matrix, and the two item screens — into the same visual language as the run screen and the machines list, changing layout and labelling only.

**Architecture:** Every task is a re-layout of one existing screen against `docs/design/tokens.md`. No task adds, removes or changes a repository function, a domain function, or a database write. Each screen keeps the data it already loads and the accessible names its tests already assert on, except where a task names the change explicitly. The shared `ScreenLayout` / `ScreenHeader` components built in the previous round are the chrome; screens supply the body.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (tokens live in `@theme` in `src/index.css`), Dexie/IndexedDB, Vitest + Testing Library + `user-event`.

**Spec:** `docs/design/2026-08-28-interface-refinement.md` — §6, §7, §8, §9, §10, §11, §12. Tokens: `docs/design/tokens.md`. Behaviour and data authority (unchanged by this plan): `docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md`.

## Global Constraints

Every task's requirements implicitly include this section.

1. **No repository or domain change.** Spec §1: "If a task here needs a repository change, the task is wrong." Nothing under `src/data/` or `src/domain/` is modified by any task in this plan. The schema stays at version 3.
2. **No screen may gain a per-row repository call.** Established as a ruling in the previous round (execution log, Task 7+8). A screen may keep the queries it already makes; it may not add one inside a `map` over rows.
3. **Radius zero.** No `rounded-*` class may survive in any file a task touches. `docs/design/tokens.md`: "Every `rounded-lg` and `rounded-full` in `src/ui/` comes out."
4. **Token colours only.** In a touched file, no `gray-*`, `blue-*`, `red-*`, `green-*`, `emerald-*`, `amber-*`, `bg-white`, `bg-black`. The full permitted set: `ground`, `surface`, `paper`, `ink`, `accent`, `accent-100`, `accent-200`, `accent-600`, `accent-700`, `accent-800`, `neutral-100`, `neutral-400`, `neutral-500`, `neutral-600`, `neutral-700`, `rule-strong`, `rule-light`.
5. **One accent element per screen body.** The primary action takes it. Where a screen has a destructive action and a primary one, the destructive one is `accent-700` **text only**, never a fill.
6. **Rules, not borders.** 1px `rule-light` *under* each row; 2px `rule-strong` between sections and above a footer. No box around a row. The 4px left inset mark is `shadow-[inset_4px_0_0_var(--color-accent)]`, never a border — a border shifts the row's contents by 4px.
7. **Every figure carries `tabular-nums`.**
8. **Flush left.** Every label, heading and button label starts at the left padding edge, including a button that spans half the screen.
9. **Accessible names are load-bearing.** Existing `aria-label` strings are asserted on by the test suite and by `getByLabelText`. Preserve them unless the task text says otherwise. Where §6 replaces a *visible* label with a verb, the full string stays as `aria-label`.
10. **Type scale** (from `tokens.md`): screen title 27px/800 tracking −0.02em; sheet title 19px/800; large figure 24px/800; row figure 19px/800; small figure 15px/800; row title 13–14.5px/600; metadata 11–12px/500 `neutral-700`; column header 9.5px/700 tracking 0.12em uppercase; eyebrow 10.5px/600 tracking 0.12em uppercase; button label 12.5px/800 tracking 0.04em.
11. **Spacing:** row padding `10–11px 16px` (`px-4 py-2.5`); section bars `7–9px 16px`; footer buttons `15px 16px` (`px-4 py-[15px]`); grid gaps `8px` (`gap-2`).
12. **Verification per task:** `npm test` (full suite, all green) and `npx tsc --noEmit` (clean) before the commit. A task is not done on a passing subset.
13. **Commit per task**, message in the repo's existing style: `feat(<area>): <what> (§N)` or `fix(<area>): …`.

---

### Task 1: Slot editor sheet (§6)

The sheet the operator opens with `⋯` mid-run. It is the one surface the previous round deliberately left half-old (execution log, Task 6 ruling), so it is first.

**Files:**
- Modify: `src/ui/run/SlotEditSheet.tsx` (whole render, plus one new prop and one new effect)
- Modify: `src/ui/run/CountScreen.tsx:213-214` (call site: `machineId={machineId}` becomes `machine={machine}`)
- Modify: `src/ui/machines/MachineMapScreen.tsx` (call site: same change; the screen already has `machine`)
- Test: `src/ui/run/SlotEditSheet.test.tsx`

**Interfaces:**
- Consumes: `trayOf` and `trayLabel` from `src/domain/trays.ts`; `listPlacements` from `src/data/repositories/placements.ts` (already imported); `Machine` from `src/domain/types.ts`.
- Produces: `SlotEditSheet`'s prop `machineId: Id` is **replaced** by `machine: Machine`. Internally `const machineId = machine.id`, so every existing write path is untouched. Both call sites already hold a `Machine`. No other prop changes.

**What the screen becomes** (§6): three blocks under an ink title bar.

- Title bar, ink fill, ground text: `Slot 31` at 19px/800, `L7 · Tray 3` at 13px with 70% opacity beside it, `CLOSE` right-aligned at 10.5px/700 uppercase.
- **Capacity.** Label `CAPACITY · THIS MACHINE ONLY`, the figure at 24px/800 on a 2px ink underline, `SAVE` as a 2px-outlined button beside it. Helper: *Overrides the item's par level here. Leave it if the whole estate is the same depth.* The `< 1` rejection and the disabled-Save behaviour are unchanged.
- **In this slot.** One row per item: name at 13.5px/600, then `ADJUST` in `neutral-700` and `REMOVE` in `accent-700`, both 10.5px/700 uppercase. The full `Adjust {name}` / `Remove {name}` string moves to `aria-label`. When two items are present, a helper line states the changeover problem.
- **Add an item.** A search field, then rows: name in `neutral-700` with `· usually 34` (the item's *base* slot) in `neutral-500`, and `ADD` in `accent-700`. The list keeps `max-h-48` and its scroll.

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/run/SlotEditSheet.test.tsx`. First change the existing `renderSheet` helper's `machineId?: string` to `machine?: Machine` so every existing test keeps working — the default machine must keep the id `'L7'` that the existing tests' assertions depend on:

```tsx
import type { Id, Machine } from '../../domain/types'

const MACHINE: Machine = { id: 'L7', label: 'Level 7', level: 7, updatedAt: 0 }

function renderSheet(props: {
  slotNumber?: number
  items?: Awaited<ReturnType<typeof listItems>>
  currentItemIds?: Id[]
  capacity?: number
  machine?: Machine
  isFilled?: boolean
  onToggleFill?: () => void
  slotInMap?: boolean
}) {
  const onSaved = vi.fn()
  render(
    <SlotEditSheet
      machine={props.machine ?? MACHINE}
      slotNumber={props.slotNumber ?? 58}
      items={props.items ?? []}
      currentItemIds={props.currentItemIds ?? []}
      capacity={props.capacity ?? 0}
      onSaved={onSaved}
      onCancel={vi.fn()}
      isFilled={props.isFilled}
      onToggleFill={props.onToggleFill}
      slotInMap={props.slotInMap}
    />,
  )
  return onSaved
}
```

Then the new tests:

```tsx
describe('SlotEditSheet — §6 layout', () => {
  it('says which machine and tray the slot is in', () => {
    renderSheet({ slotNumber: 31 })
    expect(screen.getByText('Slot 31')).toBeInTheDocument()
    expect(screen.getByText('L7 · Tray 3')).toBeInTheDocument()
  })

  // The defect §6 exists to fix: the visible label WAS the accessible name,
  // so a two-item slot rendered four buttons all starting with the same
  // forty characters. The row is the subject; the button is the verb.
  it('shows the verb as the visible label and keeps the full string as the accessible name', async () => {
    const chips = await saveItem({
      name: 'Red Rock Deli Chips Honey Soy Chicken', price: 3.5, basePar: 5, boxSize: 1,
    })
    renderSheet({ items: await listItems(), currentItemIds: [chips.id] })

    const remove = screen.getByRole('button', {
      name: 'Remove Red Rock Deli Chips Honey Soy Chicken',
    })
    expect(remove).toHaveTextContent(/^REMOVE$/)
    const adjust = screen.getByRole('button', {
      name: 'Adjust Red Rock Deli Chips Honey Soy Chicken',
    })
    expect(adjust).toHaveTextContent(/^ADJUST$/)
  })

  it('warns about the changeover only when the slot holds two items', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    const fanta = await saveItem({ name: 'Fanta', price: 4.5, basePar: 5, boxSize: 1 })
    const items = await listItems()

    renderSheet({ items, currentItemIds: [coke.id] })
    expect(screen.queryByText(/changeover/i)).not.toBeInTheDocument()
    cleanup()

    renderSheet({ items, currentItemIds: [coke.id, fanta.id] })
    expect(screen.getByText(/Two items means a changeover/)).toBeInTheDocument()
  })

  // §6: "the usual slot is the fastest way to catch that you are about to
  // place something in the wrong channel."
  it('shows each addable item its base slot', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    await setPlacement(coke.id, { kind: 'base' }, [34])
    renderSheet({ items: await listItems(), currentItemIds: [] })

    await waitFor(() => expect(screen.getByText('· usually 34')).toBeInTheDocument())
  })

  it('filters the add list by the search field', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    await saveItem({ name: 'Fanta', price: 4.5, basePar: 5, boxSize: 1 })
    renderSheet({ items: await listItems(), currentItemIds: [] })

    await user.type(screen.getByLabelText('Search items to add'), 'fan')
    expect(screen.getByRole('button', { name: 'Add Fanta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Coke' })).not.toBeInTheDocument()
  })

  it('carries no rounded corner and no legacy palette class', () => {
    const { container } = render(
      <SlotEditSheet
        machine={MACHINE} slotNumber={31} items={[]} currentItemIds={[]} capacity={5}
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
```

Add `cleanup` to the `@testing-library/react` import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/run/SlotEditSheet.test.tsx`
Expected: FAIL — TypeScript rejects `machine` (the prop is still `machineId`), and the new assertions find no `L7 · Tray 3`, no `REMOVE`-only label, no search field.

- [ ] **Step 3: Implement**

In `src/ui/run/SlotEditSheet.tsx`:

Signature and derived values — replace the `machineId: Id` prop:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { listPlacements, setPlacement } from '../../data/repositories/placements'
import { trayOf, trayLabel } from '../../domain/trays'
import type { Id, Item, ItemPlacement, Machine } from '../../domain/types'

export function SlotEditSheet({
  machine, slotNumber, items, currentItemIds, capacity, onSaved, onCancel,
  isFilled, onToggleFill, slotInMap,
}: {
  /** The machine this slot belongs to. Was `machineId`; the whole object is
   * passed so the sheet's title bar can say `L7 · Tray 3` without a lookup.
   * Both call sites already hold a `Machine`. */
  machine: Machine
  // …every other prop unchanged, with its existing comment.
}) {
  const machineId = machine.id
```

Base slots, loaded once on mount — not per row (Global Constraint 2):

```tsx
  // The item's BASE slot, shown beside each addable item (§6). Loaded once
  // here rather than per row: `listPlacements` is a single table read and the
  // sheet already calls it on every add and remove.
  const [basePlacements, setBasePlacements] = useState<ItemPlacement[]>([])
  useEffect(() => {
    void (async () => {
      const all = await listPlacements()
      setBasePlacements(all.filter((p) => p.scope.kind === 'base'))
    })()
  }, [])

  const baseSlotByItem = useMemo(() => {
    const map = new Map<Id, number>()
    for (const p of basePlacements) {
      const first = [...p.slots].sort((a, b) => a - b)[0]
      if (first !== undefined) map.set(p.itemId, first)
    }
    return map
  }, [basePlacements])

  const [addSearch, setAddSearch] = useState('')
```

Filtering, beside the existing `present` / `absent`:

```tsx
  const present = items.filter((i) => currentItemIds.includes(i.id))
  const absent = items
    .filter((i) => !currentItemIds.includes(i.id))
    .filter((i) => i.name.toLowerCase().includes(addSearch.trim().toLowerCase()))
```

The render, replacing everything from `return (` to the closing tag. `saveCapacity`, `add`, `remove`, `pinSlot`, `slotsFor`, `capacityInput`, `canSaveCapacity` and the `AdjustmentSheet` block are unchanged in behaviour:

```tsx
  return (
    <div className="bg-paper">
      <div className="flex items-baseline justify-between bg-ink px-4 py-2.5 text-ground">
        <h3 className="text-[19px] font-extrabold">
          Slot {slotNumber}
          <span className="ml-2 text-[13px] font-medium opacity-70">
            L{machine.level} · {trayLabel(trayOf(slotNumber))}
          </span>
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
        >
          Close
        </button>
      </div>

      {onToggleFill && slotInMap && (
        <button
          type="button"
          aria-label={`Fill slot ${slotNumber}`}
          aria-pressed={isFilled}
          onClick={onToggleFill}
          className={`w-full border-b border-rule-light px-4 py-3 text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] ${
            isFilled ? 'bg-ink text-ground' : 'bg-ground text-ink'
          }`}
        >
          Fill to capacity
        </button>
      )}

      <div className="border-b-2 border-rule-strong px-4 py-3">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          Capacity · this machine only
        </span>
        <div className="mt-1 flex items-end gap-3">
          <input
            aria-label="Capacity"
            type="number"
            inputMode="numeric"
            min={1}
            className="w-20 border-b-2 border-ink bg-transparent pb-1 text-[24px] font-extrabold tabular-nums outline-none"
            value={capacityInput}
            onChange={(e) => setCapacityInput(e.target.value)}
          />
          <button
            type="button"
            disabled={!canSaveCapacity}
            onClick={() => void saveCapacity()}
            className="border-2 border-ink px-3 py-1.5 text-[12.5px] font-extrabold uppercase tracking-[0.04em] disabled:opacity-45"
          >
            Save
          </button>
        </div>
        <p className="mt-2 text-[11px] font-medium text-neutral-700">
          Overrides the item&rsquo;s par level here. Leave it if the whole estate
          is the same depth.
        </p>
      </div>

      <div className="border-b-2 border-rule-strong">
        <div className="bg-surface px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          In this slot
        </div>
        {present.length === 0 ? (
          <p className="px-4 py-2.5 text-[13px] text-neutral-500">Not stocked.</p>
        ) : (
          <ul>
            {present.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-rule-light px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                  {item.name}
                </span>
                {/* §6: the row is the subject, the button is the verb. The
                    full string stays as the accessible name. */}
                <button
                  type="button"
                  aria-label={`Adjust ${item.name}`}
                  onClick={() => setAdjusting(item.id)}
                  className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-neutral-700"
                >
                  Adjust
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => void remove(item.id)}
                  className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent-700"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {present.length > 1 && (
          <p className="bg-accent-200 px-4 py-2 text-[11px] font-medium text-accent-800">
            Two items means a changeover. Fill tops up whichever sorts first
            alphabetically, so step the outgoing line down by hand until it is
            gone.
          </p>
        )}
      </div>

      <div>
        <div className="bg-surface px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          Add an item
        </div>
        <div className="border-b border-rule-light px-4 py-2">
          <input
            type="search"
            aria-label="Search items to add"
            placeholder="Search items"
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            className="w-full border-b-2 border-ink bg-transparent pb-1 text-[13.5px] outline-none"
          />
        </div>
        <ul className="max-h-48 overflow-y-auto">
          {absent.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 border-b border-rule-light px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-neutral-700">
                {item.name}
                {baseSlotByItem.has(item.id) && (
                  <span className="ml-1.5 text-[11px] text-neutral-500">
                    · usually {baseSlotByItem.get(item.id)}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label={`Add ${item.name}`}
                onClick={() => void add(item.id)}
                className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent-700"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      </div>

      {adjusting !== null && (
        <AdjustmentSheet
          location={{ kind: 'machine', machineId, slotNumber }}
          itemId={adjusting}
          onSaved={() => {
            setAdjusting(null)
            onSaved()
          }}
          onCancel={() => setAdjusting(null)}
        />
      )}
    </div>
  )
```

The trailing `Close` button at the bottom is removed — `CLOSE` in the title bar replaces it. If any existing test taps a bottom `Close`, it still resolves: the accessible name is unchanged.

Then both call sites. `src/ui/run/CountScreen.tsx:214`: `machineId={machineId}` becomes `machine={machine}`. `src/ui/machines/MachineMapScreen.tsx`: `machineId={machine.id}` becomes `machine={machine}`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/run/ src/ui/machines/` then `npm test` and `npx tsc --noEmit`
Expected: all green, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/run/SlotEditSheet.tsx src/ui/run/SlotEditSheet.test.tsx src/ui/run/CountScreen.tsx src/ui/machines/MachineMapScreen.tsx
git commit -m "feat(run): re-lay the slot editor sheet (§6)"
```

---

### Task 2: Adjustment sheet (§7)

The `<select>` for Reason is the defect: it hides the fact that the reason decides which fields exist and which way the number goes, so the destination and direction controls appear *below* a control the operator has already scrolled past.

**Files:**
- Modify: `src/ui/adjustments/AdjustmentSheet.tsx` (render only — every `record()` path stays byte-for-byte)
- Test: `src/ui/adjustments/AdjustmentSheet.test.tsx`

**Interfaces:**
- Consumes: `ADJUSTMENT_REASONS`, `reasonSpec`, `ReasonSpec` from `src/domain/adjustments.ts`; `Machine` from types.
- Produces: no prop changes. `AdjustmentSheet`'s props stay `{ location, itemId, reasons?, onSaved, onCancel }`.

**What the screen becomes** (§7):

- Reason moves to the **top**, as tiles in a two-column grid. `transfer` takes a cell spanning both columns; every other reason takes a single cell in `ADJUSTMENT_REASONS` order. Selected tile: accent fill, ground text. Labels are `ADJUSTMENT_REASONS[].label` verbatim — never reworded here.
- Below it, a two-column form grid on 1px rules: `UNITS` (24px/800 tabular), `TO MACHINE` (transfer only), `INTO SLOT` (machine destination only), and a new read-only `RESULT` cell.
- `RESULT` states both sides in plain terms: `L7·31 down 3` / `L9·31 up 3`. New in this task, and the reason it exists: a transfer is the one place the sheet can silently do the wrong thing, and it writes both sides atomically.
- Two warning bands, both lifted verbatim from `known-gaps.md`, each rendered at the point of the mistake.
- The commit button names the reason: `Record move`, `Record delivery`, `Record write-off`.

**Ruling — which tile spans.** `transfer` is named explicitly rather than derived from label length. §7 names it, and a length heuristic would silently re-flow the grid the day a label is edited. If `transfer` is absent from `reasons` (no caller does this today), no cell spans and the grid is a plain two-column list.

**Ruling — the default reason stays `'expired'`.** It is a member of every list any caller passes, which is what makes `reasonSpec(reason)` provably non-throwing (execution log, Task 9). Do not change it to `transfer` to match the first tile position.

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/adjustments/AdjustmentSheet.test.tsx`:

```tsx
describe('AdjustmentSheet — §7 layout', () => {
  it('offers the reasons as tiles in the domain table order, not a select', async () => {
    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument()

    // The full table at the storeroom default: six reasons, six tiles.
    for (const spec of ADJUSTMENT_REASONS) {
      expect(screen.getByRole('button', { name: spec.label })).toBeInTheDocument()
    }
  })

  it('marks the chosen tile as pressed and no other', async () => {
    const user = userEvent.setup()
    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delivery arrived' }))
    expect(screen.getByRole('button', { name: 'Delivery arrived' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Expired' }))
      .toHaveAttribute('aria-pressed', 'false')
  })

  it('names the reason on the commit button', async () => {
    const user = userEvent.setup()
    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Record write-off' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delivery arrived' }))
    expect(screen.getByRole('button', { name: 'Record delivery' })).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Move to another machine or the storeroom' }),
    )
    expect(screen.getByRole('button', { name: 'Record move' })).toBeInTheDocument()
  })

  // The new cell. A transfer writes both sides atomically, so both sides are
  // stated before the commit.
  it('states both sides of a transfer before it is committed', async () => {
    const user = userEvent.setup()
    const source = await saveMachine({ label: 'Lift lobby', level: 7 })
    const target = await saveMachine({ label: 'Level 9', level: 9 })

    render(
      <AdjustmentSheet
        location={{ kind: 'machine', machineId: source.id, slotNumber: 31 }}
        itemId="i1" onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Move to another machine or the storeroom' }),
    )
    await waitFor(() => expect(screen.getByLabelText('To machine')).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('To machine'), target.id)
    await user.clear(screen.getByLabelText('Units'))
    await user.type(screen.getByLabelText('Units'), '3')

    const result = screen.getByLabelText('Result')
    expect(result).toHaveTextContent('L7·31 down 3')
    expect(result).toHaveTextContent('L9·31 up 3')
  })

  it('warns on a move that a same-run move is already recorded by the counts', async () => {
    const user = userEvent.setup()
    await saveMachine({ label: 'Level 9', level: 9 })
    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText(/subtracts it twice/)).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Move to another machine or the storeroom' }),
    )
    expect(screen.getByText(/subtracts it twice/)).toBeInTheDocument()
  })

  it('says at the storeroom why miscount is not on offer', () => {
    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        reasons={ADJUSTMENT_REASONS.filter((r) => r.entersResidual)}
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Miscount is not offered here/)).toBeInTheDocument()
  })

  it('carries no rounded corner and no legacy palette class', () => {
    const { container } = render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }} itemId="i1"
        onSaved={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
```

Import `ADJUSTMENT_REASONS` from `../../domain/adjustments` and `saveMachine` from `../../data/repositories/machines` if the file does not already.

Note the two renamed accessible names this task introduces, both asserted above: `Quantity` becomes **`Units`**, and `Destination` becomes **`To machine`**, `Destination slot` becomes **`Into slot`** — §7 names the columns `UNITS`, `TO MACHINE`, `INTO SLOT`. Update every existing assertion in this test file and in `StoreroomScreen.test.tsx` / `SlotEditSheet.test.tsx` that uses the old names. Run `grep -rn "Destination slot\|getByLabelText('Quantity')\|getByLabelText('Destination')" src/` first and fix each hit.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/adjustments/AdjustmentSheet.test.tsx`
Expected: FAIL — `Reason` is still a `<select>`, there is no `Result` cell, and the commit button reads `Record`.

- [ ] **Step 3: Implement**

Everything above `return (` in `AdjustmentSheet.tsx` stays exactly as it is, including `record()`, `needsDirection`, `destinationIsMachine`, and every comment. Add these derived values just above the return:

```tsx
  // §7's RESULT cell. Plain terms, both sides, before the commit — a
  // transfer is the one place this sheet can silently do the wrong thing,
  // and `recordTransfer` writes both rows atomically.
  const machineById = new Map(machines.map((m) => [m.id, m]))
  const magnitude = Number(quantity)
  const shownUnits = Number.isInteger(magnitude) && magnitude >= 1 ? magnitude : 0
  const here = location.kind === 'storeroom'
    ? 'Storeroom G'
    : `L${machineById.get(location.machineId)?.level ?? '?'}·${location.slotNumber}`
  const there = destination === 'storeroom'
    ? 'Storeroom G'
    : `L${machineById.get(destination)?.level ?? '?'}·${destinationSlot || '—'}`
  const sign = reason === 'transfer'
    ? 'down'
    : needsDirection
      ? (direction === 'more' ? 'up' : 'down')
      : (reasonSpec(reason).totalStock === 'increase' ? 'up' : 'down')

  // §7: "The commit button names the reason: `Record move`, `Record
  // delivery`. Not `Record`." Derived from the table, so a new reason gets a
  // sensible verb without an edit here.
  const commitLabel =
    reason === 'transfer' ? 'Record move'
      : reason === 'delivery' ? 'Record delivery'
      : reason === 'miscount' ? 'Record correction'
      : 'Record write-off'

  const spanning = reasons.filter((r) => r.reason === 'transfer')
  const tiles = reasons.filter((r) => r.reason !== 'transfer')
  const miscountWithheld = !reasons.some((r) => r.reason === 'miscount')
```

The render:

```tsx
  return (
    <div className="bg-paper">
      <div className="flex items-baseline justify-between bg-ink px-4 py-2.5 text-ground">
        <h3 className="text-[19px] font-extrabold">
          {location.kind === 'storeroom'
            ? 'Adjust storeroom stock'
            : `Adjust slot ${location.slotNumber}`}
        </h3>
      </div>

      <div className="border-b-2 border-rule-strong px-4 py-3">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
          Reason
        </span>
        {/* Reason first, because reason governs which fields exist below and
            which way the number goes. A `<select>` hid that: the destination
            and direction fields rendered below a control the operator had
            already scrolled past. */}
        <div className="mt-1.5 grid grid-cols-2 gap-px bg-rule-light">
          {tiles.map((r) => (
            <button
              key={r.reason}
              type="button"
              aria-pressed={reason === r.reason}
              onClick={() => setReason(r.reason)}
              className={`px-3 py-2.5 text-left text-[12.5px] font-bold ${
                reason === r.reason ? 'bg-accent text-ground' : 'bg-paper text-ink'
              }`}
            >
              {r.label}
            </button>
          ))}
          {spanning.map((r) => (
            <button
              key={r.reason}
              type="button"
              aria-pressed={reason === r.reason}
              onClick={() => setReason(r.reason)}
              className={`col-span-2 px-3 py-2.5 text-left text-[12.5px] font-bold ${
                reason === r.reason ? 'bg-accent text-ground' : 'bg-paper text-ink'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b-2 border-rule-strong bg-rule-light">
        <label className="flex flex-col gap-1 bg-paper px-4 py-3">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
            Units
          </span>
          <input
            aria-label="Units"
            type="number"
            inputMode="numeric"
            min={1}
            className="w-full border-b-2 border-ink bg-transparent pb-1 text-[24px] font-extrabold tabular-nums outline-none"
            value={quantity}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>

        <div
          aria-label="Result"
          className="flex flex-col justify-end gap-1 bg-neutral-100 px-4 py-3"
        >
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
            Result
          </span>
          <span className="text-[13px] font-bold tabular-nums">
            {here} {sign} {shownUnits}
          </span>
          {reason === 'transfer' && (
            <span className="text-[13px] font-bold tabular-nums">
              {there} up {shownUnits}
            </span>
          )}
        </div>

        {needsDirection && (
          <label className="col-span-2 flex flex-col gap-1 bg-paper px-4 py-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
              Correction direction
            </span>
            <select
              aria-label="Correction direction"
              className="border-b-2 border-ink bg-transparent pb-1 text-[13.5px] outline-none"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'more' | 'fewer')}
            >
              <option value="more">There are more than recorded</option>
              <option value="fewer">There are fewer than recorded</option>
            </select>
          </label>
        )}

        {reason === 'transfer' && (
          <label className="flex flex-col gap-1 bg-paper px-4 py-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
              To machine
            </span>
            <select
              aria-label="To machine"
              className="border-b-2 border-ink bg-transparent pb-1 text-[13.5px] outline-none"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              {/* The storeroom is only a destination when it is not also the
                  source — a transfer that starts and ends in the same place is
                  refused by `recordTransfer`, so it must not be offerable. */}
              {location.kind !== 'storeroom' && (
                <option value="storeroom">Storeroom G</option>
              )}
              {machines
                .filter((m) => location.kind !== 'machine' || m.id !== location.machineId)
                .map((m) => (
                  <option key={m.id} value={m.id}>L{m.level}</option>
                ))}
            </select>
          </label>
        )}

        {destinationIsMachine && (
          <label className="flex flex-col gap-1 bg-paper px-4 py-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
              Into slot
            </span>
            <input
              aria-label="Into slot"
              type="number"
              inputMode="numeric"
              className="w-full border-b-2 border-ink bg-transparent pb-1 text-[24px] font-extrabold tabular-nums outline-none"
              value={destinationSlot}
              onChange={(e) => setDestinationSlot(e.target.value)}
            />
          </label>
        )}
      </div>

      {/* Both known-gaps.md warnings, at the point of the mistake. */}
      {reason === 'transfer' && (
        <p className="bg-accent-200 px-4 py-2.5 text-[11px] font-medium text-accent-800">
          Only for stock moved between visits. If you moved it during this run,
          the two refilled-to counts already record it — logging it here as well
          subtracts it twice.
        </p>
      )}
      {location.kind === 'storeroom' && miscountWithheld && (
        <p className="bg-surface px-4 py-2.5 text-[11px] font-medium text-neutral-700">
          Miscount is not offered here. To correct the storeroom figure, type it
          into <strong>your count</strong> on the storeroom row instead — that
          resets the estimate to the truth.
        </p>
      )}

      {error && (
        <span
          role="alert"
          className="block bg-accent-200 px-4 py-2.5 text-[11px] font-bold text-accent-800"
        >
          {error}
        </span>
      )}

      <div className="flex border-t-2 border-rule-strong">
        <button
          type="button"
          onClick={() => void record()}
          className="flex-1 bg-accent px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-ground"
        >
          {commitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-ground px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-neutral-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/adjustments/ src/ui/storeroom/ src/ui/run/` then `npm test` and `npx tsc --noEmit`
Expected: all green, tsc clean. The `record()` behaviour tests that already exist must pass unmodified apart from the three renamed labels.

- [ ] **Step 5: Commit**

```bash
git add src/ui/adjustments/ src/ui/storeroom/ src/ui/run/
git commit -m "feat(adjustments): reason tiles, result cell and the two warnings (§7)"
```

---

### Task 3: Storeroom (§8)

The two numbers on the right of a row are the ledger estimate and the field you type into, with nothing saying which is which. This names them as columns.

**Files:**
- Modify: `src/ui/storeroom/StoreroomScreen.tsx` (render only; `useStoreroom` untouched)
- Test: `src/ui/storeroom/StoreroomScreen.test.tsx`

**Interfaces:**
- Consumes: `useStoreroom()` returning `{ items, units, verifiedAt, onHand, loading, setUnits, refresh }` — unchanged. `toBoxesAndLoose` / `fromBoxesAndLoose` from `src/domain/packs.ts` — unchanged.
- Produces: nothing. `StoreroomScreen` takes no props.

**What the screen becomes** (§8): a three-column grid, `1fr 62px 88px`, with an ink header reading `ITEM`, `APP ESTIMATE`, `YOUR COUNT`.

- Row: name at 14px/600; below it at 11px/500 the size, how long ago it was verified, and `Adjust` in `accent-700`. `Never verified` renders that whole line in `accent-700` **and** puts the 4px accent inset on the row.
- `App estimate`: 18px/800 tabular, read-only, `neutral-500` when it is zero and never verified.
- `Your count`: the input, right-aligned, in a 2px ink box — the only bordered field in the row, because it is the only editable thing.
- A legend below the list.
- The boxes + loose split and its `boxSize <= 1` degradation are unchanged. At a real carton size the cell is `[9] ×24 + [0]` with both figures at 17px/800.

**Ruling — `formatVerifiedAt` changes its wording.** §8 asks for "how long ago it was verified", where the current function renders a full locale timestamp (`Verified 27/08/2026, 9:14:02 am`) that cannot fit a 1fr cell beside a size. A relative formatter is added **in this file**, not in `src/domain/` — it is display copy for one screen, and Global Constraint 1 forbids a domain change. `Never verified` is unchanged, and is the string the accent treatment keys off.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('StoreroomScreen — §8 layout', () => {
  it('names the two figures as columns', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<StoreroomScreen />)
    await screen.findByText('Coke')

    const header = screen.getByTestId('storeroom-column-header')
    expect(header).toHaveTextContent(/Item/i)
    expect(header).toHaveTextContent(/App\s*estimate/i)
    expect(header).toHaveTextContent(/Your\s*count/i)
  })

  it('marks a never-verified row with the accent inset', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<StoreroomScreen />)
    const row = await screen.findByTestId('storeroom-row-Coke')

    expect(row.className).toContain('shadow-[inset_4px_0_0_var(--color-accent)]')
    expect(screen.getByText('Never verified')).toBeInTheDocument()
  })

  it('drops the inset once a count has been typed', async () => {
    const user = userEvent.setup()
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<StoreroomScreen />)
    await screen.findByText('Coke')

    const field = screen.getByLabelText('Coke units')
    await user.clear(field)
    await user.type(field, '12')

    await waitFor(() => {
      expect(screen.getByTestId('storeroom-row-Coke').className)
        .not.toContain('shadow-[inset_4px_0_0_var(--color-accent)]')
    })
    expect(screen.queryByText('Never verified')).not.toBeInTheDocument()
  })

  it('states what the app estimate is', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<StoreroomScreen />)
    await screen.findByText('Coke')
    expect(screen.getByText(/your last count plus every delivery/i)).toBeInTheDocument()
  })

  it('carries no rounded corner and no legacy palette class', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    const { container } = render(<StoreroomScreen />)
    await screen.findByText('Coke')
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/storeroom/StoreroomScreen.test.tsx`
Expected: FAIL — no `storeroom-column-header`, no `storeroom-row-*` test id, no legend.

- [ ] **Step 3: Implement**

Replace `formatVerifiedAt`:

```tsx
/** How long ago the shelf figure was confirmed, short enough to sit beside a
 * size in a 1fr cell (§8). `Never verified` is the string the row's accent
 * treatment keys off, so it is unchanged. Display copy for this screen only —
 * it does not belong in `src/domain/`. */
function formatVerifiedAt(timestamp: number | undefined): string {
  if (timestamp === undefined) return 'Never verified'
  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (days <= 0) return 'Verified today'
  if (days === 1) return 'Verified yesterday'
  if (days < 7) return `Verified ${days} days ago`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? 'Verified 1 week ago' : `Verified ${weeks} weeks ago`
}

const GRID = 'grid grid-cols-[1fr_62px_88px] items-center gap-2 px-4'
```

The body, replacing everything from the `<div className="p-4">` down to (but not including) the floating adjustment-sheet block, which stays as it is apart from removing `rounded-lg` from its inner wrapper:

```tsx
      <div className="border-b border-rule-light px-4 py-2">
        <input
          type="search"
          aria-label="Search storeroom"
          placeholder="Search storeroom"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border-b-2 border-ink bg-transparent pb-1 text-[13.5px] outline-none"
        />
      </div>

      <div
        data-testid="storeroom-column-header"
        className={`${GRID} bg-ink py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground`}
      >
        <span>Item</span>
        <span className="text-right leading-tight">App<br />estimate</span>
        <span className="text-right leading-tight">Your<br />count</span>
      </div>

      <ul>
        {filtered.map((item) => {
          const verified = verifiedAt.get(item.id)
          const neverVerified = verified === undefined
          const estimate = onHand.get(item.id) ?? 0
          return (
            <li
              key={item.id}
              data-testid={`storeroom-row-${item.name}`}
              className={`border-b border-rule-light bg-paper py-2.5 ${
                neverVerified ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''
              }`}
            >
              <div className={GRID}>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{item.name}</div>
                  <div
                    className={`text-[11px] font-medium ${
                      neverVerified ? 'text-accent-700' : 'text-neutral-700'
                    }`}
                  >
                    {item.size && <>{item.size} · </>}
                    {formatVerifiedAt(verified)}
                    {' · '}
                    <button
                      type="button"
                      aria-label={`Adjust ${item.name}`}
                      onClick={() => setAdjusting(item.id)}
                      className="font-bold text-accent-700"
                    >
                      Adjust
                    </button>
                  </div>
                </div>

                <span
                  aria-label={`${item.name} on hand`}
                  className={`text-right text-[18px] font-extrabold tabular-nums ${
                    estimate === 0 && neverVerified ? 'text-neutral-500' : 'text-ink'
                  }`}
                >
                  {estimate}
                </span>

                <QuantityField
                  item={item}
                  units={units.get(item.id) ?? 0}
                  // Same shape as useCounting's steppers: commit
                  // optimistically, persist behind it, swallow a rejected
                  // write here rather than let it surface as an unhandled
                  // rejection (no error surface is in scope for this screen
                  // either — see known-gaps.md).
                  onChange={(qty) => { void setUnits(item.id, qty).catch(() => {}) }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      <p className="bg-surface px-4 py-3 text-[11px] font-medium text-neutral-700">
        <strong>App estimate</strong> is your last count plus every delivery and
        adjustment since. Typing <strong>your count</strong> overrides it and the
        running total starts again from there.
      </p>
```

`QuantityField` keeps its logic and its three `aria-label`s exactly; only the classes change — the single field becomes `w-full border-2 border-ink bg-paper px-1.5 py-1 text-right text-[18px] font-extrabold tabular-nums outline-none`, and in the boxes+loose branch each of the two inputs becomes `w-[34px] border-2 border-ink bg-paper px-1 py-1 text-right text-[17px] font-extrabold tabular-nums outline-none` with the `×{boxSize} +` separator at `text-[10px] font-medium text-neutral-700`.

The `{countedCount} / {items.length} counted` line above the search is removed — the header eyebrow already says `LEDGER · 12 OF 60 VERIFIED`. Keep the `countedCount` computation; it feeds the eyebrow.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/storeroom/` then `npm test` and `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/ui/storeroom/
git commit -m "feat(storeroom): name the two figures as columns (§8)"
```

---

### Task 4: History and the visit receipt (§9)

One task, not two: the receipt's `READ ONLY` header is built by `HistoryScreen`, which owns the `ScreenLayout` all three levels render inside. Splitting them would leave a half-wired header between commits.

**Files:**
- Modify: `src/ui/history/HistoryScreen.tsx`
- Modify: `src/ui/history/VisitReceipt.tsx`
- Test: `src/ui/history/HistoryScreen.test.tsx`
- Test: `src/ui/history/VisitReceipt.test.tsx`

**Interfaces:**
- Consumes: `ScreenLayout`'s `stickyExtra?: ReactNode` prop (already exists, built in the previous round); `ScreenHeader`'s `{ eyebrow?, back?, state?, title, subtitle?, figure? }`.
- Produces: `VisitReceipt`'s prop `onBack: () => void` is **removed** — the back affordance moves into the `ScreenHeader` that `HistoryScreen` builds. Its remaining props are `{ visitId, machine }`. `HistoryScreen` takes no props, unchanged.

**What the screens become** (§9):

- **Runs list.** One row per run: date at 16px/800, then `Complete` or `In progress · 3 of 15 counted` in `accent-700`, and `15/15` at 19px/800 tabular on the right. An in-progress run carries the 4px accent inset.
- **The Receipts / Report toggle** becomes two half-width segments with an ink fill on the active one, sitting directly under the tab bar with `border-bottom: 2px rule-strong` — i.e. passed as `stickyExtra`, not rendered in the body.
- **Receipt.** The same four columns as the run screen — `30px 1fr 60px 60px` — with the same `COUNTED` / `REFILLED TO` heads, so the receipt reads as the table that was typed into. The `FILLED` pill comes out. Ran dry keeps the 4px inset. The header carries `READ ONLY` where the count screen says `COUNTING`. A legend below.

**Ruling — the run row does not show units or revenue.** §9's literal template is `Complete · 318 units · $1,583.50`. That figure needs `salesForRange(run.date, run.date)` per row, and `salesForRange` itself fans out to a history query per machine — so a fifteen-run list would issue well over a hundred queries on mount, against Global Constraint 2. The row shows `Complete` alone, with the `{finished}/{total}` figure on the right carrying the counting progress. The money is one tap away in Report, which is the screen that exists to compute it. **If wrong:** the operator cannot see a run's takings without opening Report and setting the dates to that run.

- [ ] **Step 1: Write the failing tests**

In `HistoryScreen.test.tsx`:

```tsx
describe('HistoryScreen — §9 layout', () => {
  it('marks an in-progress run with the accent inset and says how far it got', async () => {
    await saveMachine({ label: 'Lift lobby', level: 7 })
    await saveMachine({ label: 'Level 9', level: 9 })
    const run = await createRun('2026-08-27')
    await openVisit(run.id, (await listMachines())[0].id)

    render(<HistoryScreen />)
    const row = await screen.findByTestId('run-row-2026-08-27')

    expect(row.className).toContain('shadow-[inset_4px_0_0_var(--color-accent)]')
    expect(row).toHaveTextContent('In progress · 0 of 2 counted')
    expect(row).toHaveTextContent('0/2')
  })

  it('marks a fully counted run Complete with no inset', async () => {
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)
    await finalizeVisit(visit.id)

    render(<HistoryScreen />)
    const row = await screen.findByTestId('run-row-2026-08-27')

    expect(row.className).not.toContain('shadow-[inset_4px_0_0_var(--color-accent)]')
    expect(row).toHaveTextContent('Complete')
    expect(row).toHaveTextContent('1/1')
  })

  it('shows the Receipts / Report toggle as pressed segments', async () => {
    render(<HistoryScreen />)
    const receipts = await screen.findByRole('button', { name: 'Receipts' })
    expect(receipts).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Report' }))
      .toHaveAttribute('aria-pressed', 'false')
  })
})
```

In `VisitReceipt.test.tsx`:

```tsx
describe('VisitReceipt — §9 layout', () => {
  it('reads as the table that was typed into', async () => {
    const { visit, machine } = await seedVisit()
    render(<VisitReceipt visitId={visit.id} machine={machine} />)
    await screen.findByText('Coke')

    const header = screen.getByTestId('receipt-column-header')
    expect(header).toHaveTextContent(/SL/i)
    expect(header).toHaveTextContent(/Counted/i)
    expect(header).toHaveTextContent(/Refilled\s*to/i)
  })

  it('drops the FILLED pill — two named columns already say it', async () => {
    const { visit, machine } = await seedVisit()
    render(<VisitReceipt visitId={visit.id} machine={machine} />)
    await screen.findByText('Coke')
    expect(screen.queryByText(/^Filled$/i)).not.toBeInTheDocument()
  })

  it('marks a slot that reached zero with the accent inset', async () => {
    const { visit, machine } = await seedVisit()   // slot 58 was found at 2, slot 12 at 4
    render(<VisitReceipt visitId={visit.id} machine={machine} />)
    await screen.findByText('Coke')
    // Neither seeded line reached zero, so neither row is marked.
    expect(screen.getByLabelText('slot 58 record').className)
      .not.toContain('shadow-[inset_4px_0_0_var(--color-accent)]')
  })

  it('carries no rounded corner and no legacy palette class', async () => {
    const { visit, machine } = await seedVisit()
    const { container } = render(<VisitReceipt visitId={visit.id} machine={machine} />)
    await screen.findByText('Coke')
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
```

Every existing `VisitReceipt` render call in that file drops the `onBack` prop; any existing test that taps `← Back` inside the receipt is removed, because the affordance moves to the header that `HistoryScreen` owns.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/history/`
Expected: FAIL — no `run-row-*` or `receipt-column-header` test ids, the toggle buttons carry no `aria-pressed`, and `VisitReceipt` still requires `onBack`.

- [ ] **Step 3: Implement**

`HistoryScreen.tsx`. Replace the `toggle` block with a sticky segmented control:

```tsx
  const toggle = (
    <div className="flex border-b-2 border-rule-strong">
      {(['receipts', 'report'] as const).map((name) => (
        <button
          key={name}
          type="button"
          aria-pressed={view === name}
          onClick={() => setView(name)}
          className={`flex-1 px-4 py-2.5 text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] ${
            view === name ? 'bg-ink text-ground' : 'bg-ground text-neutral-700'
          }`}
        >
          {name === 'receipts' ? 'Receipts' : 'Report'}
        </button>
      ))}
    </div>
  )
```

Header is now built per level rather than shared:

```tsx
  const listHeader = (
    <ScreenHeader eyebrow={`${runs.length} RUNS RECORDED`} title="History" />
  )
```

The report view and the runs list both pass `stickyExtra={toggle}` and drop `{toggle}` from the body:

```tsx
  if (view === 'report') {
    return (
      <ScreenLayout header={listHeader} stickyExtra={toggle}>
        <ReportScreen />
      </ScreenLayout>
    )
  }
```

The receipt level builds its own header and drops `onBack` from the child:

```tsx
  if (openRun && openVisit) {
    const machine = machineById.get(openVisit.machineId)
    if (machine) {
      return (
        <ScreenLayout
          header={
            <ScreenHeader
              back={{ label: `← ${formatRunDate(openRun.date)}`, onClick: () => setOpenVisit(null) }}
              state="READ ONLY"
              title={`L${machine.level}`}
              subtitle={distinctLabel(machine)}
            />
          }
        >
          <VisitReceipt visitId={openVisit.id} machine={machine} />
        </ScreenLayout>
      )
    }
  }
```

The run drill-down replaces its inline `← Back` row with a header, and restyles its machine rows to the row language (1px rule under, `bg-paper`, no border box, the finished/in-progress pills replaced per `tokens.md`: a filled ink 20px square with a tick for finished, `accent-700` metadata text for in progress):

```tsx
    return (
      <ScreenLayout
        header={
          <ScreenHeader
            back={{ label: '← RUNS', onClick: () => setOpenRun(null) }}
            title={formatRunDate(openRun.date)}
            figure={`${visits.filter((v) => v.status === 'finalized').length}/${machines.length}`}
          />
        }
      >
        {visits.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-neutral-500">
            No machines were counted in this run.
          </p>
        ) : (
          <ul>
            {visits.map((visit) => {
              const machine = machineById.get(visit.machineId)
              return (
                <li key={visit.id} className="border-b border-rule-light bg-paper">
                  <button
                    type="button"
                    aria-label={`visit to L${machine?.level ?? '?'}`}
                    onClick={() => setOpenVisit(visit)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  >
                    <span className="text-[15px] font-extrabold tabular-nums">
                      L{machine?.level ?? '?'}
                    </span>
                    {machine && distinctLabel(machine) && (
                      <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-700">
                        {distinctLabel(machine)}
                      </span>
                    )}
                    <span className="flex-1" />
                    {visit.status === 'finalized' ? (
                      <span
                        aria-label="Finished"
                        className="flex h-5 w-5 items-center justify-center bg-ink text-[11px] font-extrabold text-ground"
                      >
                        ✓
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent-700">
                        In progress
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ScreenLayout>
    )
```

The runs list itself:

```tsx
  return (
    <ScreenLayout header={listHeader} stickyExtra={toggle}>
      {runs.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-neutral-500">No runs recorded yet.</p>
      ) : (
        <ul>
          {runs.map((run) => {
            const finished = (visitsByRun.get(run.id) ?? [])
              .filter((v) => v.status === 'finalized').length
            const inProgress = finished < machines.length
            return (
              <li
                key={run.id}
                data-testid={`run-row-${run.date}`}
                className={`border-b border-rule-light bg-paper ${
                  inProgress ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''
                }`}
              >
                <button
                  type="button"
                  aria-label={`run ${run.date}`}
                  onClick={() => setOpenRun(run)}
                  className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-extrabold">
                      {formatRunDate(run.date)}
                    </span>
                    <span
                      className={`block text-[11px] font-medium ${
                        inProgress ? 'text-accent-700' : 'text-neutral-700'
                      }`}
                    >
                      {inProgress
                        ? `In progress · ${finished} of ${machines.length} counted`
                        : 'Complete'}
                    </span>
                  </span>
                  <span className="shrink-0 text-[19px] font-extrabold tabular-nums">
                    {finished}/{machines.length}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </ScreenLayout>
  )
```

The loading branch keeps `<ScreenLayout header={<ScreenHeader title="History" />}>` with the body restyled to `px-4 py-3 text-[13px]`.

`VisitReceipt.tsx`: drop the `onBack` prop and the whole `<div className="mb-3 flex …">` back row, and render the four-column table. Ran dry is `line.after === 0` — the receipt shows what was recorded, so a slot left at zero is the one that "had reached zero":

```tsx
const GRID = 'grid grid-cols-[30px_1fr_60px_60px] items-center gap-2 px-3.5'

export function VisitReceipt({
  visitId, machine,
}: {
  visitId: Id
  machine: Machine
}) {
```

`machine` stays a prop because the effect and the empty state read it; if `tsc` reports it unused after the back row is removed, keep it and reference it in the empty-state copy rather than deleting a prop the caller must still pass.

```tsx
  if (loading) return <div className="px-4 py-3 text-[13px]">Loading…</div>

  return (
    <div>
      <div
        data-testid="receipt-column-header"
        className={`${GRID} bg-ink py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground`}
      >
        <span>SL</span>
        <span>Item</span>
        <span className="text-center">Counted</span>
        <span className="text-center leading-tight">Refilled<br />to</span>
      </div>

      {lines.length === 0 ? (
        // An abandoned machine has a draft visit and no lines. A blank screen
        // here reads as data loss, so say which it is.
        <p className="px-4 py-3 text-[13px] text-neutral-500">
          Nothing was recorded for this machine.
        </p>
      ) : (
        <ul>
          {lines.map((line) => (
            <li
              key={line.id}
              aria-label={`slot ${line.slotNumber} record`}
              className={`border-b border-rule-light bg-paper ${
                line.after === 0 ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''
              }`}
            >
              <div className={`${GRID} h-[46px]`}>
                <span className="text-[15px] font-extrabold tabular-nums">
                  {line.slotNumber}
                </span>
                <span className="truncate text-[13px] font-semibold">
                  {items.get(line.itemId)?.name ?? 'Deleted item'}
                </span>
                <span className="border-x border-rule-light text-center text-[19px] font-extrabold tabular-nums">
                  {line.before}
                </span>
                <span className="border-x border-rule-light bg-surface text-center text-[19px] font-extrabold tabular-nums">
                  {line.after}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="bg-surface px-4 py-3 text-[11px] font-medium text-neutral-700">
        <strong>Counted</strong> is what was in the slot on arrival;{' '}
        <strong>refilled to</strong> is what was left behind. A red edge marks a
        slot that had reached zero.
      </p>
    </div>
  )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/history/` then `npm test` and `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/ui/history/
git commit -m "feat(history): run rows, sticky toggle and a receipt that reads as the table (§9)"
```

---

### Task 5: Report (§10)

**Files:**
- Modify: `src/ui/report/ReportScreen.tsx`
- Test: `src/ui/report/ReportScreen.test.tsx`

**Interfaces:**
- Consumes: `useReport(from, to)` returning `{ reports, items, machines, storeroomOnHand, levelsByMachine, matrixRows, loading }` — unchanged. `latestRunDate()` — unchanged. `StockMatrix` — unchanged in this task; Task 6 restyles it.
- Produces: nothing. `ReportScreen` takes no props.

**What the screen becomes** (§10):

- **From / To** become two cells of a 1px-ruled grid, each a 15px/700 tabular figure on a 2px ink underline. No boxes.
- **The sold total is the one poster moment in the app**: a full-bleed accent field, `padding: 18px 16px 20px`, ground text. Eyebrow `SOLD · RUN OF WED 20 AUG` at 10px/700 uppercase at **full opacity** — do not tint it; the accent-to-ground pair is only 4.2:1 at full strength. `318` at 50px/800 tabular with `units` at 15px/600 on its baseline, `$1,583.50` at 27px/800 tabular below.
- Directly beneath, on an `accent-200` band in `accent-800`, the censored-lines warning. It is currently amber small print inside the totals card, which is the one thing on this screen that must not read as decoration.
- **Stock on hand** becomes three equal cells on 1px rules: `IN MACHINES`, `STOREROOM`, `ON HAND NOW` at 21px/800 tabular, the third on a `surface` fill. Still a current figure read from latest recorded levels, never a sum over the range.
- **Sales lines** become a table, ink header, `grid-template-columns: 30px 26px 1fr 40px 62px` (LV SL ITEM SOLD REVENUE). A censored line drops the two figure columns and spans them with the reason in `accent-800` on a `neutral-100` row. A ran-dry line keeps the 4px inset and a small `DRY` in `accent-700` after the name. `Edited late` keeps its label at the same treatment.
- Footer strip: `Stock matrix — 60 items × 15 machines` with `TURN PHONE ⟳` in `accent-700`.

The three `CENSORED_REASONS` strings are unchanged. The `units` / `revenue` / `censoredLines` / `inMachines` / `inStoreroom` computations and every comment above the `return` are unchanged.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('ReportScreen — §10 layout', () => {
  it('states the sold total as a poster figure with its period', async () => {
    await seedTwoFinalizedVisits()   // the file's existing helper
    render(<ReportScreen />)

    const sold = await screen.findByLabelText('report totals')
    expect(sold.className).toContain('bg-accent')
    expect(sold).toHaveTextContent(/^SOLD · RUN OF /)
    expect(sold).toHaveTextContent('units')
  })

  it('puts the censored warning on its own band, not inside the totals', async () => {
    await seedCensoredLine()   // the file's existing helper
    render(<ReportScreen />)

    const warning = await screen.findByLabelText('censored lines')
    expect(warning.className).toContain('bg-accent-200')
    expect(warning).toHaveTextContent(/not in the totals above/)
  })

  it('names the three stock-on-hand cells', async () => {
    await seedTwoFinalizedVisits()
    render(<ReportScreen />)

    const onHand = await screen.findByLabelText('stock on hand')
    expect(onHand).toHaveTextContent(/In machines/i)
    expect(onHand).toHaveTextContent(/Storeroom/i)
    expect(onHand).toHaveTextContent(/On hand now/i)
  })

  it('tells the operator the matrix needs landscape', async () => {
    await seedTwoFinalizedVisits()
    render(<ReportScreen />)
    expect(await screen.findByText(/TURN PHONE/)).toBeInTheDocument()
  })

  it('carries no rounded corner and no legacy palette class', async () => {
    await seedTwoFinalizedVisits()
    const { container } = render(<ReportScreen />)
    await screen.findByLabelText('report totals')
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
```

If the file has no `seedTwoFinalizedVisits` / `seedCensoredLine` helper under those names, reuse whatever seeding the existing `describe` block already does — do not invent a new fixture layer.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/report/ReportScreen.test.tsx`
Expected: FAIL — the totals block is `bg-gray-50`, there is no `censored lines` label, and no `TURN PHONE`.

- [ ] **Step 3: Implement**

Add, above the `return`:

```tsx
/** The period as an eyebrow. `formatRunDate` carries a year the poster field
 * has no room for, so it is trimmed here rather than by adding a second
 * formatter to `src/domain/date.ts` — this is display copy for one field. */
function periodLabel(from: string, to: string): string {
  const short = (d: string) => formatRunDate(d).replace(/ \d{4}$/, '').toUpperCase()
  return from === to ? `SOLD · RUN OF ${short(from)}` : `SOLD · ${short(from)} – ${short(to)}`
}
```

Import `formatRunDate` from `../../domain/date`.

The render:

```tsx
  return (
    <div>
      <div className="grid grid-cols-2 gap-px border-b-2 border-rule-strong bg-rule-light">
        {([['From', from, setFrom], ['To', to, setTo]] as const).map(([label, value, set]) => (
          <label key={label} className="flex flex-col gap-1 bg-paper px-4 py-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
              {label}
            </span>
            <input
              aria-label={label}
              type="date"
              className="w-full border-b-2 border-ink bg-transparent pb-1 text-[15px] font-bold tabular-nums outline-none"
              value={value}
              onChange={(e) => set(e.target.value)}
            />
          </label>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-neutral-500">
          Nothing to report yet — a period closes when a machine is finished for
          a second time.
        </p>
      ) : (
        <>
          {/* The one poster moment in the app. The eyebrow is at full
              opacity, never tinted: accent-to-ground is only 4.2:1 at full
              strength and any tint takes it below the floor. */}
          <div
            aria-label="report totals"
            className="bg-accent px-4 pb-5 pt-[18px] text-ground"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.12em]">
              {periodLabel(from, to)}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[50px] font-extrabold leading-none tabular-nums">
                {units}
              </span>
              <span className="text-[15px] font-semibold">units</span>
            </div>
            <div className="mt-1 text-[27px] font-extrabold tabular-nums">
              ${money(revenue)}
            </div>
          </div>

          {censoredLines > 0 && (
            <p
              aria-label="censored lines"
              className="bg-accent-200 px-4 py-2.5 text-[11px] font-bold text-accent-800"
            >
              {censoredLines} {censoredLines === 1 ? 'line' : 'lines'} not counted
              — no figure exists for {censoredLines === 1 ? 'it' : 'them'}, so{' '}
              {censoredLines === 1 ? 'it is' : 'they are'} not in the totals above.
            </p>
          )}

          <div
            aria-label="stock on hand"
            className="grid grid-cols-3 gap-px border-y-2 border-rule-strong bg-rule-light"
          >
            {([
              ['In machines', inMachines, 'bg-paper'],
              ['Storeroom', inStoreroom, 'bg-paper'],
              ['On hand now', inMachines + inStoreroom, 'bg-surface'],
            ] as const).map(([label, value, fill]) => (
              <div key={label} className={`${fill} px-4 py-3`}>
                <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700">
                  {label}
                </div>
                <div className="mt-0.5 text-[21px] font-extrabold tabular-nums">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[30px_26px_1fr_40px_62px] items-center gap-2 bg-ink px-3.5 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground">
            <span>LV</span>
            <span>SL</span>
            <span>Item</span>
            <span className="text-right">Sold</span>
            <span className="text-right">Revenue</span>
          </div>

          <ul>
            {reports.flatMap((report) =>
              report.lines.map((line) => {
                const level = machineById.get(report.machineId)?.level ?? '?'
                const censored = line.sold === null
                return (
                  <li
                    key={`${report.visit.id}-${line.slotNumber}-${line.itemId}`}
                    aria-label={`L${level} slot ${line.slotNumber} sales`}
                    className={`border-b border-rule-light ${
                      censored ? 'bg-neutral-100' : 'bg-paper'
                    } ${line.ranDry ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''}`}
                  >
                    <div className="grid grid-cols-[30px_26px_1fr_40px_62px] items-center gap-2 px-3.5 py-2">
                      <span className="text-[13px] font-extrabold tabular-nums">L{level}</span>
                      <span className="text-[13px] tabular-nums text-neutral-700">
                        {line.slotNumber}
                      </span>
                      <span className="min-w-0 truncate text-[13px] font-semibold">
                        {items.get(line.itemId)?.name ?? 'Deleted item'}
                        {line.ranDry && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-700">
                            Dry
                          </span>
                        )}
                        {report.editedLate && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-700">
                            Edited late
                          </span>
                        )}
                      </span>
                      {censored ? (
                        <span className="col-span-2 text-right text-[11px] font-medium text-accent-800">
                          Not counted —{' '}
                          {line.censoredReason
                            ? CENSORED_REASONS[line.censoredReason]
                            : 'reason not recorded'}
                        </span>
                      ) : (
                        <>
                          <span className="text-right text-[15px] font-extrabold tabular-nums">
                            {line.sold}
                          </span>
                          <span className="text-right text-[15px] font-extrabold tabular-nums">
                            ${money(line.revenue ?? 0)}
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                )
              }),
            )}
          </ul>

          <div className="flex items-baseline justify-between border-t-2 border-rule-strong bg-surface px-4 py-2.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-700">
              Stock matrix — {matrixRows.length} items × {machines.length} machines
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent-700">
              Turn phone ⟳
            </span>
          </div>
          <StockMatrix rows={matrixRows} machines={machines} />
        </>
      )}
    </div>
  )
```

The loading branch becomes `<div className="px-4 py-3 text-[13px]">Loading…</div>`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/report/` then `npm test` and `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/ui/report/ReportScreen.tsx src/ui/report/ReportScreen.test.tsx
git commit -m "feat(report): the sold field as a poster, and sales lines as a table (§10)"
```

---

### Task 6: Stock matrix (§11)

Structure unchanged — it works, and a screenshot of it is the deliverable. Restyle only. Do not change which rows or columns exist, their order, or the `aria-label`s.

**Files:**
- Modify: `src/ui/report/StockMatrix.tsx`
- Test: `src/ui/report/StockMatrix.test.tsx`

**Interfaces:**
- Consumes: `MatrixRow` from `src/domain/stockMatrix.ts` — `{ key, itemName, size?, perMachine: Map<Id, number>, storeroom, total }`. Unchanged.
- Produces: no prop changes. `StockMatrix` takes `{ rows, machines }`.

**What changes** (§11):

- Header row: ink fill, ground text, 9.5px/700 uppercase.
- Machine toggles: filled ink when shown; `surface` with `line-through` when hidden. **Not accent** — fifteen accent chips would spend the colour budget on a control.
- `border-left: 2px` on the GF column, so the machine columns read as one block and GF / Total / Order as the summary.
- **Order gets an accent header and an `accent-100` fill.** It is the only column that is the operator's rather than the app's, and it must be obviously blank in a screenshot.
- A zero in a machine cell renders `accent-700`.
- Rows alternate `paper` / `neutral-100`.
- Footer legend.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('StockMatrix — §11 restyle', () => {
  it('marks Order as the operator column, not the app column', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    const header = screen.getByRole('columnheader', { name: 'Order' })
    expect(header.className).toContain('text-accent')

    const cell = screen.getByLabelText(`order for ${ROWS[0].key}`)
    expect(cell.className).toContain('bg-accent-100')
    expect(cell).toBeEmptyDOMElement()
  })

  it('strikes a hidden machine through rather than colouring fifteen chips', async () => {
    const user = userEvent.setup()
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)

    const toggle = screen.getByRole('button', { name: `Hide L${MACHINES[0].level}` })
    expect(toggle.className).toContain('bg-ink')
    await user.click(toggle)

    const hidden = screen.getByRole('button', { name: `Show L${MACHINES[0].level}` })
    expect(hidden.className).toContain('line-through')
    expect(hidden.className).not.toContain('bg-accent')
  })

  it('separates the summary columns from the machine block', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    expect(screen.getByRole('columnheader', { name: 'GF' }).className)
      .toContain('border-l-2')
  })

  it('says what the Order column is for', () => {
    render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    expect(screen.getByText(/Order stays blank for your pen/)).toBeInTheDocument()
  })

  it('carries no rounded corner and no legacy palette class', () => {
    const { container } = render(<StockMatrix rows={ROWS} machines={MACHINES} />)
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
```

Reuse the `ROWS` / `MACHINES` fixtures the existing tests in this file build; if they are inline, hoist them to module constants first.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/report/StockMatrix.test.tsx`
Expected: FAIL — the Order header carries no accent, the toggles are `bg-blue-600`, GF has no left rule, no legend.

- [ ] **Step 3: Implement**

The toggle row:

```tsx
      <div className="flex flex-wrap gap-px bg-rule-light">
        {machines.map((m) => {
          const isHidden = hidden.has(m.id)
          return (
            <button
              key={m.id}
              type="button"
              aria-label={`${isHidden ? 'Show' : 'Hide'} L${m.level}`}
              aria-pressed={!isHidden}
              onClick={() => toggle(m.id)}
              // Ink, not accent: fifteen accent chips would spend the whole
              // screen's colour budget on a control (§11).
              className={`px-2.5 py-1.5 text-[11px] font-bold tabular-nums ${
                isHidden
                  ? 'bg-surface text-neutral-600 line-through'
                  : 'bg-ink text-ground'
              }`}
            >
              L{m.level}
            </button>
          )
        })}
      </div>
```

The table. Header cells are `px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.10em]` on `bg-ink text-ground`; `GF` additionally carries `border-l-2 border-rule-strong`; `Order` carries `text-accent`:

```tsx
      {/* The only horizontally scrolling surface in the app. Every other
          screen is a phone-width column and should stay one. */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="bg-ink text-left text-ground">
              <th scope="col" className="px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.10em]">Slot</th>
              <th scope="col" className="px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.10em]">Item</th>
              <th scope="col" className="px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.10em]">Qty</th>
              {shown.map((m) => (
                <th key={m.id} scope="col" className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.10em]">
                  L{m.level}
                </th>
              ))}
              <th scope="col" className="border-l-2 border-rule-strong px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.10em]">GF</th>
              <th scope="col" className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.10em]">Total</th>
              <th scope="col" className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.10em] text-accent">Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.key}
                aria-label={`stock row ${row.key}`}
                // At 60 rows by 12 columns, banding is what keeps a
                // screenshot readable (§11).
                className={`border-b border-rule-light ${i % 2 === 0 ? 'bg-paper' : 'bg-neutral-100'}`}
              >
                <td className="whitespace-nowrap px-2 py-1.5 text-[15px] font-extrabold tabular-nums">
                  {row.key}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-[13px] font-semibold">
                  {row.itemName}
                </td>
                <td className="px-2 py-1.5 text-[11px] font-medium text-neutral-700">
                  {row.size ?? ''}
                </td>
                {shown.map((m) => {
                  const value = row.perMachine.get(m.id) ?? 0
                  return (
                    <td
                      key={m.id}
                      className={`px-2 py-1.5 text-right text-[15px] font-extrabold tabular-nums ${
                        value === 0 ? 'text-accent-700' : 'text-ink'
                      }`}
                    >
                      {value}
                    </td>
                  )
                })}
                <td className="border-l-2 border-rule-strong px-2 py-1.5 text-right text-[15px] font-extrabold tabular-nums">
                  {row.storeroom}
                </td>
                <td className="px-2 py-1.5 text-right text-[15px] font-extrabold tabular-nums">
                  {row.total}
                </td>
                {/* Blank by design — Phase 3 fills it; until then it is
                    hand-written, exactly as on the paper sheet. The tint
                    says whose column it is. */}
                <td
                  aria-label={`order for ${row.key}`}
                  className="bg-accent-100 px-2 py-1.5"
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="bg-surface px-4 py-3 text-[11px] font-medium text-neutral-700">
        Order stays blank for your pen until Phase 3 fills it — the red header
        marks it as the column that is yours, not the app&rsquo;s. A red figure
        is a machine at zero.
      </p>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/report/` then `npm test` and `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/ui/report/StockMatrix.tsx src/ui/report/StockMatrix.test.tsx
git commit -m "feat(report): restyle the stock matrix, Order as the operator's column (§11)"
```

---

### Task 7: Items list (§12, list half)

**Files:**
- Modify: `src/ui/items/ItemListScreen.tsx`
- Test: `src/ui/items/ItemListScreen.test.tsx`

**Interfaces:**
- Consumes: `TRAYS`, `trayOf`, `trayLabel` from `src/domain/trays.ts`; `Item` from types. Unchanged.
- Produces: no prop changes. `ItemListScreen` takes `{ onSelect, onNew }`.

**What the screen becomes** (§12, list):

- Row grid `34px 1fr auto`: base slot, then name at 14.5px/600 with `27g · box of 1` beneath, then price at 15px/800 tabular with `par 5` under it. Price and par become **figures** instead of running together in one grey caption.
- Tray group headings become `surface` bars with a category word: `TRAY 1 · CHIPS`.
- A `remark` becomes a short `accent-200` tag — `SIZE UNVERIFIED` — not three lines of italic amber that outweigh the item name. The full remark shows on the edit screen.

**Ruling — the category words are a UI constant, not a data field.** `Item` has no `category` and Global Constraint 1 forbids adding one. The words come from `docs/catalogue-transcription.md`, which titles each tray: 10 chips, 20 sundries, 30 chocolate, 40 juice/energy/water, 50 cans, 60 alcohol. Tray 40's three words do not fit a bar, so it takes §12's own example word, `DRINKS`. A tray with no entry renders the bare `TRAY 1`. **If wrong:** the words drift from a catalogue that is reorganised, and the fix is one line in one file.

**Ruling — the remark tag is the remark, uppercased and truncated, not a classification.** §12's example is `SIZE UNVERIFIED`, which is what the seeded remarks actually say. Deriving a tag vocabulary would be inventing data. The tag renders the remark's first three words uppercased, with the full string as `title` and as the tag's `aria-label`, and the edit screen keeps showing all of it.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('ItemListScreen — §12 layout', () => {
  it('names the tray category in the group bar', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)
    expect(await screen.findByText('TRAY 5 · CANS')).toBeInTheDocument()
  })

  it('shows the base slot, price and par as separate figures', async () => {
    const chips = await saveItem({
      name: 'Salt & Vinegar Chips', price: 3.5, basePar: 5, boxSize: 1, size: '27g',
    })
    await setPlacement(chips.id, { kind: 'base' }, [10])
    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

    const row = await screen.findByTestId(`item-row-${chips.id}`)
    expect(row).toHaveTextContent('10')
    expect(row).toHaveTextContent('27g · box of 1')
    expect(row).toHaveTextContent('$3.50')
    expect(row).toHaveTextContent('par 5')
  })

  it('shows a remark as a short tag, not three lines of prose', async () => {
    const item = await saveItem({
      name: 'Mother Energy Drink', price: 5.5, basePar: 5, boxSize: 1,
      remark: 'size unverified from the photo',
    })
    await setPlacement(item.id, { kind: 'base' }, [44])
    render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)

    const tag = await screen.findByLabelText('size unverified from the photo')
    expect(tag.className).toContain('bg-accent-200')
    expect(tag).toHaveTextContent('SIZE UNVERIFIED FROM')
  })

  it('carries no rounded corner and no legacy palette class', async () => {
    await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    const { container } = render(<ItemListScreen onSelect={vi.fn()} onNew={vi.fn()} />)
    await screen.findByText('Coke')
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/items/ItemListScreen.test.tsx`
Expected: FAIL — the bar reads `Tray 5`, there is no `item-row-*` test id, and the remark renders as italic amber prose.

- [ ] **Step 3: Implement**

Module constants:

```tsx
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
```

The base slot is already computed for grouping; expose it per item so the row can show it. Extend the existing `traysByItemId` memo to a second memo over the same `placements` array — no new query:

```tsx
  const baseSlotByItemId = useMemo(() => {
    const map = new Map<Id, number>()
    for (const p of placements) {
      if (p.scope.kind !== 'base') continue
      const first = [...p.slots].sort((a, b) => a - b)[0]
      if (first !== undefined) map.set(p.itemId, first)
    }
    return map
  }, [placements])
```

`ItemRow` takes the extra figure:

```tsx
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
```

The body loses its `p-4` wrapper, its duplicate `<h2>Items</h2>` (the `ScreenHeader` owns the title), and its box borders:

```tsx
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
```

Note the accent budget: `+ New` is `accent-700` **text**, and `Load starter catalogue` is the one accent fill — and it only exists when the catalogue is empty, so the two never both count as the screen's accent action against a populated list.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/items/ItemListScreen.test.tsx` then `npm test` and `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/ui/items/ItemListScreen.tsx src/ui/items/ItemListScreen.test.tsx
git commit -m "feat(items): tray categories, figures and a remark tag on the list (§12)"
```

---

### Task 8: Item edit (§12, edit half)

The slot picker is the defect: today it is a `flex-wrap` of 36px buttons inside a row that already spends 56px on a tray label, so tray rows overflow at 393pt.

**Files:**
- Modify: `src/ui/items/ItemEditScreen.tsx`
- Modify: `src/ui/components/ScreenHeader.tsx` (one type widening — see Interfaces)
- Test: `src/ui/items/ItemEditScreen.test.tsx`

**Interfaces:**
- Consumes: `TRAYS`, `allSlotsInTray`, `trayLabel` from `src/domain/trays.ts` — unchanged.
- Produces: `ScreenHeader`'s prop `title: string` widens to `title: ReactNode`. Every existing caller passes a string, which is a `ReactNode`, so no call site changes. This is what lets §12's "name is the screen title, edited in place" be literally true: `ItemEditScreen` passes an `<input>`. `input` is phrasing content, so it is valid inside the `<h1>`.
- `ItemEditScreen`'s own props are unchanged: `{ itemId?, onDone }`.

**What the screen becomes** (§12, edit):

- Name is the screen title, edited in place.
- The four value fields become a 2×2 grid of figures at 21px/800 on 2px underlines: `PRICE`, `PAR LEVEL · REQUIRED`, `BOX SIZE`, `PACK SIZE`. Par's underline and label are **accent** — it is the only required one and already says so. (`PACK SIZE` is the existing optional `size` text field, e.g. `375ml`, `27g`; it is the fourth cell of the grid and stays a text input.)
- Remark is a full-width field below the grid.
- **The slot picker spans the full width in a 10-column grid**, one row per tray, tray number in a 16px gutter. At `repeat(10, 1fr)` a cell is ~31px and the whole machine reads as a shape. Selected cells are accent fill. Multiple selection is unchanged — three catalogue items legitimately occupy two slots each.
- Delete keeps its two-tap confirm and sits in the footer beside Save, as `accent-700` text on ground against Save's accent fill.

Tray 1 is short (10–14), so its row fills the first five columns and leaves five empty. That is correct and is what makes the machine read as a shape.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('ItemEditScreen — §12 layout', () => {
  it('edits the name in place as the screen title', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<ItemEditScreen itemId={coke.id} onDone={vi.fn()} />)

    const name = await screen.findByLabelText('Name')
    expect(name).toHaveValue('Coke')
    expect(name.closest('h1')).not.toBeNull()

    await user.clear(name)
    await user.type(name, 'Coke No Sugar')
    expect(name).toHaveValue('Coke No Sugar')
  })

  it('marks par level as the only required figure', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<ItemEditScreen itemId={coke.id} onDone={vi.fn()} />)

    const par = await screen.findByLabelText('Par level')
    expect(par.className).toContain('border-accent')
    expect(screen.getByLabelText('Price').className).toContain('border-ink')
  })

  it('lays every tray out as a ten-column row', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<ItemEditScreen itemId={coke.id} onDone={vi.fn()} />)

    const picker = await screen.findByTestId('slot-picker')
    expect(picker.className).toContain('grid-cols-[16px_repeat(10,1fr)]')
    // Tray 1 is short: 10–14 only.
    expect(screen.getByRole('button', { name: 'Slot 14' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Slot 15' })).not.toBeInTheDocument()
  })

  it('fills a selected slot with the accent', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<ItemEditScreen itemId={coke.id} onDone={vi.fn()} />)

    const slot = await screen.findByRole('button', { name: 'Slot 58' })
    await user.click(slot)
    expect(slot).toHaveAttribute('aria-pressed', 'true')
    expect(slot.className).toContain('bg-accent')
  })

  it('keeps delete as text beside an accent Save', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    render(<ItemEditScreen itemId={coke.id} onDone={vi.fn()} />)

    const del = await screen.findByRole('button', { name: 'Delete item' })
    expect(del.className).toContain('text-accent-700')
    expect(del.className).not.toContain('bg-accent')
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('bg-accent')
  })

  it('carries no rounded corner and no legacy palette class', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 1 })
    const { container } = render(<ItemEditScreen itemId={coke.id} onDone={vi.fn()} />)
    await screen.findByLabelText('Name')
    expect(container.innerHTML).not.toMatch(/rounded-/)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:gray|blue|red|green|emerald|amber)-/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/items/ItemEditScreen.test.tsx`
Expected: FAIL — the name field is not inside the `<h1>`, there is no `slot-picker` test id, and Delete is `bg-red-600` in its confirm state.

- [ ] **Step 3: Implement**

`src/ui/components/ScreenHeader.tsx` — widen one type and import the node type:

```tsx
import type { ReactNode } from 'react'

  /** Usually the screen name. `ReactNode` rather than `string` so the item
   * editor can put its name field here and edit the title in place (§12);
   * `input` is phrasing content, so it is valid inside the `h1`. */
  title: ReactNode
```

`ItemEditScreen.tsx`. The header:

```tsx
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
```

A reusable figure cell, declared above the component:

```tsx
/** One cell of §12's 2×2 figure grid. Par is the only required field, so it
 * is the only one whose label and underline are accent. */
function FigureField({
  label, value, onChange, required = false, type = 'number', step,
}: {
  label: string
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
        aria-label={label}
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
```

The body:

```tsx
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
          label="Pack size" type="text"
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
```

Import `Fragment` from `react`. The separate `Name` label block is deleted — the header input replaces it, and it keeps the same `aria-label="Name"` the existing tests use.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/items/ src/ui/components/` then `npm test` and `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/ui/items/ItemEditScreen.tsx src/ui/items/ItemEditScreen.test.tsx src/ui/components/ScreenHeader.tsx
git commit -m "feat(items): figure grid, in-place name and a ten-column slot picker (§12)"
```

---

## Final verification (not a task — the controller runs this)

The previous round's most expensive lesson: three separate implementer reports each claimed "470 passing" in good faith and each was true of the run they saw, while a 1-in-5 flake sat in the suite. Single-run verification cannot see that.

- [ ] Run the full suite **five times**: `for i in 1 2 3 4 5; do npm test || echo "FAILED ON RUN $i"; done`. Any failure is a finding, not a retry.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run build` — clean, **zero warnings**. A warning here is what hid the stripped font `@import` last round.
- [ ] Radius sweep: `grep -rn "rounded-" src/ui/` returns nothing but test-file comments.
- [ ] Palette sweep: `grep -rnE "(bg|text|border)-(gray|blue|red|green|emerald|amber)-" src/ui/` returns nothing.
- [ ] **Real browser, all eight screens.** jsdom cannot see layout. `npm run dev` and check at 393px width: no horizontal overflow on any screen (`scrollWidth === clientWidth` on the scroll container), the History toggle sticks below the tab bar without overlapping it, the item edit slot picker's six tray rows fit the width, and the report's 50px sold figure does not push its field wide. This is the step that caught two of the last round's three real defects.
- [ ] Update `docs/handover.md` for the operator, in their terms, naming what moved on each screen and what is deliberately unchanged.

## Self-review

**Spec coverage.** §6 → Task 1. §7 → Task 2. §8 → Task 3. §9 (both HistoryScreen and VisitReceipt) → Task 4. §10 → Task 5. §11 → Task 6. §12 list → Task 7. §12 edit → Task 8. §2, §3, §4, §5 were completed in the 2026-08-28 round and are untouched. The spec's "Suggested task order" is followed exactly, with its steps 4–6 expanded into eight tasks so each screen carries its own review gate.

**Two spec gaps found and resolved rather than deferred**, both recorded as rulings in their tasks: §12's tray *category* word has no field on `Item` (resolved as a UI constant sourced from the catalogue transcription), and §12's fourth "numeric" field `PACK SIZE` is the existing optional `size` **text** field (resolved as the fourth grid cell with `type="text"`).

**One spec requirement deliberately not implemented**, recorded as a ruling in Task 4: §9's `Complete · 318 units · $1,583.50` run row drops the units and revenue, because computing them costs a `salesForRange` per row against Global Constraint 2.

**One shared-component change**, declared in Task 8's Interfaces and backward compatible with every existing caller: `ScreenHeader`'s `title` widens from `string` to `ReactNode`.

**Type consistency.** `SlotEditSheet`'s `machineId: Id` → `machine: Machine` is declared in Task 1's Interfaces and both call sites are named. `VisitReceipt`'s `onBack` removal is declared in Task 4's Interfaces and its only caller is in the same file pair. The three renamed accessible names in Task 2 (`Quantity`→`Units`, `Destination`→`To machine`, `Destination slot`→`Into slot`) are called out with the grep that finds every affected assertion.
