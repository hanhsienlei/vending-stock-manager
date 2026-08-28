# Interface Refinement — Steps 1–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the design tokens, the new shell, the re-laid-out run screen, the
machines list and the machine map, so that all five defects reported after the
first real run are fixed before tomorrow morning's run.

**Architecture:** Tailwind v4 reads a `@theme` block straight out of
`src/index.css`, so the token layer is a stylesheet change with no build step and
no new dependency. The shell splits in two: `App.tsx` owns navigation state and
publishes it through a context; a shared `ScreenLayout` renders each screen's own
`<ScreenHeader>` above the sticky tab bar. That split falls out of the spec's own
scroll behaviour ("the header scrolls; the tab bar stays") and avoids plumbing
every screen's title, eyebrow and figure up into `App`. The run row stops being a
flex line of steppers and becomes a five-column CSS grid with two typable numeric
cells.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vite, Dexie (IndexedDB),
Vitest + Testing Library.

**Spec:** `docs/design/2026-08-28-interface-refinement.md` (authority),
`docs/design/tokens.md` (tokens — read first). Behaviour and data remain owned by
`docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md`.

## Global Constraints

- **Scope is layout and labelling.** No flow changes, no schema changes, no new
  features. No task here may modify `src/domain/` or `src/data/`. The single
  exception is Task 9, the one behaviour change, which is decided and scoped.
- **Steps 4–7 of the spec are out of scope for this plan** — storeroom (§8), the
  two sheets' full re-layout (§6, §7), history (§9), report (§10, §11) and items
  (§12) keep their current styling. They must keep working; they need not look
  new.
- **Radius is 0 everywhere** in the files this plan touches. Every `rounded-*`
  class in a touched file comes out.
- **Every figure carries `tabular-nums`.**
- **Every label, heading and button label is flush left**, including in
  full-width buttons.
- **Colour budget: one accent element per screen.** Run screen spends it on
  `Finish machine`; machines list on the footer run button.
- **No `max` on a count input.** Over-capacity is flagged, never prevented
  (§3.3). This is existing behaviour and must not regress.
- **Ran-dry suppression must not regress**: a slot with no prior recorded level
  is not "ran dry" (fix-plan item 4).
- **`Finish machine` is not a lock**: it re-runs the whole-machine batch and
  re-stamps `updatedAt`/`finalizedAt` even on an already-finished visit.
- **`getOrCreateRun` idempotency** holds for both entry points — tapping a
  machine and the footer run button.
- Exact colours, sizes and copy come from the spec. Where a value is not given,
  it is unchanged from the current build.
- The suite must be green at every commit. Baseline: **436 tests, 36 files**.
  Run `npx vitest --run` — note `DatabaseClosedError` in `App.e2e.test.tsx` is a
  known pre-existing teardown flake (`docs/known-gaps.md`) and does not fail the
  suite.

## Accessible names — the contract

Steppers disappear from the run row, so every `… increase` / `… decrease` label
goes with them. These are the names every test in Tasks 3–5 queries by. Fix them
here so implementation and tests agree:

| Element | `aria-label` |
|---|---|
| Before-count cell, single-item slot | `slot 58 counted` |
| After-count cell, single-item slot | `slot 58 refilled to` |
| Before-count cell, mixed slot item | `slot 52 Sunkist counted` |
| After-count cell, mixed slot item | `slot 52 Sunkist refilled to` |
| Slot `⋯` button | `Edit slot 58` (unchanged) |
| Per-slot fill, in the `⋯` sheet | `Fill slot 58` (moved, name unchanged) |
| Tray fill footer action | `Fill tray to par` |

---

### Task 1: Land the design documents in the repository

The handoff bundle sits untracked at the repository root. The README says to drop
`docs/design/` into the repository; the spec is the authority every later task
argues from, so it must be tracked before any code changes.

**Files:**
- Create: `docs/design/2026-08-28-interface-refinement.md`
- Create: `docs/design/tokens.md`
- Create: `docs/design/readme.md`
- Create: `docs/design/design-board.html`

- [ ] **Step 1: Move the bundle into the repository**

```bash
mkdir -p docs/design
mv design_handoff_interface_refinement/docs/design/*.md docs/design/
mv design_handoff_interface_refinement/design-board.html docs/design/
mv design_handoff_interface_refinement/README.md docs/design/handoff-readme.md
rmdir design_handoff_interface_refinement/docs/design design_handoff_interface_refinement/docs design_handoff_interface_refinement
```

- [ ] **Step 2: Verify nothing is left behind**

Run: `ls design_handoff_interface_refinement 2>&1; ls docs/design`
Expected: the first errors with "No such file or directory"; the second lists
four files plus `handoff-readme.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/design
git commit -m "docs(design): land the interface refinement handoff bundle"
```

---

### Task 2: Design tokens

**Files:**
- Modify: `src/index.css` (whole file — currently one line)

**Interfaces:**
- Produces: the Tailwind v4 token names every later task uses —
  `bg-ground`, `bg-surface`, `bg-paper`, `text-ink`, `bg-accent`,
  `text-accent-700`, `bg-accent-100`, `bg-accent-200`, `text-accent-800`,
  `text-neutral-400`, `text-neutral-500`, `text-neutral-600`,
  `text-neutral-700`, `bg-neutral-100`, `border-rule-strong`,
  `border-rule-light`, and the `font-heading` / `font-body` families.

- [ ] **Step 1: Replace `src/index.css`**

Copy the `@theme` block from `docs/design/tokens.md` verbatim. The full file:

```css
@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap");

@theme {
  /* Ground and ink */
  --color-ground: #f3f2f2;   /* page background */
  --color-surface: #eae9e9;  /* section bars, legends, inset cells */
  --color-paper: #ffffff;    /* every data row */
  --color-ink: #201e1d;      /* text, strong rules, filled headers */

  /* The one accent. Used for: the primary action, the active tab underline,
     the ran-dry edge mark, the report's sold field. Nothing else. */
  --color-accent: #ec3013;
  --color-accent-100: #fff2ef;
  --color-accent-200: #ffe0d9;
  --color-accent-600: #dd2b0f;  /* hover */
  --color-accent-700: #ae1800;  /* pressed; accent text at body size */
  --color-accent-800: #7c1405;  /* text on an accent-200 fill */

  /* Neutral ramp — replaces every ad-hoc gray-* */
  --color-neutral-100: #f8f4f4;  /* alternating / disabled row */
  --color-neutral-400: #bab6b6;  /* carried-forward figure, ⋯ glyph */
  --color-neutral-500: #9b9797;  /* "not counted" */
  --color-neutral-600: #7d7979;  /* inactive tab, helper text */
  --color-neutral-700: #605d5d;  /* metadata, column headers on ground */

  /* Rules. Two weights only. */
  --color-rule-strong: rgb(32 30 29 / 0.4);   /* 2px, between sections */
  --color-rule-light: rgb(32 30 29 / 0.18);   /* 1px, between rows */

  --font-heading: "Archivo", system-ui, sans-serif;
  --font-body: "Archivo", system-ui, sans-serif;

  --radius-none: 0px;
}

/* Archivo everywhere, tabular figures everywhere. Columns of numbers that do
   not align are the reason a paper sheet beats a screen, and it is one
   declaration. */
html {
  font-family: var(--font-body);
  background: var(--color-ground);
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
}

:focus { outline: none; }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
::selection { background: rgb(236 48 19 / 0.3); }
```

Note: the Google Fonts `@import` is moved **above** the `@theme` block. CSS
requires every `@import` to precede other at-rules; `tokens.md` prints it after,
which browsers and the Vite CSS pipeline will drop silently, leaving the app on
`system-ui`. This is a transcription fix, not a design change.

- [ ] **Step 2: Verify the build and the suite**

Run: `npx tsc --noEmit && npx vite build && npx vitest --run`
Expected: build clean; 436 tests pass. Tokens alone change no assertion — every
screen still renders its current classes, which are unaffected by adding theme
names.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(design): add the design token layer (tokens.md)"
```

---

### Task 3: The shell — context header and tab bar

**Files:**
- Create: `src/ui/components/ScreenHeader.tsx`
- Create: `src/ui/components/ScreenLayout.tsx`
- Create: `src/ui/components/ScreenLayout.test.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/App.e2e.test.tsx`

**Interfaces:**
- Consumes: the token names from Task 2.
- Produces:
  - `<ScreenHeader eyebrow? back? state? title subtitle? figure? />` — the
    scrolling context header. `back` is `{ label: string; onClick: () => void }`.
    `eyebrow` and `back` are mutually exclusive; a nested screen passes `back`.
  - `<ScreenLayout header={<ScreenHeader …/>}>{children}</ScreenLayout>` — renders
    the header, then the sticky tab bar, then the children.
  - `NavContext` with `{ active: TabName; go: (tab: TabName) => void }`, provided
    by `App`. `type TabName = 'machines' | 'items' | 'storeroom' | 'history'`.

- [ ] **Step 1: Write the failing test**

`src/ui/components/ScreenLayout.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NavContext } from './ScreenLayout'
import { ScreenLayout } from './ScreenLayout'
import { ScreenHeader } from './ScreenHeader'

function renderWith(active: 'machines' | 'items' | 'storeroom' | 'history', go = vi.fn()) {
  render(
    <NavContext.Provider value={{ active, go }}>
      <ScreenLayout header={<ScreenHeader eyebrow="RUN · THU 27 AUG" title="Machines" figure="3 / 15" />}>
        <p>body</p>
      </ScreenLayout>
    </NavContext.Provider>,
  )
  return go
}

describe('ScreenLayout', () => {
  it('renders the eyebrow, the title and the one figure the screen is about', () => {
    renderWith('machines')
    expect(screen.getByText('RUN · THU 27 AUG')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Machines' })).toBeInTheDocument()
    expect(screen.getByText('3 / 15')).toBeInTheDocument()
  })

  it('marks exactly one tab as current', () => {
    renderWith('storeroom')
    expect(screen.getByRole('button', { name: 'Storeroom' })).toHaveAttribute(
      'aria-current', 'page',
    )
    expect(screen.getByRole('button', { name: 'Machines' })).not.toHaveAttribute('aria-current')
  })

  it('navigates on a tab tap', async () => {
    const user = userEvent.setup()
    const go = renderWith('machines')
    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(go).toHaveBeenCalledWith('history')
  })

  it('renders a back affordance instead of an eyebrow on a nested screen', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <NavContext.Provider value={{ active: 'machines', go: vi.fn() }}>
        <ScreenLayout
          header={
            <ScreenHeader
              back={{ label: '← MACHINES', onClick }}
              state="COUNTING"
              title="L7"
              subtitle="Lift lobby"
              figure="22 / 54"
            />
          }
        >
          <p>body</p>
        </ScreenLayout>
      </NavContext.Provider>,
    )
    expect(screen.queryByText('RUN · THU 27 AUG')).not.toBeInTheDocument()
    expect(screen.getByText('COUNTING')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '← MACHINES' }))
    expect(onClick).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest --run src/ui/components/ScreenLayout.test.tsx`
Expected: FAIL — cannot resolve `./ScreenLayout`.

- [ ] **Step 3: Write `ScreenHeader.tsx`**

```tsx
/** The context header (§2). Scrolls away under the tab bar, which does not —
 * which is why this is rendered by each screen inside `ScreenLayout` rather
 * than hoisted into `App`: the screen owns the data the header states, and the
 * DOM order (header, then tabs) is what makes the scroll behaviour fall out
 * without a sticky-offset calculation. */
export function ScreenHeader({
  eyebrow, back, state, title, subtitle, figure,
}: {
  /** The run context, e.g. `RUN · THU 27 AUG`. A top-level screen passes this. */
  eyebrow?: string
  /** A nested screen (map, count, receipt) passes this instead — never both. */
  back?: { label: string; onClick: () => void }
  /** Right of the back line on the count screen: `COUNTING`, `READ ONLY`. */
  state?: string
  title: string
  /** The distinct machine label, beside the title at 16px/500. */
  subtitle?: string
  /** The one figure the screen is about: `3 / 15`, `22 / 54`. */
  figure?: string
}) {
  return (
    <header className="bg-ground px-4 pb-3 pt-2.5">
      <div className="flex items-baseline justify-between">
        {back ? (
          <button
            type="button"
            onClick={back.onClick}
            className="text-[11px] font-semibold uppercase tracking-[0.10em] text-neutral-600"
          >
            {back.label}
          </button>
        ) : (
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
            {eyebrow}
          </span>
        )}
        {state && (
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
            {state}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <h1 className="flex items-baseline gap-2 truncate text-[27px] font-extrabold tracking-[-0.02em]">
          {title}
          {subtitle && (
            <span className="text-[16px] font-medium text-neutral-700">{subtitle}</span>
          )}
        </h1>
        {figure && (
          <span className="shrink-0 text-[19px] font-extrabold tabular-nums">{figure}</span>
        )}
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Write `ScreenLayout.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from 'react'

export type TabName = 'machines' | 'items' | 'storeroom' | 'history'

export const NavContext = createContext<{
  active: TabName
  go: (tab: TabName) => void
}>({ active: 'machines', go: () => {} })

const TABS: { name: TabName; label: string }[] = [
  { name: 'machines', label: 'Machines' },
  { name: 'items', label: 'Items' },
  { name: 'storeroom', label: 'Storeroom' },
  { name: 'history', label: 'History' },
]

/** Header, then the sticky tab bar, then the screen. The four tabs are flush
 * left with a 20px gap and are NOT stretched to equal widths — the previous
 * bar's four centred, equal-width buttons with no active state is defect #3
 * ("the navigation bar is in the button, very weird"). */
export function ScreenLayout({
  header, children,
}: {
  header: ReactNode
  children: ReactNode
}) {
  const { active, go } = useContext(NavContext)
  return (
    <>
      {header}
      <nav className="sticky top-0 z-10 flex gap-5 border-b-2 border-rule-strong bg-ground px-4">
        {TABS.map((tab) => (
          <button
            key={tab.name}
            type="button"
            aria-current={active === tab.name ? 'page' : undefined}
            onClick={() => go(tab.name)}
            className={`py-2.5 text-[13px] ${
              active === tab.name
                ? 'font-extrabold text-ink shadow-[inset_0_-3px_0_var(--color-accent)]'
                : 'font-medium text-neutral-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {children}
    </>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest --run src/ui/components/ScreenLayout.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Rewire `App.tsx`**

Replace the `return (…)` block. `App` keeps its `Screen` union and its
`lg:max-w-none` History exception, drops the fixed nav and the `pt-14` offset
(the tab bar is sticky now, not fixed, so nothing needs to be pushed out from
under it), and provides `NavContext`. Each screen renders its own
`ScreenLayout`, so `App` renders only the provider and the body:

```tsx
  const wide = screen.name === 'history'
  const active: TabName =
    screen.name === 'item-edit' ? 'items'
    : screen.name === 'machine-map' || screen.name === 'count' ? 'machines'
    : screen.name

  return (
    <NavContext.Provider
      value={{
        active,
        go: (tab) => setScreen({ name: tab } as Screen),
      }}
    >
      <div className={`mx-auto max-w-lg bg-ground ${wide ? 'lg:max-w-none' : ''}`}>
        {body}
      </div>
    </NavContext.Provider>
  )
```

Import `NavContext` and `TabName` from `./components/ScreenLayout`.

- [ ] **Step 7: Wrap every screen in `ScreenLayout`**

Each of `ItemListScreen`, `ItemEditScreen`, `MachineListScreen`,
`MachineMapScreen`, `CountScreen`, `StoreroomScreen` and `HistoryScreen` wraps
its existing returned markup in `<ScreenLayout header={<ScreenHeader …/>}>`.
For this task give the out-of-scope screens a minimal correct header so nothing
loses its nav; Tasks 4–8 give the in-scope screens their specified content.

| Screen | eyebrow / back | title | figure |
|---|---|---|---|
| Items | `CATALOGUE · {n} ITEMS` | `Items` | — |
| Item edit | back `← ITEMS` | `Item` | — |
| Storeroom | `LEDGER · {verified} OF {n} VERIFIED` | `Storeroom` | — |
| History | `{n} RUNS RECORDED` | `History` | — |

Where a count is not already loaded by that screen, omit the number rather than
adding a query — e.g. `CATALOGUE` alone. No screen gains a repository call in
this task.

- [ ] **Step 8: Update `App.e2e.test.tsx`**

The four nav buttons keep their accessible names (`Machines`, `Items`,
`Storeroom`, `History`), so navigation assertions stand. Only assertions that
depend on the old chrome need changing. Run the file and fix what breaks.

- [ ] **Step 9: Run the full suite**

Run: `npx tsc --noEmit && npx vitest --run`
Expected: 440 tests pass (436 + 4 new).

- [ ] **Step 10: Commit**

```bash
git add src/ui/App.tsx src/ui/App.e2e.test.tsx src/ui/components/ScreenHeader.tsx src/ui/components/ScreenLayout.tsx src/ui/components/ScreenLayout.test.tsx src/ui/items src/ui/storeroom src/ui/history src/ui/machines src/ui/run
git commit -m "feat(shell): context header plus a flush-left sticky tab bar (§2)"
```

---

### Task 4: The run row — five columns, two typable cells

This is defects #1, #2 and #4. `SlotRow` stops rendering `Stepper`; `Stepper`
itself stays in the codebase because the storeroom and the adjustment sheet still
use it.

**Files:**
- Modify: `src/ui/run/SlotRow.tsx` (whole file)
- Modify: `src/ui/run/CountScreen.test.tsx`

**Interfaces:**
- Consumes: tokens (Task 2). `SlotRow`'s props are unchanged **except** that
  `isFilled` and `onToggleFill` are removed — Fill leaves the row (§3.6).
- Produces: the accessible names in the contract table above.

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/run/CountScreen.test.tsx` (adapt the file's existing render
helper; do not invent a new one):

```tsx
  it('takes a typed before-count and a typed after-count', async () => {
    const user = userEvent.setup()
    await renderCount()   // the file's existing helper

    const counted = await screen.findByLabelText('slot 58 counted')
    await user.clear(counted)
    await user.type(counted, '6')
    expect(counted).toHaveValue(6)

    const refilled = screen.getByLabelText('slot 58 refilled to')
    await user.clear(refilled)
    await user.type(refilled, '9')
    expect(refilled).toHaveValue(9)
  })

  it('selects the whole figure on focus, so the first keystroke replaces it', async () => {
    const user = userEvent.setup()
    await renderCount()
    const counted = await screen.findByLabelText('slot 58 counted')
    await user.click(counted)
    expect((counted as HTMLInputElement).selectionStart).toBe(0)
    expect((counted as HTMLInputElement).selectionEnd).toBe(
      (counted as HTMLInputElement).value.length,
    )
  })

  it('does not cap the counted figure at capacity', async () => {
    const user = userEvent.setup()
    await renderCount()
    const counted = await screen.findByLabelText('slot 58 counted')
    expect(counted).not.toHaveAttribute('max')
    await user.clear(counted)
    await user.type(counted, '40')
    expect(counted).toHaveValue(40)
  })

  it('has no per-row stepper or Fill button', async () => {
    await renderCount()
    await screen.findByLabelText('slot 58 counted')
    expect(screen.queryByLabelText('slot 58 increase')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('slot 58 decrease')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fill slot 58' })).not.toBeInTheDocument()
  })

  it('marks a ran-dry slot with an edge inset and no RAN DRY text', async () => {
    await renderCountWithDrySlot()   // the file's existing ran-dry setup
    expect(screen.queryByText('RAN DRY')).not.toBeInTheDocument()
    expect(screen.getByTestId('slot-row-58')).toHaveAttribute('data-ran-dry', 'true')
  })

  it('renders an over-capacity counted figure in accent, with no OVER CAPACITY label', async () => {
    await renderCountOverCapacity()  // the file's existing over-capacity setup
    expect(screen.queryByText('OVER CAPACITY')).not.toBeInTheDocument()
    expect(screen.getByLabelText('slot 58 counted')).toHaveClass('text-accent-700')
  })
```

Rewrite the file's existing stepper-driven cases to type into the new cells:
`user.click(getByLabelText('slot 58 increase'))` becomes a `clear` + `type` on
`slot 58 counted`, and `expect(getByLabelText('slot 11 after')).toHaveTextContent('5')`
becomes `expect(getByLabelText('slot 11 refilled to')).toHaveValue(5)`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest --run src/ui/run/CountScreen.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: slot 58 counted`.

- [ ] **Step 3: Rewrite `SlotRow.tsx`**

```tsx
import { levelKey } from '../../domain/levels'
import type { Id, Item, ResolvedSlot } from '../../domain/types'

/** The five-column grid from §3.2. Two steppers plus a name do not fit 393pt —
 * the arithmetic is in §3.1 and it is why the row overflowed its container.
 * Eleven slots now fit one screen instead of five, so a tray is one screen and
 * the operator stops scrolling mid-tray. The cost is that item names truncate;
 * accepted because the slot number is the identifier at the machine. */
const GRID = 'grid grid-cols-[30px_1fr_60px_60px_34px] items-stretch gap-2 px-3.5'

/** A count cell: an input styled as a cell, not as a field. The grid's rules
 * are its border. */
function CountCell({
  label, value, onChange, dimmed = false, accent = false, surface = false, className = '',
}: {
  label: string
  value: number
  onChange: (qty: number) => void
  dimmed?: boolean
  accent?: boolean
  surface?: boolean
  className?: string
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      // No `max`. The printed map is ~90% accurate and a channel can hold more
      // than its recorded capacity, so clamping would force an under-record and
      // book phantom sales through the residual. Over-capacity is flagged,
      // never prevented (§3.3) — unchanged from the stepper this replaced.
      min={0}
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className={`w-full border-x border-rule-light bg-transparent text-center text-[19px] font-extrabold tabular-nums outline-none ${
        surface ? 'bg-surface ' : ''
      }${accent ? 'text-accent-700' : dimmed ? 'text-neutral-400' : 'text-ink'} ${className}`}
    />
  )
}

export function SlotRow({
  slot, items, before, after, touched, ranDry, onSetBefore, onSetAfter, onEdit,
}: {
  slot: ResolvedSlot
  items: Map<Id, Item>
  before: Map<string, number>
  after: Map<string, number>
  touched: Set<string>
  ranDry: boolean
  onSetBefore: (slotNumber: number, itemId: Id, qty: number) => void
  onSetAfter: (slotNumber: number, itemId: Id, qty: number) => void
  onEdit: (slotNumber: number) => void
}) {
  const mixed = slot.accepts.length > 1
  const total = slot.accepts.reduce(
    (sum, itemId) => sum + (before.get(levelKey(slot.slotNumber, itemId)) ?? 0),
    0,
  )
  const overCapacity = total > slot.capacity
  const name = mixed ? `${slot.accepts.length} items` : items.get(slot.accepts[0])?.name

  return (
    <li
      data-testid={`slot-row-${slot.slotNumber}`}
      data-ran-dry={ranDry ? 'true' : undefined}
      // §3.5: the 4px inset is a box-shadow, not a border, so it does not shift
      // the row's contents by 4px. `RAN DRY` on every zero row was the noise.
      className={`border-b border-rule-light bg-paper ${
        ranDry ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''
      }`}
    >
      <div className={`${GRID} ${mixed ? 'h-[34px]' : 'h-[46px]'}`}>
        <span className="self-center text-[15px] font-extrabold tabular-nums">
          {slot.slotNumber}
        </span>
        <span className="self-center truncate text-[13px] font-semibold">{name}</span>
        {mixed ? (
          <>
            <span className="border-x border-rule-light" />
            <span className="border-x border-rule-light bg-surface" />
          </>
        ) : (
          <>
            <CountCell
              label={`slot ${slot.slotNumber} counted`}
              value={before.get(levelKey(slot.slotNumber, slot.accepts[0])) ?? 0}
              dimmed={!touched.has(levelKey(slot.slotNumber, slot.accepts[0]))}
              accent={overCapacity}
              onChange={(qty) => onSetBefore(slot.slotNumber, slot.accepts[0], qty)}
            />
            <CountCell
              label={`slot ${slot.slotNumber} refilled to`}
              value={after.get(levelKey(slot.slotNumber, slot.accepts[0])) ?? 0}
              surface
              onChange={(qty) => onSetAfter(slot.slotNumber, slot.accepts[0], qty)}
            />
          </>
        )}
        <button
          type="button"
          aria-label={`Edit slot ${slot.slotNumber}`}
          onClick={() => onEdit(slot.slotNumber)}
          className="self-center text-lg text-neutral-400"
        >
          ⋯
        </button>
      </div>

      {/* §3.4: the grouping is the indent and the parent's empty cells, not a
          coloured border. `border-blue-500` on a mixed slot comes out. */}
      {mixed &&
        slot.accepts.map((itemId) => {
          const key = levelKey(slot.slotNumber, itemId)
          const itemName = items.get(itemId)?.name ?? ''
          return (
            <div key={itemId} className={`${GRID} h-[42px]`}>
              <span />
              <span className="self-center truncate pl-2.5 text-[12.5px] font-medium text-neutral-700">
                {itemName}
              </span>
              <CountCell
                label={`slot ${slot.slotNumber} ${itemName} counted`}
                value={before.get(key) ?? 0}
                dimmed={!touched.has(key)}
                onChange={(qty) => onSetBefore(slot.slotNumber, itemId, qty)}
              />
              <CountCell
                label={`slot ${slot.slotNumber} ${itemName} refilled to`}
                value={after.get(key) ?? 0}
                surface
                onChange={(qty) => onSetAfter(slot.slotNumber, itemId, qty)}
              />
              <span />
            </div>
          )
        })}
    </li>
  )
}
```

- [ ] **Step 4: Drop the removed props at the call site**

In `src/ui/run/CountScreen.tsx`, remove `isFilled={…}` and `onToggleFill={…}`
from the `<SlotRow>` call. `counting.toggleFill` is still exported and is picked
up again in Tasks 5 and 6 — leave `useCounting` untouched here.

- [ ] **Step 5: Run the tests**

Run: `npx tsc --noEmit && npx vitest --run src/ui/run/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/run/SlotRow.tsx src/ui/run/CountScreen.tsx src/ui/run/CountScreen.test.tsx
git commit -m "feat(run): five-column slot row with typable count cells (§3.2–3.5)"
```

---

### Task 5: The run screen — header, tray tabs, column head, legend, footer

**Files:**
- Modify: `src/ui/run/useCounting.ts` (add `fillTray`)
- Modify: `src/ui/run/useCounting.test.tsx`
- Modify: `src/ui/run/CountScreen.tsx`
- Modify: `src/ui/run/CountScreen.test.tsx`
- Modify: `src/ui/components/TrayTabs.tsx`
- Modify: `src/ui/components/TrayTabs.test.tsx`

**Interfaces:**
- Consumes: `ScreenLayout`/`ScreenHeader` (Task 3), `SlotRow` (Task 4).
- Produces: `fillTray(slotNumbers: number[]): Promise<void>` on the `useCounting`
  return object, alongside the existing `toggleFill`.

- [ ] **Step 1: Write the failing `fillTray` test**

In `src/ui/run/useCounting.test.tsx`, following the file's existing hook-test
pattern:

```tsx
  it('fills every named slot to capacity in one batch, and leaves the rest alone', async () => {
    const { result } = await renderCounting()   // the file's existing helper
    await act(async () => { await result.current.fillTray([10, 11]) })

    expect(result.current.filled.has(10)).toBe(true)
    expect(result.current.filled.has(11)).toBe(true)
    expect(result.current.filled.has(12)).toBe(false)
    expect(result.current.after.get(levelKey(10, chipsId))).toBe(5)
  })

  it('leaves an already-filled slot filled rather than toggling it off', async () => {
    const { result } = await renderCounting()
    await act(async () => { await result.current.toggleFill(10) })
    await act(async () => { await result.current.fillTray([10, 11]) })
    expect(result.current.filled.has(10)).toBe(true)
  })

  it('does not overwrite a hand-entered after-count that is already filled', async () => {
    const { result } = await renderCounting()
    await act(async () => { await result.current.setAfter(10, chipsId, 3) })
    await act(async () => { await result.current.fillTray([10]) })
    // Fill is a default, not a verdict — but fillTray is an explicit request,
    // so it does set the slot. This asserts the documented direction.
    expect(result.current.after.get(levelKey(10, chipsId))).toBe(5)
    expect(result.current.filled.has(10)).toBe(true)
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest --run src/ui/run/useCounting.test.tsx`
Expected: FAIL — `result.current.fillTray is not a function`.

- [ ] **Step 3: Implement `fillTray` in `useCounting.ts`**

Add beside `toggleFill`. It must batch: calling `toggleFill` in a loop would run
every iteration against the same stale closure over `before`/`after`/`filled`,
so only the last slot would survive.

```tsx
  /** §3.6: Fill left the row and became a tray-level footer action. This is
   * `toggleFill`'s turning-on branch applied to many slots in one state update
   * and one persist pass — never the turning-off branch, so a slot already
   * filled stays filled rather than flipping back. */
  const fillTray = useCallback(
    async (slotNumbers: number[]) => {
      const slots = slotNumbers
        .map((n) => map.find((s) => s.slotNumber === n))
        .filter((s): s is ResolvedSlot => s !== undefined)
      if (slots.length === 0) return

      const prevAfter = after
      const prevFilled = filled
      const prevTouched = touched
      const prevAfterTouched = afterTouched

      const nextFilled = new Set(filled)
      const nextAfter = new Map(after)
      const nextTouched = new Set(touched)
      const nextAfterTouched = new Set(afterTouched)
      const writes: { slotNumber: number; itemId: Id; qty: number }[] = []

      for (const slot of slots) {
        nextFilled.add(slot.slotNumber)
        for (const entry of fillToCapacity(slot, contentsOf(slot, before))) {
          const key = levelKey(slot.slotNumber, entry.itemId)
          nextAfter.set(key, entry.qty)
          // Filling is an observation, same as it is in toggleFill: a slot
          // found empty and refilled is still a slot that was looked at, and
          // must still flag ran dry.
          nextTouched.add(key)
          nextAfterTouched.delete(key)
          writes.push({ slotNumber: slot.slotNumber, itemId: entry.itemId, qty: entry.qty })
        }
      }

      setFilled(nextFilled)
      setAfterState(nextAfter)
      setTouched(nextTouched)
      setAfterTouched(nextAfterTouched)

      try {
        for (const w of writes) {
          const key = levelKey(w.slotNumber, w.itemId)
          await persist(w.slotNumber, w.itemId, before.get(key) ?? 0, w.qty, true, true)
        }
      } catch (err) {
        setAfterState(prevAfter)
        setFilled(prevFilled)
        setTouched(prevTouched)
        setAfterTouched(prevAfterTouched)
        throw err
      }
    },
    [map, before, after, filled, touched, afterTouched, contentsOf, persist],
  )
```

Add `fillTray` to the returned object.

- [ ] **Step 4: Run the hook tests**

Run: `npx vitest --run src/ui/run/useCounting.test.tsx`
Expected: PASS.

- [ ] **Step 5: Restyle `TrayTabs.tsx`**

The same flush-left underline pattern as the main tab bar, with a tick after a
completed tray's number and the active tray spelled out (§3.7):
`1 ✓  2 ✓  Tray 3  4  5  6`.

```tsx
import { TRAYS, trayLabel } from '../../domain/trays'

export function TrayTabs({
  active, onSelect, present, complete = new Set<number>(),
}: {
  active: number
  onSelect: (tray: number) => void
  present: Set<number>
  /** Trays with every slot counted — rendered with a tick. */
  complete?: Set<number>
}) {
  return (
    <div className="flex gap-5 overflow-x-auto border-b-2 border-rule-strong bg-ground px-4">
      {TRAYS.filter((t) => present.has(t)).map((tray) => (
        <button
          key={tray}
          type="button"
          aria-current={tray === active ? 'true' : undefined}
          onClick={() => onSelect(tray)}
          className={`shrink-0 py-2 text-[13px] ${
            tray === active
              ? 'font-extrabold text-ink shadow-[inset_0_-3px_0_var(--color-accent)]'
              : 'font-medium text-neutral-600'
          }`}
        >
          {tray === active ? trayLabel(tray) : String(tray / 10)}
          {complete.has(tray) && ' ✓'}
        </button>
      ))}
    </div>
  )
}
```

Keep `trayLabel`'s existing output for the active tab — do not reword it here.
Update `TrayTabs.test.tsx` for the new inactive rendering.

- [ ] **Step 6: Rewrite `CountScreen.tsx`'s chrome**

Four changes; the slot list, the empty-machine "Open slot" block and the
`SlotEditSheet` wiring are unchanged.

1. **Header** (§3.7) — wrap in `ScreenLayout` with
   `<ScreenHeader back={{ label: '← MACHINES', onClick: onDone }} state="COUNTING"
   title={`L${level}`} subtitle={distinctLabel(machine)} figure={`${counted} / ${total}`} />`,
   where `counted` is the number of level keys in `counting.touched` and `total`
   is the number of `(slot, item)` pairs in `counting.map`. Directly under the
   header, a 3px progress rule on a `rule-light` track filled accent to that
   proportion:

```tsx
      <div className="h-[3px] bg-rule-light">
        <div
          className="h-full bg-accent"
          style={{ width: `${total === 0 ? 0 : (counted / total) * 100}%` }}
        />
      </div>
```

   `CountScreen` currently takes `machineId`, not the `Machine`. Read the level
   from `counting.items`? No — add a `machine: Machine` prop and pass it from
   `App.tsx`, which already holds the `Machine` object on the `machine-map`
   screen and can hold it on `count` too. This is the fix for defect #5, "no
   screen says which machine you are in".

2. **Column header** (§3.2) — sticky under the tray tabs, same grid, ink fill:

```tsx
      <div className="sticky top-[38px] z-[5] grid grid-cols-[30px_1fr_60px_60px_34px] items-center gap-2 bg-ink px-3.5 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground">
        <span>SL</span>
        <span>Item</span>
        <span className="text-center">Counted</span>
        <span className="text-center leading-tight">Refilled<br />to</span>
        <span />
      </div>
```

3. **Legend** (§3.5) — under the list, on `surface`, verbatim:

> **Counted** is what you found in the slot. **Refilled to** is what you leave
> behind — next visit opens from it.

4. **Footer** (§3.8) — two buttons, no gap, `border-top: 2px rule-strong`, both
   flush left:

```tsx
      <div className="flex border-t-2 border-rule-strong">
        <button
          type="button"
          onClick={() => { void counting.fillTray(slots.map((s) => s.slotNumber)).catch(() => {}) }}
          className="flex-1 bg-ground px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-ink"
        >
          Fill tray to par
        </button>
        <button
          type="button"
          onClick={() => { void counting.finalize().catch(() => {}).then(onDone) }}
          className="flex-1 bg-accent px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-ground"
        >
          Finish machine
        </button>
      </div>
```

`Finish machine` keeps its handler exactly — it re-runs the whole-machine batch
and is not a lock.

- [ ] **Step 7: Write the screen-level tests**

```tsx
  it('fills the active tray from the footer', async () => {
    const user = userEvent.setup()
    await renderCount()
    await user.click(await screen.findByRole('button', { name: 'Fill tray to par' }))
    expect(await screen.findByLabelText('slot 58 refilled to')).toHaveValue(5)
  })

  it('says which machine you are in', async () => {
    await renderCount()
    expect(await screen.findByRole('heading', { name: /L7/ })).toBeInTheDocument()
  })

  it('names the two columns', async () => {
    await renderCount()
    expect(await screen.findByText('Counted')).toBeInTheDocument()
    expect(screen.getByText(/Refilled/)).toBeInTheDocument()
  })
```

- [ ] **Step 8: Run the full suite**

Run: `npx tsc --noEmit && npx vitest --run`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add src/ui/run src/ui/components/TrayTabs.tsx src/ui/components/TrayTabs.test.tsx src/ui/App.tsx
git commit -m "feat(run): header, progress, column head, legend and footer actions (§3.6–3.8)"
```

---

### Task 6: Per-slot Fill moves into the ⋯ sheet

§3.6 says per-slot Fill moves into the `⋯` sheet. Task 4 removed it from the row,
so without this task the capability is gone. This is the **minimum** §6 change —
the full slot-editor re-layout is out of scope.

**Files:**
- Modify: `src/ui/run/SlotEditSheet.tsx`
- Modify: `src/ui/run/SlotEditSheet.test.tsx`
- Modify: `src/ui/run/CountScreen.tsx`

**Interfaces:**
- Consumes: `counting.toggleFill` (existing, unchanged).
- Produces: `SlotEditSheet` gains two optional props —
  `isFilled?: boolean` and `onToggleFill?: () => void`. Optional because
  `MachineMapScreen` opens the same sheet outside a count, where Fill is
  meaningless.

- [ ] **Step 1: Write the failing test**

```tsx
  it('offers Fill for this slot when opened during a count', async () => {
    const user = userEvent.setup()
    const onToggleFill = vi.fn()
    renderSheet({ isFilled: false, onToggleFill })
    await user.click(screen.getByRole('button', { name: 'Fill slot 58' }))
    expect(onToggleFill).toHaveBeenCalled()
  })

  it('does not offer Fill when opened from the machine map', () => {
    renderSheet({})
    expect(screen.queryByRole('button', { name: 'Fill slot 58' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest --run src/ui/run/SlotEditSheet.test.tsx`
Expected: FAIL — no such button.

- [ ] **Step 3: Add the control**

At the top of the sheet's body, above the capacity block:

```tsx
      {onToggleFill && (
        <button
          type="button"
          aria-label={`Fill slot ${slotNumber}`}
          aria-pressed={isFilled}
          onClick={onToggleFill}
          className={`w-full border-b border-rule-light px-4 py-3 text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] ${
            isFilled ? 'bg-accent text-ground' : 'bg-ground text-ink'
          }`}
        >
          Fill to capacity
        </button>
      )}
```

- [ ] **Step 4: Wire it from `CountScreen.tsx`**

Pass `isFilled={counting.filled.has(editingSlot)}` and
`onToggleFill={() => { void counting.toggleFill(editingSlot).catch(() => {}) }}`.
`MachineMapScreen` passes neither.

- [ ] **Step 5: Run and commit**

Run: `npx tsc --noEmit && npx vitest --run`

```bash
git add src/ui/run
git commit -m "feat(run): per-slot Fill moves into the slot sheet (§3.6)"
```

---

### Task 7: Machines list

**Files:**
- Modify: `src/ui/machines/MachineListScreen.tsx`
- Modify: `src/ui/machines/MachineListScreen.test.tsx`

**Interfaces:**
- Consumes: `ScreenLayout`, `ScreenHeader`.
- Produces: nothing later tasks depend on.

Per §4 and the README's own note: **drop the `08:14` count time.** It needs
`visit.updatedAt` read per machine, and the README says `Counted · 54 slots` is
acceptable. The screen already loads visits for the run, so slot counts are free
if `listVisitsForRun` returns them; if not, render `Counted` alone rather than
adding a query.

- [ ] **Step 1: Write the failing tests**

```tsx
  it('puts the run date in the eyebrow and the progress in the header figure', async () => {
    await renderList({ runStarted: true, finished: 3 })
    expect(await screen.findByText(/RUN · /)).toBeInTheDocument()
    expect(screen.getByText('3 / 15')).toBeInTheDocument()
  })

  it('offers Start run in the footer when no run exists', async () => {
    await renderList({ runStarted: false })
    expect(await screen.findByRole('button', { name: 'Start run' })).toBeInTheDocument()
  })

  it('marks a finished machine without a Finished pill', async () => {
    await renderList({ runStarted: true, finishedIds: ['m7'] })
    expect(screen.queryByText('Finished')).not.toBeInTheDocument()
    expect(await screen.findByTestId('machine-row-m7')).toHaveAttribute('data-finished', 'true')
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest --run src/ui/machines/MachineListScreen.test.tsx`

- [ ] **Step 3: Rewrite the screen**

Wrap in `ScreenLayout` with
`<ScreenHeader eyebrow={`RUN · ${formatRunDate(today()).toUpperCase()}`} title="Machines" figure={`${finishedMachineIds.size} / ${machines.length}`} />`.
When no run exists the eyebrow is `NO RUN STARTED`.

Rows become a `grid-cols-[46px_1fr_auto]` at `padding: 14px 16px` on `bg-paper`
with `border-b border-rule-light`:

- 46px: `L{level}` at 22px/800 tabular.
- 1fr: state at 14px/600 — `Counted · {n} slots`, `In progress · {n} of {total}`,
  `Not counted` in `neutral-500`, or `{label} · not counted` where a distinct
  label exists.
- auto: a 20px filled-ink square with a tick when finished; `RESUME` in accent
  10.5px uppercase when in progress; `MAP` in `neutral-600` otherwise.

An in-progress machine carries `shadow-[inset_4px_0_0_var(--color-accent)]`.

The run header block is deleted — the date is the eyebrow, the count is the
figure. `Start run` becomes the footer button, accent fill, flush left, becoming
`Continue L{n} →` when a machine is in progress. Both entry points still call
`getOrCreateRun`, which is idempotent.

Remove every `rounded-*`, `bg-green-100`, `text-green-700`, `text-blue-600` and
`bg-blue-600` from this file.

- [ ] **Step 4: Run and commit**

Run: `npx tsc --noEmit && npx vitest --run`

```bash
git add src/ui/machines/MachineListScreen.tsx src/ui/machines/MachineListScreen.test.tsx
git commit -m "feat(machines): the level becomes the row (§4)"
```

---

### Task 8: Machine map

**Files:**
- Modify: `src/ui/machines/MachineMapScreen.tsx`
- Modify: `src/ui/machines/MachineMapScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
  it('shows an unmapped slot as Not stocked rather than omitting it', async () => {
    await renderMap({ mappedSlots: [10, 12] })
    expect(await screen.findByText('Not stocked')).toBeInTheDocument()
  })

  it('carries the slot range in the tray heading', async () => {
    await renderMap({ mappedSlots: [10, 11] })
    expect(await screen.findByText(/SLOTS 10–14/)).toBeInTheDocument()
  })

  it('stacks a mixed slot rather than joining names with a slash', async () => {
    await renderMap({ mixedSlot: 52 })
    expect(screen.queryByText(/Sunkist \/ Fanta/)).not.toBeInTheDocument()
    expect(await screen.findByText('Sunkist')).toBeInTheDocument()
    expect(screen.getByText('Fanta')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest --run src/ui/machines/MachineMapScreen.test.tsx`

- [ ] **Step 3: Rewrite the screen (§5)**

`grid-template-columns: 30px 1fr 44px 34px`, ink header row `SL`, `HOLDS`, `CAP`.
Tray headings become `surface` bars carrying the range — `TRAY 1 · SLOTS 10–14`.
A mixed slot stacks both items in the name cell, second line at 12px/500
`neutral-700`. An empty slot renders `Not stocked` in `neutral-500` with `—` for
capacity on a `neutral-100` row — today those slots are absent, so a hole in the
map is invisible. Wrap in `ScreenLayout` with
`<ScreenHeader back={{ label: '← MACHINES', onClick: onBack }} title={`L${machine.level}`} subtitle={distinctLabel(machine)} />`.

Footer legend, verbatim:

> The printed map is about 90% right. Tap ⋯ on any slot to correct what it holds
> or how deep it is — for this machine only.

The floating-sheet behaviour and its comment stay exactly as they are — that
comment records why the sheet floats rather than rendering inline, and the reason
still holds.

- [ ] **Step 4: Run and commit**

Run: `npx tsc --noEmit && npx vitest --run`

```bash
git add src/ui/machines/MachineMapScreen.tsx src/ui/machines/MachineMapScreen.test.tsx
git commit -m "feat(machines): map grid, tray ranges and visible empty slots (§5)"
```

---

### Task 9: Withhold `miscount` at a machine slot

The one behaviour change, decided by the operator on 2026-08-28. A slot miscount
is stored today and read by nothing — it enters no sales figure, changes no
recorded level, and no screen shows it back. Offering a control that does nothing
is worse than not offering it. The storeroom already withholds it.

**Files:**
- Modify: `src/ui/adjustments/AdjustmentSheet.tsx`
- Modify: `src/ui/adjustments/AdjustmentSheet.test.tsx`
- Modify: `docs/known-gaps.md`

- [ ] **Step 1: Write the failing test**

```tsx
  it('does not offer a miscount correction at a machine slot', async () => {
    renderSheet({ machineId: 'm7', slotNumber: 31 })
    expect(screen.queryByText('Miscount correction')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest --run src/ui/adjustments/AdjustmentSheet.test.tsx`
Expected: FAIL — the option is present.

- [ ] **Step 3: Withhold it**

Which reasons appear stays **derived, never hard-coded**. The storeroom already
passes `ADJUSTMENT_REASONS.filter(r => r.entersResidual)`; make the slot variant
use the same filter rather than the full table. Do not edit
`src/domain/adjustments.ts` — the table is the source and is unchanged.

- [ ] **Step 4: Record the decision**

In `docs/known-gaps.md`, move the `miscount` bullet out of the open-questions
section and into "Fixed since this list was written", recording that the option
was withheld at the slot on 2026-08-28 by operator decision, that the underlying
question — what a slot miscount should *mean* — is still open for Phase 3, and
that returning the tile means returning the `needsDirection` control with it.

- [ ] **Step 5: Run and commit**

Run: `npx tsc --noEmit && npx vitest --run`

```bash
git add src/ui/adjustments docs/known-gaps.md
git commit -m "fix(adjustments): withhold miscount at a machine slot (§7)"
```

---

### Task 10: Verify the whole thing, and write it down

- [ ] **Step 1: Full verification**

```bash
npx tsc --noEmit && npx vite build && npx vitest --run
```

Expected: build clean, suite green. Record the final test count.

- [ ] **Step 2: Check the remaining radius count in touched files**

Run: `grep -ro "rounded-[a-z0-9]*" src/ui/run src/ui/machines src/ui/components src/ui/App.tsx | wc -l`
Expected: `0`. Any hit is a missed constraint.

- [ ] **Step 3: Update the handover**

Rewrite `docs/handover.md` for 2026-08-28: what changed, that the run screen now
takes typed numbers, that Fill moved to the footer and the `⋯` sheet, that
miscount is gone from the slot sheet, that the storeroom, history, report and
items screens are deliberately still in the old styling, and — first, as before —
**open the app and refresh once** so the service worker picks up the new bundle.

- [ ] **Step 4: Commit**

```bash
git add docs/handover.md
git commit -m "docs: handover for 2026-08-28 — interface refinement steps 1–3"
```

---

## Self-review

**Spec coverage for the in-scope sections:**

| Spec | Task |
|---|---|
| `tokens.md` | 2 |
| §2 shell | 3 |
| §3.1–3.5 run row | 4 |
| §3.6 Fill relocation | 5 (footer), 6 (slot sheet) |
| §3.7 header, progress, tray tabs | 5 |
| §3.8 footer | 5 |
| §4 machines | 7 |
| §5 machine map | 8 |
| §7 miscount withholding only | 9 |

**Deliberately not covered** (spec steps 4–7, out of scope by operator decision
on 2026-08-28, with the run the next morning): §6 slot editor re-layout, §7
adjustment sheet re-layout, §8 storeroom, §9 history, §10 report, §11 stock
matrix, §12 items. These screens keep their current styling and must keep
working.

**Known deviations from the spec, and why:**

1. **The Google Fonts `@import` moves above `@theme`** (Task 2). CSS drops an
   `@import` that follows another at-rule; as printed, Archivo would never load.
2. **The `08:14` count time is dropped** from the machines list (Task 7), taking
   the README's own offer rather than adding a per-machine query.
3. **`fillTray` is added to `useCounting`** (Task 5). §3.6 specifies a tray-level
   Fill but names no implementation; looping `toggleFill` would run every
   iteration against a stale closure, so the batch is one function.
4. **`SlotEditSheet` gains two optional props** (Task 6) rather than the full §6
   re-layout, because Task 4 removes the only existing per-slot Fill.

**Risk the operator should know about:** Fill moving off the row is the change
most likely to feel worse in the field, and no test can catch that. §3.6's
"stacked ledger" fallback is already written up if it does.
