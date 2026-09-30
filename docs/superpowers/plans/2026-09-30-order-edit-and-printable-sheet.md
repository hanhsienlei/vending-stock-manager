# Editable order figures and a printable stock sheet — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator correct an order figure before writing it down, and print the stock sheet from the phone.

**Architecture:** Overrides are preferences in `localStorage` beside horizon and safety — never Dexie, never a record. The printable sheet is a `?print=1` entry point read in `App.tsx`, rendering the matrix alone under a print stylesheet; it opens in a new tab, which is how it escapes the installed PWA's standalone mode where `window.print()` is unreliable on iOS. No schema change, no new dependency.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`), Vitest + @testing-library/react, Tailwind v4, Dexie (untouched here).

**Spec:** `docs/superpowers/specs/2026-09-30-order-edit-and-printable-sheet-design.md`

## Global Constraints

- **No new npm dependencies.** The app has three runtime deps: `dexie`, `react`, `react-dom`.
- **No schema change.** Schema stays at v4; `SCHEMA_VERSION` is exported from `src/data/db.ts`.
- **No domain arithmetic changes.** `orderSuggestion` in `src/domain/order.ts` is untouched — an override replaces its output, never feeds it.
- **Every `localStorage` read and write is wrapped in try/catch.** On Node 25 `globalThis.localStorage` is a method-less object and on Node 20 (CI) it works; the code must survive both, and private-mode Safari throws on access.
- **Design system is `docs/design/tokens.md`:** zero border radius, rules not borders, flush-left labels, `tabular-nums` on aligned figures. One accent element per screen. A destructive or "yours" mark is `accent-700` text, never an accent fill.
- **Phone first:** 393px portrait. Nothing may run off the side.
- **Verification for every task:** `npx vitest run`, `npx tsc --noEmit`, `npm run lint` (0 errors), `npx vite build`. Baseline at plan start: **826 tests across 53 files**.
- **Known flake, not yours:** intermittent `DatabaseClosedError` from `src/ui/report/ReportScreen.test.tsx`. Do not chase it.

---

### Task 1: Override storage

**Files:**
- Modify: `src/ui/report/OrderSection.tsx` (add hook beside `useOrderPreferences`, ~line 226 onward)
- Test: `src/ui/report/OrderSection.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `useOrderOverrides(): { overrides: Record<string, number>, setOverride(itemId: string, boxes: number): void, clearOverride(itemId: string): void, clearAll(): void }`

- [ ] **Step 1: Write the failing test**

```tsx
import { act, renderHook } from '@testing-library/react'
import { useOrderOverrides } from './OrderSection'

describe('useOrderOverrides', () => {
  it('records, clears one, and clears all', () => {
    const { result } = renderHook(() => useOrderOverrides())

    act(() => { result.current.setOverride('mars', 2) })
    expect(result.current.overrides.mars).toBe(2)

    act(() => { result.current.setOverride('coke', 4) })
    act(() => { result.current.clearOverride('mars') })
    expect(result.current.overrides.mars).toBeUndefined()
    expect(result.current.overrides.coke).toBe(4)

    act(() => { result.current.clearAll() })
    expect(result.current.overrides).toEqual({})
  })

  // The storage shim on Node 25 has no getItem/setItem at all, and private
  // Safari throws outright. Neither may take the report down.
  it('survives storage that is absent or throws', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const { result } = renderHook(() => useOrderOverrides())
    act(() => { result.current.setOverride('mars', 2) })
    expect(result.current.overrides.mars).toBe(2)   // in memory regardless
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/report/OrderSection.test.tsx -t "useOrderOverrides"`
Expected: FAIL — `useOrderOverrides` is not exported.

- [ ] **Step 3: Implement**

Add to `src/ui/report/OrderSection.tsx`, after the existing `KEYS` block. Extend `KEYS` with `overrides: 'vsm.order.overrides'`.

```tsx
/** The operator's corrections to the suggestion, by item id — boxes where a
 * carton size is known, units where `boxSize` is 1, matching `orderCell`'s two
 * forms. A preference, not a record (design §1): nothing dates it, nothing
 * subtracts it later, and it is NOT the fix for "does not know what has
 * already been ordered".
 *
 * One key holding a JSON object rather than a key per item, so the whole set
 * clears in a single write and a malformed value costs one parse. */
function readOverrides(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(KEYS.overrides)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const clean: Record<string, number> = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        clean[id] = Math.floor(value)
      }
    }
    return clean
  } catch {
    return {}
  }
}

export function useOrderOverrides() {
  const [overrides, setOverrides] = useState<Record<string, number>>(readOverrides)

  const persist = useCallback((next: Record<string, number>) => {
    setOverrides(next)
    try {
      window.localStorage.setItem(KEYS.overrides, JSON.stringify(next))
    } catch {
      // In memory is still correct for this tab, and the print tab simply
      // sees the suggestion. A preference is never worth a broken screen.
    }
  }, [])

  const setOverride = useCallback((itemId: string, boxes: number) => {
    setOverrides((prev) => {
      const next = { ...prev, [itemId]: Math.max(0, Math.floor(boxes)) }
      try { window.localStorage.setItem(KEYS.overrides, JSON.stringify(next)) } catch { /* as above */ }
      return next
    })
  }, [])

  const clearOverride = useCallback((itemId: string) => {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[itemId]
      try { window.localStorage.setItem(KEYS.overrides, JSON.stringify(next)) } catch { /* as above */ }
      return next
    })
  }, [])

  const clearAll = useCallback(() => persist({}), [persist])

  return { overrides, setOverride, clearOverride, clearAll }
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/ui/report/OrderSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full verification, then commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint && npx vite build
git add src/ui/report/OrderSection.tsx src/ui/report/OrderSection.test.tsx
git commit -m "feat(report): remember the operator's corrections to an order"
```

---

### Task 2: The row's reference figures

**Files:**
- Modify: `src/ui/report/OrderSection.tsx` (the `OrderRow` interface, and the row render)
- Modify: `src/ui/report/ReportScreen.tsx:81-92` (where `orderRows` is built)
- Test: `src/ui/report/OrderSection.test.tsx`

**Interfaces:**
- Consumes: `MatrixRow` from `src/domain/stockMatrix.ts` — carries `itemId`, `full`, `balance`.
- Produces: `OrderRow` gains `sellsPerWeek: number` and `underFull: number`.

**Ruling carried from the spec (§3):** both figures are plumbed from the matrix rows already built in `useReport`, keyed by item id — never recomputed in the order section. `buildStockMatrix` is the one place that knows an item's slot count, par and storeroom balance, and a second computation would be a second answer to one question.

- [ ] **Step 1: Write the failing test**

```tsx
const ROW: OrderRow = {
  itemId: 'mars', itemName: 'Mars', boxSize: 50, ratedSlots: 3, slotCount: 3,
  ratePerDay: 1, forecast: 10, onHand: 0, suggested: 10, boxes: 1, units: 50,
  flags: [], sellsPerWeek: 7, underFull: 17,
}

it('shows what it sells a week and how far under full it is', () => {
  render(<OrderSection rows={[ROW]} horizon={7} safety={3} filled
    onHorizonChange={() => {}} onSafetyChange={() => {}} onFilledChange={() => {}}
    overrides={{}} onOverride={() => {}} onClearOverride={() => {}} />)

  expect(screen.getByText(/sells/i)).toHaveTextContent('7')
  expect(screen.getByLabelText('under full for mars')).toHaveTextContent('17')
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/report/OrderSection.test.tsx -t "under full"`
Expected: FAIL — `sellsPerWeek` is not a property of `OrderRow`.

- [ ] **Step 3: Implement**

In `OrderSection.tsx`, extend the interface:

```tsx
export interface OrderRow extends OrderLine {
  itemName: string
  boxSize: number
  ratedSlots: number
  slotCount: number
  /** The demand rate × 7 — the forecast's own number, in the unit a
   * Tuesday/Friday route thinks in. Rounded for reading. */
  sellsPerWeek: number
  /** The matrix's `balance`, sign-flipped so a shortfall reads positive:
   * "under full 17" is faster than "−17". Zero when at or over full. */
  underFull: number
}
```

Render both on the working line of each row:

```tsx
<div className="flex flex-wrap gap-3 text-[11px] font-medium text-neutral-700">
  {row.ratedSlots > 0 && (
    <span>sells <b className="text-[12px] font-extrabold text-ink tabular-nums">{row.sellsPerWeek}</b>/wk</span>
  )}
  <span aria-label={`under full for ${row.itemId}`}>
    under full{' '}
    <b className={`text-[12px] font-extrabold tabular-nums ${row.underFull > 0 ? 'text-accent-700' : 'text-ink'}`}>
      {row.underFull}
    </b>
  </span>
</div>
```

Export the row build as a function rather than leaving it inline in
`ReportScreen`: **Task 5's print sheet needs the identical rows**, and two
copies would be two answers to one question — the failure this task's ruling
already names. Put it in `OrderSection.tsx`, beside `OrderRow`:

```tsx
/** The order rows both the report and the printable sheet render. One builder,
 * because the two must never disagree — the same reason `orderCell` is shared. */
export function buildOrderRows(
  inputs: OrderInput[],
  matrixRows: MatrixRow[],
  horizon: number,
  safety: number,
): OrderRow[] {
  const matrixByItem = new Map(matrixRows.map((r) => [r.itemId, r]))

  return orderSuggestion(inputs, horizon, safety).map((line, index) => ({
    ...line,
    itemName: inputs[index].itemName,
    boxSize: inputs[index].boxSize,
    ratedSlots: inputs[index].ratedSlots,
    slotCount: inputs[index].slotCount,
    sellsPerWeek: Math.round(line.ratePerDay * 7),
    // An item with no matrix row is in no machine's map at all: neither short
    // nor full, so zero is the honest figure rather than a fabricated gap.
    underFull: Math.max(0, -(matrixByItem.get(line.itemId)?.balance ?? 0)),
  }))
}
```

`OrderInput` is imported from `src/domain/order.ts`, `MatrixRow` from
`src/domain/stockMatrix.ts`. In `ReportScreen.tsx`, replace the inline mapping
at lines 81-92 with `const orderRows = buildOrderRows(orderInputs, matrixRows, horizon, safety)`.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/ui/report/`
Expected: PASS.

- [ ] **Step 5: Full verification, then commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint && npx vite build
git add src/ui/report/OrderSection.tsx src/ui/report/OrderSection.test.tsx src/ui/report/ReportScreen.tsx
git commit -m "feat(report): show what a line sells a week, and how far under full"
```

---

### Task 3: Edit in place

**Files:**
- Modify: `src/ui/report/OrderSection.tsx` (row render, component props)
- Modify: `src/ui/report/ReportScreen.tsx` (wire the hook from Task 1; clear on horizon/safety change)
- Test: `src/ui/report/OrderSection.test.tsx`

**Interfaces:**
- Consumes: `useOrderOverrides` (Task 1), `OrderRow` (Task 2).
- Produces: `OrderSection` props gain `overrides: Record<string, number>`, `onOverride(itemId, boxes)`, `onClearOverride(itemId)`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('replaces the suggestion with the operator figure, keeping the original in view', async () => {
  const user = userEvent.setup()
  const onOverride = vi.fn()
  render(<OrderSection rows={[ROW]} horizon={7} safety={3} filled
    onHorizonChange={() => {}} onSafetyChange={() => {}} onFilledChange={() => {}}
    overrides={{ mars: 2 }} onOverride={onOverride} onClearOverride={() => {}} />)

  expect(screen.getByLabelText('order boxes for mars')).toHaveValue(2)
  expect(screen.getByText(/app said/i)).toHaveTextContent('1 × 50')

  await user.clear(screen.getByLabelText('order boxes for mars'))
  await user.type(screen.getByLabelText('order boxes for mars'), '3')
  expect(onOverride).toHaveBeenLastCalledWith('mars', 3)
})

// The operator can order something the app cannot forecast.
it('is editable on a row with no rate', () => {
  const noRate = { ...ROW, ratedSlots: 0, sellsPerWeek: 0 }
  render(<OrderSection rows={[noRate]} horizon={7} safety={3} filled
    onHorizonChange={() => {}} onSafetyChange={() => {}} onFilledChange={() => {}}
    overrides={{}} onOverride={() => {}} onClearOverride={() => {}} />)

  expect(screen.getByLabelText('order boxes for mars')).toBeInTheDocument()
})

it('undoes an override', async () => {
  const user = userEvent.setup()
  const onClear = vi.fn()
  render(<OrderSection rows={[ROW]} horizon={7} safety={3} filled
    onHorizonChange={() => {}} onSafetyChange={() => {}} onFilledChange={() => {}}
    overrides={{ mars: 2 }} onOverride={() => {}} onClearOverride={onClear} />)

  await user.click(screen.getByRole('button', { name: /undo/i }))
  expect(onClear).toHaveBeenCalledWith('mars')
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/report/OrderSection.test.tsx -t "operator figure"`
Expected: FAIL — no such label; `OrderSection` takes no `overrides` prop.

- [ ] **Step 3: Implement**

The figure becomes a number input carrying only the count; the `× 50` is rendered beside it from the item's carton size and is **not** editable (spec §2 — the carton is a property of the product, not a per-order decision). Where `boxSize` is 1 there is no suffix.

```tsx
const overridden = overrides[row.itemId] !== undefined

<div className={`border-b border-rule-light px-3.5 py-2.5 ${overridden ? 'bg-accent-100' : 'bg-paper'}`}>
  <div className="flex items-center justify-between gap-3">
    <span className="truncate text-[14px] font-semibold">{row.itemName}</span>
    <span className="flex shrink-0 items-center gap-1.5">
      <input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={`order boxes for ${row.itemId}`}
        value={overrides[row.itemId] ?? (row.ratedSlots === 0 ? '' : row.boxes)}
        onChange={(e) => onOverride(row.itemId, Number(e.target.value))}
        className={`w-[60px] border-2 px-1.5 py-1 text-right text-[19px] font-extrabold tabular-nums ${
          overridden ? 'border-accent' : 'border-ink'
        }`}
      />
      {row.boxSize > 1 && (
        <span className="text-[13px] font-bold text-neutral-700 tabular-nums">× {row.boxSize}</span>
      )}
    </span>
  </div>

  {overridden && (
    <div className="mt-1.5 flex items-baseline gap-3 text-[11px]">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-accent-700">Yours</span>
      <span className="text-neutral-500 tabular-nums">
        app said {orderCell(row) ?? '—'}
      </span>
      <button
        type="button"
        onClick={() => onClearOverride(row.itemId)}
        className="ml-auto text-[11px] font-bold text-accent-700"
      >
        Undo
      </button>
    </div>
  )}
  {/* the working line from Task 2 follows */}
</div>
```

In `ReportScreen.tsx`, wire the hook and clear on basis change:

```tsx
const { overrides, setOverride, clearOverride, clearAll } = useOrderOverrides()

// Changing the horizon or the safety buffer recomputes every suggestion, so
// an override made against the old figures answers a question that no longer
// exists. Leaving it would put a stale number on the sheet looking exactly
// like a current one (design §2).
const changeHorizon = (days: number) => { clearAll(); setHorizon(days) }
const changeSafety = (days: number) => { clearAll(); setSafety(days) }
```

Pass `onHorizonChange={changeHorizon}` and `onSafetyChange={changeSafety}` to `OrderSection`.

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run src/ui/report/`
Expected: PASS.

- [ ] **Step 5: Add the clearing test, and run it**

Put this in `src/ui/report/ReportScreen.test.tsx`, using that file's existing
seed helpers to render the report with at least one rated item:

```tsx
it('clears every override when the horizon changes', async () => {
  const user = userEvent.setup()
  window.localStorage.setItem('vsm.order.overrides', JSON.stringify({ mars: 9 }))

  await seedReportWithRatedItem()      // existing helper in this file
  render(<ReportScreen />)

  const field = await screen.findByLabelText('order boxes for mars')
  expect(field).toHaveValue(9)

  // Horizon recomputes every suggestion, so an override made against the old
  // figures is answering a question that no longer exists.
  const horizon = screen.getByLabelText(/horizon/i)
  await user.clear(horizon)
  await user.type(horizon, '14')

  await waitFor(() => expect(screen.getByLabelText('order boxes for mars')).not.toHaveValue(9))
  expect(JSON.parse(window.localStorage.getItem('vsm.order.overrides') ?? '{}')).toEqual({})
})
```

If `seedReportWithRatedItem` does not exist under that name, use whatever the
file's own setup is called — do not add a second seeding path.

- [ ] **Step 6: Full verification, then commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint && npx vite build
git add src/ui/report/
git commit -m "feat(report): correct an order figure in place, and undo it"
```

---

### Task 4: The matrix column follows the override

**Files:**
- Modify: `src/ui/report/OrderSection.tsx` (`orderCell` signature)
- Modify: `src/ui/report/ReportScreen.tsx:94-102` (where `orderByItem` is built)
- Test: `src/ui/report/ReportScreen.test.tsx`

**Interfaces:**
- Consumes: `overrides` (Task 1), `orderCell` (existing).
- Produces: `orderCell(row: OrderRow, override?: number): string | null`.

- [ ] **Step 1: Write the failing test**

```tsx
it('prints the operator figure in the matrix Order column, not the suggestion', () => {
  expect(orderCell(ROW)).toBe('1 × 50')
  expect(orderCell(ROW, 2)).toBe('2 × 50')
})

// A row the app cannot forecast returns null — but an override on it is a
// real instruction and must print.
it('prints an override even where there is no rate', () => {
  const noRate = { ...ROW, ratedSlots: 0 }
  expect(orderCell(noRate)).toBeNull()
  expect(orderCell(noRate, 3)).toBe('3 × 50')
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/report/ -t "Order column"`
Expected: FAIL — `orderCell` takes one argument.

- [ ] **Step 3: Implement**

```tsx
export function orderCell(row: OrderRow, override?: number): string | null {
  // An override is the operator's instruction and outranks the guard below:
  // they may order something the app has no rate for.
  if (override !== undefined) {
    return row.boxSize > 1 ? `${override} × ${row.boxSize}` : `${override}`
  }
  if (row.ratedSlots === 0) return null
  if (row.boxSize > 1 && row.boxes > 0) return `${row.boxes} × ${row.boxSize}`
  return `${row.units}`
}
```

In `ReportScreen.tsx`, pass the override when building `orderByItem`:

```tsx
const cell = orderCell(row, overrides[row.itemId])
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/ui/report/`
Expected: PASS. The existing test asserting the column and the section agree must still pass — that property is the point of the shared formatter.

- [ ] **Step 5: Full verification, then commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint && npx vite build
git add src/ui/report/
git commit -m "feat(report): the Order column shows what the operator wrote"
```

---

### Task 5: The printable sheet

**Files:**
- Create: `src/ui/report/PrintSheet.tsx`
- Create: `src/ui/report/PrintSheet.test.tsx`
- Modify: `src/ui/App.tsx` (read `?print=1` at mount, before any nav state)
- Modify: `src/ui/report/ReportScreen.tsx` (the `Print sheet` action)

**Interfaces:**
- Consumes: `useReport` and `StockMatrix` (existing), `formatRunDate` from
  `src/domain/date.ts` (existing — there is no `formatLongDate`),
  `useOrderOverrides` (Task 1), `buildOrderRows` (Task 2), `orderCell` (Task 4).
- Produces: `PrintSheet` — a standalone screen, no nav, no tabs.

- [ ] **Step 1: Write the failing test**

```tsx
it('renders the matrix and none of the screen furniture', async () => {
  // seed items, machines, a visit, as ReportScreen.test.tsx does
  render(<PrintSheet />)

  await screen.findByRole('columnheader', { name: 'Order' })
  expect(screen.queryByRole('button', { name: /turn phone/i })).toBeNull()
  expect(screen.queryByText(/covers 10 days/i)).toBeNull()   // the order section
  expect(screen.queryByRole('navigation')).toBeNull()
})

it('states when it was true, and on what horizon', async () => {
  render(<PrintSheet />)
  const line = await screen.findByLabelText('sheet provenance')
  expect(line).toHaveTextContent('15 machines')
  expect(line).toHaveTextContent('7 + 3 days')
})

it('prints the operator override in the Order column', async () => {
  window.localStorage.setItem('vsm.order.overrides', JSON.stringify({ mars: 2 }))
  render(<PrintSheet />)
  expect(await screen.findByLabelText('order for 36')).toHaveTextContent('2 × 50')
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/report/PrintSheet.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `PrintSheet.tsx`**

```tsx
/** The stock sheet, alone on a page, for printing and carrying (design §4).
 *
 * A separate entry point rather than a mode of `ReportScreen`, because it is
 * opened in its own browser tab: that is how it escapes the installed app's
 * standalone mode, where `window.print()` is unreliable on iOS. A separate tab
 * shares the origin but not React state, which is why the overrides it prints
 * live in `localStorage` (design §2). */
export function PrintSheet() {
  const { matrixRows, machines, orderInputs, loading } = useReport(today(), today())
  const { horizon, safety } = useOrderPreferences()
  const { overrides } = useOrderOverrides()

  if (loading) return null

  const orderRows = buildOrderRows(orderInputs, matrixRows, horizon, safety)
  const orderByItem = new Map(
    orderRows.flatMap((row) => {
      const cell = orderCell(row, overrides[row.itemId])
      return cell === null ? [] : [[row.itemId, cell] as const]
    }),
  )

  return (
    <main className="bg-paper">
      <p aria-label="sheet provenance" className="px-4 py-2 text-[11px] font-medium text-neutral-700">
        Stock sheet · {formatRunDate(today())} · {machines.length} machines ·
        order covers {horizon} + {safety} days
      </p>
      <StockMatrix rows={matrixRows} machines={machines} orderByItem={orderByItem} />
    </main>
  )
}
```

- [ ] **Step 4: Wire the entry point in `App.tsx`**

Read the query parameter once at module scope — before any state, because this is not a navigable screen and must not be reachable by the nav:

```tsx
// `?print=1` is the printable sheet, opened in its own tab from the report.
// Read once at mount: it is an entry point, not a screen the nav can reach.
const isPrint = new URLSearchParams(window.location.search).get('print') === '1'

export function App() {
  if (isPrint) return <PrintSheet />
  // … existing tab state and screens
}
```

- [ ] **Step 5: Add the action to `ReportScreen`**

Beside the existing landscape hint:

```tsx
<button
  type="button"
  onClick={() => window.open('?print=1', '_blank')}
  className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-accent-700"
>
  Print sheet
</button>
```

- [ ] **Step 6: Run and watch them pass**

Run: `npx vitest run src/ui/report/`
Expected: PASS.

- [ ] **Step 7: Full verification, then commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint && npx vite build
git add src/ui/report/PrintSheet.tsx src/ui/report/PrintSheet.test.tsx src/ui/App.tsx src/ui/report/ReportScreen.tsx
git commit -m "feat(report): a stock sheet you can print and carry"
```

---

### Task 6: The print stylesheet

**Files:**
- Modify: `src/index.css`
- Test: `src/ui/report/PrintSheet.test.tsx` (structural only)

**Interfaces:**
- Consumes: `PrintSheet` (Task 5).
- Produces: nothing other tasks read.

**Constraint:** jsdom does not lay out and does not paginate, so **orientation, page breaks and the repeating header cannot be asserted**. The test pins the structure; the behaviour needs one look at a real print preview. Say so in the commit body.

- [ ] **Step 1: Write the structural test**

```tsx
it('marks the sheet as the printable region', async () => {
  const { container } = render(<PrintSheet />)
  await screen.findByRole('table')
  expect(container.querySelector('[data-print-sheet]')).not.toBeNull()
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/report/PrintSheet.test.tsx -t "printable region"`
Expected: FAIL — no such attribute.

- [ ] **Step 3: Add `data-print-sheet` to `PrintSheet`'s `<main>`, then the stylesheet**

Append to `src/index.css`:

```css
/* The printable stock sheet (design §4). A4 landscape is 1123px at 96dpi and
   the matrix's columns sum to 868px, so it prints at natural size — the
   figures stay the size they were designed at, which is the whole reason the
   sheet is not scaled to fit. */
@page { size: A4 landscape; margin: 8mm; }

@media print {
  [data-print-sheet] { background: #fff; }

  /* A real <table> gets a repeating header from the browser for free — one of
     the reasons the matrix is a table and not a grid. */
  [data-print-sheet] thead { display: table-header-group; }
  [data-print-sheet] tr { break-inside: avoid; }

  /* The container scrolls on screen; on paper it must not clip. */
  [data-print-sheet] .overflow-x-auto { overflow: visible !important; }
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/ui/report/`
Expected: PASS.

- [ ] **Step 5: Full verification, then commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint && npx vite build
git add src/index.css src/ui/report/
git commit -m "print: A4 landscape, repeating header, rows that do not split"
```

---

## After the plan

Two things the plan cannot verify and a human must:

1. **A real print preview** — orientation, the repeating header, and that no column is clipped. jsdom proves none of it.
2. **`?print=1` offline.** The service worker's navigation fallback must serve `index.html` for a query-string URL, or the print tab 404s when freshly installed or off-network — which is exactly when the operator is standing in the storeroom. Spec §6 names this the most likely thing to break.
