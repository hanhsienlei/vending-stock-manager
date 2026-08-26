# Phase 1 — Record: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the paper stock sheet — an installable offline app that holds the item
catalogue, the 15 machine maps, and lets a full restock run be counted machine-by-machine
without a second counting pass.

**Architecture:** Local-first PWA. All state in IndexedDB via Dexie, reached only through
repository modules. Every calculation that can be wrong — map resolution, last-recorded
levels, fill targets — lives in `src/domain/` as pure functions over plain data with zero
I/O, and is unit-tested without a browser or a database. React screens are thin and call
into those two layers.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, Dexie 4, Tailwind 4, `vite-plugin-pwa`,
Vitest 2 with `fake-indexeddb` and React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Par and capacity are always operator-set.** No default value, no inference, no
  learning from observed counts. `basePar` is a required field when creating an item.
- **Client-generated UUIDs on every entity.** Never auto-increment IDs. Every record
  carries `updatedAt: number` (epoch ms). This is what allows sync to be added later.
- **All persistence goes through repository modules** in `src/data/repositories/`. UI and
  domain code never touch Dexie directly.
- **`src/domain/` is pure.** No imports from `src/data/`, `dexie`, `react`, or anything
  performing I/O. Enforced by a test in Task 2.
- **Nothing awaits the network.** No `fetch` in Phase 1 at all.
- **A finalized visit is immutable.** Corrections are new records, never edits.
- **Machine screens use loose units only.** Boxes exist only at the storeroom, which is
  Phase 2.
- Version floors: `react@^19.0.0`, `vite@^6.0.0`, `dexie@^4.0.0`, `vitest@^2.1.0`,
  `tailwindcss@^4.0.0`, `typescript@^5.7.0`.
- Slot numbers are the machine's physical numbers (`10–14`, `20–29`, `30–39`, `40–49`,
  `50–59`, `60–69`). A tray is `Math.floor(slotNumber / 10) * 10`.

## Out of scope for Phase 1

Named so no one builds them early: trolley and pick list, allocation, storeroom, pack/loose
entry, adjustments and reason codes, sales calculation, demand rates, ran-dry reporting,
order suggestions, notes and photos, backup upload. `Fill` in this phase tops a slot up to
capacity with no trolley-availability constraint — Task 8 notes exactly where Phase 3 hooks
in.

---

## File Structure

```
src/
  domain/
    types.ts          entity interfaces + Id; no logic
    ids.ts            newId(), now()
    trays.ts          trayOf(), TRAYS, slotsInTray()
    placement.ts      resolveMachineMap() — base/override → concrete map
    levels.ts         lastRecordedLevels() — seed values for a count
    fill.ts           fillToCapacity() — what Fill adds to a slot
  data/
    db.ts             Dexie schema and table declarations
    repositories/
      items.ts        listItems, getItem, putItem, deleteItem
      machines.ts     listMachines, putMachine
      placements.ts   listPlacements, putPlacement, effectivePlacementFor
      slotConfigs.ts  listSlotConfigs, putSlotConfig
      runs.ts         listRuns, getRun, createRun
      visits.ts       getVisit, visitForMachine, putCountLines, finalizeVisit
  ui/
    App.tsx           routing shell
    items/ItemListScreen.tsx, ItemEditScreen.tsx
    machines/MachineListScreen.tsx, MachineMapScreen.tsx
    run/RunScreen.tsx, CountScreen.tsx
    run/SlotRow.tsx   one slot, single or mixed
    components/Stepper.tsx, TrayTabs.tsx
  test/setup.ts       fake-indexeddb + jest-dom registration
```

Split by responsibility, not layer depth: `placement.ts`, `levels.ts`, and `fill.ts` are
separate because they fail independently and each carries its own test file.

---

## Task 1: Project scaffold and green baseline

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`,
  `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `src/index.css`, `src/test/setup.ts`
- Create: `src/domain/ids.ts`
- Test: `src/domain/ids.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `newId(): string`, `now(): number` from `src/domain/ids.ts`. `npm test` runs
  Vitest once and exits.

Scaffolding is folded into this task because the baseline test is what proves it works.
The directory already contains `docs/` and `.gitignore`, so files are written explicitly
rather than via `npm create vite`, which prompts interactively.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "vending-stock-manager",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "dexie": "^4.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vite-plugin-pwa": "^0.21.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write the config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

`vite.config.ts`:

```ts
// `defineConfig` comes from vitest/config, not vite — the plain Vite export has no
// `test` key and the config will not typecheck.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vending Stock Manager',
        short_name: 'Vending',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0071e3',
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Vending Stock Manager</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@import "tailwindcss";
```

`src/test/setup.ts`:

```ts
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
```

`src/ui/App.tsx`:

```tsx
export default function App() {
  return <h1 className="p-4 text-xl font-semibold">Vending Stock Manager</h1>
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import './index.css'

// Spec §8.5 — ask the browser not to evict our IndexedDB data.
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: completes without errors, `node_modules/` created.

- [ ] **Step 4: Write the failing test**

`src/domain/ids.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { newId, now } from './ids'

describe('newId', () => {
  it('returns a distinct string each call', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()))
    expect(ids.size).toBe(1000)
  })

  it('returns a non-empty string', () => {
    expect(typeof newId()).toBe('string')
    expect(newId().length).toBeGreaterThan(10)
  })
})

describe('now', () => {
  it('returns epoch milliseconds', () => {
    const t = now()
    expect(Number.isInteger(t)).toBe(true)
    expect(t).toBeGreaterThan(1_700_000_000_000)
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./ids"`.

- [ ] **Step 6: Write minimal implementation**

`src/domain/ids.ts`:

```ts
export function newId(): string {
  return crypto.randomUUID()
}

export function now(): number {
  return Date.now()
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 3 tests.

- [ ] **Step 8: Verify the app builds**

Run: `npm run build`
Expected: exits 0, `dist/` produced.

- [ ] **Step 9: Add `node_modules` and `dist` to `.gitignore`**

Append to `.gitignore`:

```
node_modules/
dist/
dev-dist/
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + Vitest with green baseline"
```

---

## Task 2: Domain types and the purity guard

**Files:**
- Create: `src/domain/types.ts`, `src/domain/trays.ts`
- Test: `src/domain/trays.test.ts`, `src/domain/purity.test.ts`

**Interfaces:**
- Consumes: `newId`, `now` from Task 1.
- Produces: all entity types below, plus `trayOf(slotNumber: number): number`,
  `TRAYS: readonly number[]`, `slotsInTray(slots: number[], tray: number): number[]`.

- [ ] **Step 1: Write `src/domain/types.ts`**

```ts
export type Id = string

export interface Item {
  id: Id
  name: string
  price: number       // dollars, e.g. 4.5
  basePar: number     // operator-set; seeds SlotConfig.capacity on first assignment
  boxSize: number     // units per supplier box; used from Phase 2
  updatedAt: number
}

export interface Machine {
  id: Id
  label: string       // e.g. "Lift lobby"
  level: number       // 2..16 — orders the walk
  updatedAt: number
}

export type PlacementScope =
  | { kind: 'base' }
  | { kind: 'machine'; machineId: Id }

export interface ItemPlacement {
  id: Id
  itemId: Id
  scope: PlacementScope
  slots: number[]     // empty array = explicitly not stocked
  updatedAt: number
}

export interface SlotConfig {
  id: Id
  machineId: Id
  slotNumber: number
  capacity: number    // operator-set; physical depth, shared across a mixed slot
  accepts: Id[]       // itemIds in preference order
  updatedAt: number
}

/** A slot of one machine, after base/override resolution. */
export interface ResolvedSlot {
  slotNumber: number
  capacity: number
  accepts: Id[]       // ordered, always at least one entry
}

export type MachineMap = ResolvedSlot[]   // ascending by slotNumber

export interface Run {
  id: Id
  date: string        // ISO yyyy-mm-dd
  createdAt: number
  updatedAt: number
}

export type VisitStatus = 'draft' | 'finalized'

export interface Visit {
  id: Id
  runId: Id
  machineId: Id
  status: VisitStatus
  finalizedAt?: number
  updatedAt: number
}

export interface CountLine {
  id: Id
  visitId: Id
  slotNumber: number
  itemId: Id
  before: number
  after: number
  touched: boolean    // true once the operator alters `before`
  updatedAt: number
}
```

- [ ] **Step 2: Write the failing tests**

`src/domain/trays.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { trayOf, TRAYS, slotsInTray } from './trays'

describe('trayOf', () => {
  it('maps a slot to its tray', () => {
    expect(trayOf(10)).toBe(10)
    expect(trayOf(14)).toBe(10)
    expect(trayOf(35)).toBe(30)
    expect(trayOf(69)).toBe(60)
  })
})

describe('TRAYS', () => {
  it('lists the six physical trays in order', () => {
    expect([...TRAYS]).toEqual([10, 20, 30, 40, 50, 60])
  })
})

describe('slotsInTray', () => {
  it('selects only the slots belonging to the tray, ascending', () => {
    expect(slotsInTray([35, 12, 31, 58, 10], 30)).toEqual([31, 35])
  })

  it('returns an empty array when the tray has no slots', () => {
    expect(slotsInTray([12, 58], 60)).toEqual([])
  })
})
```

`src/domain/purity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const FORBIDDEN = ['dexie', 'react', '../data/', './data/', 'node:fs']

describe('domain purity', () => {
  it('imports nothing that performs I/O', () => {
    const dir = join(process.cwd(), 'src/domain')
    const offenders: string[] = []

    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
      const source = readFileSync(join(dir, file), 'utf8')
      for (const bad of FORBIDDEN) {
        if (source.includes(`from '${bad}`)) offenders.push(`${file} -> ${bad}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: `trays.test.ts` FAILs with `Failed to resolve import "./trays"`. `purity.test.ts`
passes already — that is correct; it is a regression guard, not a red test.

- [ ] **Step 4: Write minimal implementation**

`src/domain/trays.ts`:

```ts
export const TRAYS = [10, 20, 30, 40, 50, 60] as const

export function trayOf(slotNumber: number): number {
  return Math.floor(slotNumber / 10) * 10
}

export function slotsInTray(slots: number[], tray: number): number[] {
  return slots.filter((s) => trayOf(s) === tray).sort((a, b) => a - b)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests across both files.

- [ ] **Step 6: Commit**

```bash
git add src/domain
git commit -m "feat: add domain types, tray helpers, and domain purity guard"
```

---

## Task 3: Placement resolution

The load-bearing pure function. `ItemPlacement` is the single source of truth for slot
occupancy and is resolved at read time — there is no stored machine map to fall stale.

**Files:**
- Create: `src/domain/placement.ts`
- Test: `src/domain/placement.test.ts`

**Interfaces:**
- Consumes: `Item`, `ItemPlacement`, `SlotConfig`, `ResolvedSlot`, `MachineMap`, `Id` from
  Task 2.
- Produces:
  - `effectivePlacement(itemId: Id, machineId: Id, placements: ItemPlacement[]): ItemPlacement | undefined`
  - `resolveMachineMap(machineId: Id, items: Item[], placements: ItemPlacement[], slotConfigs: SlotConfig[]): MachineMap`

Resolution rules, in order:
1. For each item, a machine-scoped placement fully replaces the base placement.
2. `slots: []` means explicitly not stocked — it suppresses the base placement.
3. Items are grouped by slot number; a slot may accept several.
4. `accepts` order comes from `SlotConfig.accepts` for items listed there; items not listed
   are appended sorted by item name, so the order is always deterministic.
5. `capacity` comes from `SlotConfig.capacity`; with no `SlotConfig`, it is seeded from the
   `basePar` of the first accepted item.

- [ ] **Step 1: Write the failing test**

`src/domain/placement.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { effectivePlacement, resolveMachineMap } from './placement'
import type { Item, ItemPlacement, SlotConfig } from './types'

const item = (id: string, name: string, basePar: number): Item => ({
  id, name, price: 4.5, basePar, boxSize: 24, updatedAt: 1,
})

const base = (id: string, itemId: string, slots: number[]): ItemPlacement => ({
  id, itemId, scope: { kind: 'base' }, slots, updatedAt: 1,
})

const forMachine = (
  id: string, itemId: string, machineId: string, slots: number[],
): ItemPlacement => ({
  id, itemId, scope: { kind: 'machine', machineId }, slots, updatedAt: 1,
})

const coke = item('coke', 'Coke', 8)
const sunkist = item('sunkist', 'Sunkist', 5)
const fanta = item('fanta', 'Fanta', 5)

describe('effectivePlacement', () => {
  it('falls back to the base placement', () => {
    const placements = [base('p1', 'coke', [58, 59])]
    expect(effectivePlacement('coke', 'L7', placements)?.slots).toEqual([58, 59])
  })

  it('prefers a machine-scoped placement over the base', () => {
    const placements = [base('p1', 'coke', [58, 59]), forMachine('p2', 'coke', 'L5', [57])]
    expect(effectivePlacement('coke', 'L5', placements)?.slots).toEqual([57])
    expect(effectivePlacement('coke', 'L7', placements)?.slots).toEqual([58, 59])
  })

  it('returns undefined when the item has no placement at all', () => {
    expect(effectivePlacement('coke', 'L7', [])).toBeUndefined()
  })
})

describe('resolveMachineMap', () => {
  it('places a base item into its slots', () => {
    const map = resolveMachineMap('L7', [coke], [base('p1', 'coke', [58, 59])], [])
    expect(map).toEqual([
      { slotNumber: 58, capacity: 8, accepts: ['coke'] },
      { slotNumber: 59, capacity: 8, accepts: ['coke'] },
    ])
  })

  it('honours a machine override', () => {
    const placements = [base('p1', 'coke', [58, 59]), forMachine('p2', 'coke', 'L5', [57])]
    const map = resolveMachineMap('L5', [coke], placements, [])
    expect(map.map((s) => s.slotNumber)).toEqual([57])
  })

  it('treats an empty slot list as not stocked, suppressing the base', () => {
    const placements = [base('p1', 'coke', [58, 59]), forMachine('p2', 'coke', 'L9', [])]
    expect(resolveMachineMap('L9', [coke], placements, [])).toEqual([])
  })

  it('groups several items into one shared slot', () => {
    const placements = [base('p1', 'sunkist', [52]), base('p2', 'fanta', [52])]
    const map = resolveMachineMap('L7', [sunkist, fanta], placements, [])
    expect(map).toHaveLength(1)
    expect(map[0].accepts.sort()).toEqual(['fanta', 'sunkist'])
  })

  it('orders accepts by SlotConfig preference, appending unlisted items by name', () => {
    const placements = [
      base('p1', 'sunkist', [52]), base('p2', 'fanta', [52]), base('p3', 'coke', [52]),
    ]
    const configs: SlotConfig[] = [{
      id: 'c1', machineId: 'L7', slotNumber: 52, capacity: 5,
      accepts: ['sunkist'], updatedAt: 1,
    }]
    const map = resolveMachineMap('L7', [sunkist, fanta, coke], placements, configs)
    // 'sunkist' is listed first; 'Coke' then 'Fanta' follow, sorted by name
    expect(map[0].accepts).toEqual(['sunkist', 'coke', 'fanta'])
  })

  it('uses SlotConfig capacity when present', () => {
    const configs: SlotConfig[] = [{
      id: 'c1', machineId: 'L12', slotNumber: 58, capacity: 14,
      accepts: ['coke'], updatedAt: 1,
    }]
    const map = resolveMachineMap('L12', [coke], [base('p1', 'coke', [58])], configs)
    expect(map[0].capacity).toBe(14)
  })

  it('seeds capacity from the first accepted item basePar when unconfigured', () => {
    const map = resolveMachineMap('L7', [sunkist], [base('p1', 'sunkist', [52])], [])
    expect(map[0].capacity).toBe(5)
  })

  it('returns slots ascending by slot number', () => {
    const placements = [
      base('p1', 'coke', [58]), base('p2', 'sunkist', [52]), base('p3', 'fanta', [35]),
    ]
    const map = resolveMachineMap('L7', [coke, sunkist, fanta], placements, [])
    expect(map.map((s) => s.slotNumber)).toEqual([35, 52, 58])
  })

  it('ignores placements for items missing from the catalogue', () => {
    const map = resolveMachineMap('L7', [], [base('p1', 'ghost', [58])], [])
    expect(map).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/domain/placement.test.ts`
Expected: FAIL — `Failed to resolve import "./placement"`.

- [ ] **Step 3: Write minimal implementation**

`src/domain/placement.ts`:

```ts
import type {
  Id, Item, ItemPlacement, MachineMap, ResolvedSlot, SlotConfig,
} from './types'

export function effectivePlacement(
  itemId: Id,
  machineId: Id,
  placements: ItemPlacement[],
): ItemPlacement | undefined {
  const forItem = placements.filter((p) => p.itemId === itemId)
  return (
    forItem.find((p) => p.scope.kind === 'machine' && p.scope.machineId === machineId) ??
    forItem.find((p) => p.scope.kind === 'base')
  )
}

export function resolveMachineMap(
  machineId: Id,
  items: Item[],
  placements: ItemPlacement[],
  slotConfigs: SlotConfig[],
): MachineMap {
  const byId = new Map(items.map((i) => [i.id, i]))
  const bySlot = new Map<number, Id[]>()

  for (const item of items) {
    const placement = effectivePlacement(item.id, machineId, placements)
    if (!placement) continue
    for (const slotNumber of placement.slots) {
      const existing = bySlot.get(slotNumber) ?? []
      existing.push(item.id)
      bySlot.set(slotNumber, existing)
    }
  }

  const configFor = (slotNumber: number) =>
    slotConfigs.find((c) => c.machineId === machineId && c.slotNumber === slotNumber)

  const slots: ResolvedSlot[] = []

  for (const [slotNumber, itemIds] of bySlot) {
    const config = configFor(slotNumber)
    const preferred = (config?.accepts ?? []).filter((id) => itemIds.includes(id))
    const rest = itemIds
      .filter((id) => !preferred.includes(id))
      .sort((a, b) => (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? ''))
    const accepts = [...preferred, ...rest]

    slots.push({
      slotNumber,
      capacity: config?.capacity ?? byId.get(accepts[0])?.basePar ?? 0,
      accepts,
    })
  }

  return slots.sort((a, b) => a.slotNumber - b.slotNumber)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/domain/placement.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/placement.ts src/domain/placement.test.ts
git commit -m "feat: resolve machine maps from base and per-machine placements"
```

---

## Task 4: Dexie schema and repositories

**Files:**
- Create: `src/data/db.ts`, `src/data/repositories/items.ts`,
  `src/data/repositories/machines.ts`, `src/data/repositories/placements.ts`,
  `src/data/repositories/slotConfigs.ts`
- Test: `src/data/repositories/repositories.test.ts`

**Interfaces:**
- Consumes: all types from Task 2, `newId`/`now` from Task 1.
- Produces:
  - `db` — the Dexie instance with tables `items`, `machines`, `placements`,
    `slotConfigs`, `runs`, `visits`, `countLines`.
  - `items.ts`: `listItems(): Promise<Item[]>`, `getItem(id): Promise<Item | undefined>`,
    `saveItem(draft: Omit<Item,'id'|'updatedAt'> & { id?: Id }): Promise<Item>`,
    `deleteItem(id): Promise<void>`
  - `machines.ts`: `listMachines(): Promise<Machine[]>` (ascending by `level`),
    `saveMachine(draft: Omit<Machine,'id'|'updatedAt'> & { id?: Id }): Promise<Machine>`
  - `placements.ts`: `listPlacements(): Promise<ItemPlacement[]>`,
    `setPlacement(itemId: Id, scope: PlacementScope, slots: number[]): Promise<ItemPlacement>`
  - `slotConfigs.ts`: `listSlotConfigs(): Promise<SlotConfig[]>`,
    `setSlotConfig(machineId: Id, slotNumber: number, patch: { capacity?: number; accepts?: Id[] }): Promise<SlotConfig>`

`setPlacement` upserts on `(itemId, scope)` so an item has at most one base placement and
at most one placement per machine. `setSlotConfig` upserts on `(machineId, slotNumber)`.

- [ ] **Step 1: Write the failing test**

`src/data/repositories/repositories.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { listItems, getItem, saveItem, deleteItem } from './items'
import { listMachines, saveMachine } from './machines'
import { listPlacements, setPlacement } from './placements'
import { listSlotConfigs, setSlotConfig } from './slotConfigs'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('items', () => {
  it('saves with a generated id and updatedAt', async () => {
    const saved = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    expect(saved.id).toBeTruthy()
    expect(saved.updatedAt).toBeGreaterThan(0)
    expect(await getItem(saved.id)).toEqual(saved)
  })

  it('updates in place when an id is supplied', async () => {
    const saved = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await saveItem({ id: saved.id, name: 'Coke', price: 5, basePar: 8, boxSize: 24 })
    const all = await listItems()
    expect(all).toHaveLength(1)
    expect(all[0].price).toBe(5)
  })

  it('deletes', async () => {
    const saved = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await deleteItem(saved.id)
    expect(await listItems()).toEqual([])
  })
})

describe('machines', () => {
  it('lists ascending by level', async () => {
    await saveMachine({ label: 'Lift lobby', level: 12 })
    await saveMachine({ label: 'Pool corridor', level: 3 })
    expect((await listMachines()).map((m) => m.level)).toEqual([3, 12])
  })
})

describe('placements', () => {
  it('keeps one base placement per item', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [58, 59])
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const all = await listPlacements()
    expect(all).toHaveLength(1)
    expect(all[0].slots).toEqual([58])
  })

  it('keeps base and machine placements side by side', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'base' }, [58, 59])
    await setPlacement(coke.id, { kind: 'machine', machineId: 'L5' }, [57])
    expect(await listPlacements()).toHaveLength(2)
  })

  it('stores an empty slot list as not stocked', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    await setPlacement(coke.id, { kind: 'machine', machineId: 'L9' }, [])
    const all = await listPlacements()
    expect(all[0].slots).toEqual([])
  })
})

describe('slotConfigs', () => {
  it('upserts on machine and slot number', async () => {
    await setSlotConfig('L7', 52, { capacity: 5 })
    await setSlotConfig('L7', 52, { accepts: ['sunkist', 'fanta'] })
    const all = await listSlotConfigs()
    expect(all).toHaveLength(1)
    expect(all[0].capacity).toBe(5)
    expect(all[0].accepts).toEqual(['sunkist', 'fanta'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/data`
Expected: FAIL — `Failed to resolve import "../db"`.

- [ ] **Step 3: Write the schema**

`src/data/db.ts`:

```ts
import Dexie, { type EntityTable } from 'dexie'
import type {
  CountLine, Item, ItemPlacement, Machine, Run, SlotConfig, Visit,
} from '../domain/types'

export const db = new Dexie('vending-stock-manager') as Dexie & {
  items: EntityTable<Item, 'id'>
  machines: EntityTable<Machine, 'id'>
  placements: EntityTable<ItemPlacement, 'id'>
  slotConfigs: EntityTable<SlotConfig, 'id'>
  runs: EntityTable<Run, 'id'>
  visits: EntityTable<Visit, 'id'>
  countLines: EntityTable<CountLine, 'id'>
}

db.version(1).stores({
  items: 'id, name',
  machines: 'id, level',
  placements: 'id, itemId',
  slotConfigs: 'id, [machineId+slotNumber]',
  runs: 'id, date',
  visits: 'id, runId, [runId+machineId]',
  countLines: 'id, visitId, [visitId+slotNumber]',
})
```

Note: `placements` is indexed on `itemId` only. `scope` is an object, which IndexedDB
cannot index, so scope matching happens in memory after loading an item's placements —
there are at most 16 per item.

- [ ] **Step 4: Write the repositories**

`src/data/repositories/items.ts`:

```ts
import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, Item } from '../../domain/types'

export function listItems(): Promise<Item[]> {
  return db.items.orderBy('name').toArray()
}

export function getItem(id: Id): Promise<Item | undefined> {
  return db.items.get(id)
}

export async function saveItem(
  draft: Omit<Item, 'id' | 'updatedAt'> & { id?: Id },
): Promise<Item> {
  const item: Item = { ...draft, id: draft.id ?? newId(), updatedAt: now() }
  await db.items.put(item)
  return item
}

export async function deleteItem(id: Id): Promise<void> {
  await db.items.delete(id)
}
```

`src/data/repositories/machines.ts`:

```ts
import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, Machine } from '../../domain/types'

export function listMachines(): Promise<Machine[]> {
  return db.machines.orderBy('level').toArray()
}

export async function saveMachine(
  draft: Omit<Machine, 'id' | 'updatedAt'> & { id?: Id },
): Promise<Machine> {
  const machine: Machine = { ...draft, id: draft.id ?? newId(), updatedAt: now() }
  await db.machines.put(machine)
  return machine
}
```

`src/data/repositories/placements.ts`:

```ts
import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, ItemPlacement, PlacementScope } from '../../domain/types'

export function listPlacements(): Promise<ItemPlacement[]> {
  return db.placements.toArray()
}

function sameScope(a: PlacementScope, b: PlacementScope): boolean {
  if (a.kind === 'base' && b.kind === 'base') return true
  return a.kind === 'machine' && b.kind === 'machine' && a.machineId === b.machineId
}

export async function setPlacement(
  itemId: Id,
  scope: PlacementScope,
  slots: number[],
): Promise<ItemPlacement> {
  const existing = (await db.placements.where('itemId').equals(itemId).toArray())
    .find((p) => sameScope(p.scope, scope))

  const placement: ItemPlacement = {
    id: existing?.id ?? newId(),
    itemId,
    scope,
    slots: [...slots].sort((a, b) => a - b),
    updatedAt: now(),
  }

  await db.placements.put(placement)
  return placement
}
```

`src/data/repositories/slotConfigs.ts`:

```ts
import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, SlotConfig } from '../../domain/types'

export function listSlotConfigs(): Promise<SlotConfig[]> {
  return db.slotConfigs.toArray()
}

export async function setSlotConfig(
  machineId: Id,
  slotNumber: number,
  patch: { capacity?: number; accepts?: Id[] },
): Promise<SlotConfig> {
  const existing = await db.slotConfigs
    .where('[machineId+slotNumber]')
    .equals([machineId, slotNumber])
    .first()

  const config: SlotConfig = {
    id: existing?.id ?? newId(),
    machineId,
    slotNumber,
    capacity: patch.capacity ?? existing?.capacity ?? 0,
    accepts: patch.accepts ?? existing?.accepts ?? [],
    updatedAt: now(),
  }

  await db.slotConfigs.put(config)
  return config
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test src/data`
Expected: PASS — 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/data
git commit -m "feat: add Dexie schema and catalogue repositories"
```

---

## Task 5: Item catalogue screens

**Files:**
- Create: `src/ui/items/ItemListScreen.tsx`, `src/ui/items/ItemEditScreen.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/items/ItemEditScreen.test.tsx`

**Interfaces:**
- Consumes: `listItems`, `saveItem` from Task 4.
- Produces:
  - `ItemEditScreen({ itemId, onDone })` — create or edit one item.
  - `ItemListScreen({ onSelect, onNew })`.

These screens use plain number inputs rather than steppers: typing `4.50` is faster than
tapping to it, and this is desk work, not a corridor. The `Stepper` component belongs to
the counting screen and is built in Task 9.

The critical behaviour under test is the Global Constraint: **`basePar` has no default and
saving is blocked until the operator sets it.**

- [ ] **Step 1: Write the failing test**

`src/ui/items/ItemEditScreen.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { listItems } from '../../data/repositories/items'
import { ItemEditScreen } from './ItemEditScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('ItemEditScreen', () => {
  it('starts with an empty par and refuses to save', async () => {
    const user = userEvent.setup()
    render(<ItemEditScreen onDone={vi.fn()} />)

    await user.type(screen.getByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price'), '4.50')
    expect(screen.getByLabelText('Par level')).toHaveValue(null)

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    expect(await listItems()).toEqual([])
  })

  it('saves once every required field is set', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<ItemEditScreen onDone={onDone} />)

    await user.type(screen.getByLabelText('Name'), 'Coke')
    await user.type(screen.getByLabelText('Price'), '4.50')
    await user.type(screen.getByLabelText('Par level'), '8')
    await user.type(screen.getByLabelText('Box size'), '24')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const items = await listItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    expect(onDone).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/ui/items`
Expected: FAIL — `Failed to resolve import "./ItemEditScreen"`.

- [ ] **Step 3: Write `ItemEditScreen`**

`src/ui/items/ItemEditScreen.tsx`:

```tsx
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
```

- [ ] **Step 4: Write `ItemListScreen`**

`src/ui/items/ItemListScreen.tsx`:

```tsx
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
```

- [ ] **Step 5: Wire both into `App.tsx`**

`src/ui/App.tsx`:

```tsx
import { useState } from 'react'
import { ItemListScreen } from './items/ItemListScreen'
import { ItemEditScreen } from './items/ItemEditScreen'
import type { Id } from '../domain/types'

type Screen = { name: 'items' } | { name: 'item-edit'; itemId?: Id }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'items' })

  if (screen.name === 'item-edit') {
    return (
      <ItemEditScreen
        itemId={screen.itemId}
        onDone={() => setScreen({ name: 'items' })}
      />
    )
  }

  return (
    <ItemListScreen
      onSelect={(itemId) => setScreen({ name: 'item-edit', itemId })}
      onNew={() => setScreen({ name: 'item-edit' })}
    />
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites.

- [ ] **Step 7: Commit**

```bash
git add src/ui
git commit -m "feat: add item catalogue screens with operator-set par"
```

---

## Task 6: Machines and placement editing

**Files:**
- Create: `src/ui/machines/MachineListScreen.tsx`, `src/ui/machines/MachineMapScreen.tsx`,
  `src/ui/useMachineMap.ts`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/useMachineMap.test.tsx`

**Interfaces:**
- Consumes: `resolveMachineMap` (Task 3); `listItems`, `listMachines`, `listPlacements`,
  `listSlotConfigs`, `saveMachine`, `setPlacement` (Task 4).
- Produces:
  - `useMachineMap(machineId: Id): { map: MachineMap; items: Map<Id, Item>; reload: () => Promise<void>; loading: boolean }`
  - `MachineListScreen({ onSelect, onNew })`, `MachineMapScreen({ machineId, onBack })`

`useMachineMap` loads items, placements and slot configs once and resolves in memory. This
is the pattern the counting screen reuses: **one load, then no queries.**

- [ ] **Step 1: Write the failing test**

`src/ui/useMachineMap.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { saveItem } from '../data/repositories/items'
import { saveMachine } from '../data/repositories/machines'
import { setPlacement } from '../data/repositories/placements'
import { useMachineMap } from './useMachineMap'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('useMachineMap', () => {
  it('resolves the map for one machine, honouring overrides', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const l5 = await saveMachine({ label: 'Lift lobby', level: 5 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })

    await setPlacement(coke.id, { kind: 'base' }, [58, 59])
    await setPlacement(coke.id, { kind: 'machine', machineId: l5.id }, [57])

    const l7Hook = renderHook(() => useMachineMap(l7.id))
    await waitFor(() => expect(l7Hook.result.current.loading).toBe(false))
    expect(l7Hook.result.current.map.map((s) => s.slotNumber)).toEqual([58, 59])

    const l5Hook = renderHook(() => useMachineMap(l5.id))
    await waitFor(() => expect(l5Hook.result.current.loading).toBe(false))
    expect(l5Hook.result.current.map.map((s) => s.slotNumber)).toEqual([57])
  })

  it('exposes items by id for rendering names', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])

    const { result } = renderHook(() => useMachineMap(l7.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items.get(coke.id)?.name).toBe('Coke')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/ui/useMachineMap`
Expected: FAIL — `Failed to resolve import "./useMachineMap"`.

- [ ] **Step 3: Write the hook**

`src/ui/useMachineMap.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { listItems } from '../data/repositories/items'
import { listPlacements } from '../data/repositories/placements'
import { listSlotConfigs } from '../data/repositories/slotConfigs'
import { resolveMachineMap } from '../domain/placement'
import type { Id, Item, MachineMap } from '../domain/types'

export function useMachineMap(machineId: Id) {
  const [map, setMap] = useState<MachineMap>([])
  const [items, setItems] = useState<Map<Id, Item>>(new Map())
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [allItems, placements, slotConfigs] = await Promise.all([
      listItems(), listPlacements(), listSlotConfigs(),
    ])
    setItems(new Map(allItems.map((i) => [i.id, i])))
    setMap(resolveMachineMap(machineId, allItems, placements, slotConfigs))
    setLoading(false)
  }, [machineId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { map, items, reload, loading }
}
```

- [ ] **Step 4: Write `MachineListScreen`**

`src/ui/machines/MachineListScreen.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { listMachines, saveMachine } from '../../data/repositories/machines'
import type { Id, Machine } from '../../domain/types'

export function MachineListScreen({ onSelect }: { onSelect: (id: Id) => void }) {
  const [machines, setMachines] = useState<Machine[]>([])
  const [level, setLevel] = useState('')
  const [label, setLabel] = useState('')

  async function reload() {
    setMachines(await listMachines())
  }

  useEffect(() => {
    void reload()
  }, [])

  async function add() {
    if (level.trim() === '' || label.trim() === '') return
    await saveMachine({ level: Number(level), label: label.trim() })
    setLevel('')
    setLabel('')
    await reload()
  }

  return (
    <div className="p-4">
      <h2 className="mb-3 text-lg font-semibold">Machines</h2>

      <div className="mb-4 flex gap-2">
        <input
          aria-label="Level"
          type="number"
          placeholder="Level"
          className="w-24 rounded-lg border p-2"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        />
        <input
          aria-label="Location"
          placeholder="Location"
          className="flex-1 rounded-lg border p-2"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="button" onClick={add} className="font-semibold text-blue-600">
          Add
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {machines.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m.id)}
              className="w-full rounded-lg border p-3 text-left"
            >
              <span className="font-semibold">L{m.level}</span>
              <span className="ml-2 text-gray-500">{m.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Write `MachineMapScreen`**

`src/ui/machines/MachineMapScreen.tsx`:

```tsx
import { TRAYS, trayOf } from '../../domain/trays'
import { useMachineMap } from '../useMachineMap'
import type { Id } from '../../domain/types'

export function MachineMapScreen({
  machineId, onBack,
}: {
  machineId: Id
  onBack: () => void
}) {
  const { map, items, loading } = useMachineMap(machineId)

  if (loading) return <div className="p-4">Loading…</div>

  return (
    <div className="p-4">
      <button type="button" onClick={onBack} className="mb-3 text-blue-600">
        ← Back
      </button>

      {TRAYS.map((tray) => {
        const slots = map.filter((s) => trayOf(s.slotNumber) === tray)
        if (slots.length === 0) return null
        return (
          <section key={tray} className="mb-4">
            <h3 className="mb-2 text-xs font-bold uppercase text-gray-500">Tray {tray}</h3>
            <ul className="flex flex-col gap-1">
              {slots.map((slot) => (
                <li
                  key={slot.slotNumber}
                  className="flex items-center gap-3 rounded-lg border p-2"
                >
                  <span className="w-8 text-sm font-bold text-gray-500">
                    {slot.slotNumber}
                  </span>
                  <span className="flex-1 text-sm">
                    {slot.accepts.map((id) => items.get(id)?.name ?? '?').join(' / ')}
                  </span>
                  <span className="text-xs text-gray-400">cap {slot.capacity}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: Add machine screens to `App.tsx` navigation**

Replace `src/ui/App.tsx`:

```tsx
import { useState } from 'react'
import { ItemListScreen } from './items/ItemListScreen'
import { ItemEditScreen } from './items/ItemEditScreen'
import { MachineListScreen } from './machines/MachineListScreen'
import { MachineMapScreen } from './machines/MachineMapScreen'
import type { Id } from '../domain/types'

type Screen =
  | { name: 'items' }
  | { name: 'item-edit'; itemId?: Id }
  | { name: 'machines' }
  | { name: 'machine-map'; machineId: Id }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'machines' })

  const body = (() => {
    switch (screen.name) {
      case 'item-edit':
        return (
          <ItemEditScreen
            itemId={screen.itemId}
            onDone={() => setScreen({ name: 'items' })}
          />
        )
      case 'items':
        return (
          <ItemListScreen
            onSelect={(itemId) => setScreen({ name: 'item-edit', itemId })}
            onNew={() => setScreen({ name: 'item-edit' })}
          />
        )
      case 'machine-map':
        return (
          <MachineMapScreen
            machineId={screen.machineId}
            onBack={() => setScreen({ name: 'machines' })}
          />
        )
      case 'machines':
        return (
          <MachineListScreen
            onSelect={(machineId) => setScreen({ name: 'machine-map', machineId })}
          />
        )
    }
  })()

  return (
    <div className="mx-auto max-w-lg pb-16">
      {body}
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-lg border-t bg-white">
        <button
          type="button"
          className="flex-1 p-3 font-semibold"
          onClick={() => setScreen({ name: 'machines' })}
        >
          Machines
        </button>
        <button
          type="button"
          className="flex-1 p-3 font-semibold"
          onClick={() => setScreen({ name: 'items' })}
        >
          Items
        </button>
      </nav>
    </div>
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites.

- [ ] **Step 8: Commit**

```bash
git add src/ui
git commit -m "feat: add machine list and resolved map screens"
```

---

## Task 7: Run and visit lifecycle

**Files:**
- Create: `src/domain/levels.ts`, `src/data/repositories/runs.ts`,
  `src/data/repositories/visits.ts`
- Test: `src/domain/levels.test.ts`, `src/data/repositories/visits.test.ts`

**Interfaces:**
- Consumes: types from Task 2, `db` from Task 4.
- Produces:
  - `levelKey(slotNumber: number, itemId: Id): string` — `"58:coke"`
  - `lastRecordedLevels(history: { visit: Visit; lines: CountLine[] }[]): Map<string, number>`
    — history newest-first; the newest finalized entry for a key wins.
  - `runs.ts`: `createRun(date: string): Promise<Run>`, `listRuns(): Promise<Run[]>`
    (newest first), `getRun(id): Promise<Run | undefined>`
  - `visits.ts`: `openVisit(runId: Id, machineId: Id): Promise<Visit>` (returns the
    existing draft if there is one), `getCountLines(visitId: Id): Promise<CountLine[]>`,
    `putCountLine(line: CountLine): Promise<void>`,
    `finalizeVisit(visitId: Id): Promise<Visit>`,
    `historyForMachine(machineId: Id): Promise<{ visit: Visit; lines: CountLine[] }[]>`

`finalizeVisit` is the immutability boundary: `putCountLine` throws if its visit is
finalized.

- [ ] **Step 1: Write the failing domain test**

`src/domain/levels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { levelKey, lastRecordedLevels } from './levels'
import type { CountLine, Visit } from './types'

const visit = (id: string, finalizedAt: number): Visit => ({
  id, runId: 'r1', machineId: 'L7', status: 'finalized', finalizedAt, updatedAt: finalizedAt,
})

const line = (
  visitId: string, slotNumber: number, itemId: string, after: number,
): CountLine => ({
  id: `${visitId}-${slotNumber}-${itemId}`,
  visitId, slotNumber, itemId, before: 0, after, touched: true, updatedAt: 1,
})

describe('levelKey', () => {
  it('joins slot and item', () => {
    expect(levelKey(58, 'coke')).toBe('58:coke')
  })
})

describe('lastRecordedLevels', () => {
  it('returns the after count from the newest visit', () => {
    const history = [
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 8)] },
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3)] },
    ]
    expect(lastRecordedLevels(history).get('58:coke')).toBe(8)
  })

  it('falls back to an older visit for a slot the newest did not cover', () => {
    const history = [
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 8)] },
      { visit: visit('v1', 100), lines: [line('v1', 52, 'sunkist', 1)] },
    ]
    const levels = lastRecordedLevels(history)
    expect(levels.get('58:coke')).toBe(8)
    expect(levels.get('52:sunkist')).toBe(1)
  })

  it('keeps mixed-slot items separate', () => {
    const history = [{
      visit: visit('v1', 100),
      lines: [line('v1', 52, 'sunkist', 3), line('v1', 52, 'fanta', 2)],
    }]
    const levels = lastRecordedLevels(history)
    expect(levels.get('52:sunkist')).toBe(3)
    expect(levels.get('52:fanta')).toBe(2)
  })

  it('returns an empty map for a machine with no history', () => {
    expect(lastRecordedLevels([]).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/domain/levels`
Expected: FAIL — `Failed to resolve import "./levels"`.

- [ ] **Step 3: Write `src/domain/levels.ts`**

```ts
import type { CountLine, Id, Visit } from './types'

export function levelKey(slotNumber: number, itemId: Id): string {
  return `${slotNumber}:${itemId}`
}

/** `history` must be newest-first. The first entry seen for a key wins. */
export function lastRecordedLevels(
  history: { visit: Visit; lines: CountLine[] }[],
): Map<string, number> {
  const levels = new Map<string, number>()
  for (const { lines } of history) {
    for (const line of lines) {
      const key = levelKey(line.slotNumber, line.itemId)
      if (!levels.has(key)) levels.set(key, line.after)
    }
  }
  return levels
}
```

- [ ] **Step 4: Write the failing repository test**

`src/data/repositories/visits.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { createRun, listRuns } from './runs'
import {
  openVisit, getCountLines, putCountLine, finalizeVisit, historyForMachine,
} from './visits'
import { newId, now } from '../../domain/ids'
import type { CountLine } from '../../domain/types'

const lineFor = (visitId: string, after: number): CountLine => ({
  id: newId(), visitId, slotNumber: 58, itemId: 'coke',
  before: 3, after, touched: true, updatedAt: now(),
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('runs', () => {
  it('lists newest first', async () => {
    await createRun('2026-08-22')
    await createRun('2026-08-26')
    expect((await listRuns()).map((r) => r.date)).toEqual(['2026-08-26', '2026-08-22'])
  })
})

describe('visits', () => {
  it('reuses an existing draft rather than creating a second', async () => {
    const run = await createRun('2026-08-26')
    const a = await openVisit(run.id, 'L7')
    const b = await openVisit(run.id, 'L7')
    expect(b.id).toBe(a.id)
  })

  it('stores count lines', async () => {
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')
    await putCountLine(lineFor(visit.id, 8))
    expect(await getCountLines(visit.id)).toHaveLength(1)
  })

  it('rejects writes to a finalized visit', async () => {
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, 'L7')
    await finalizeVisit(visit.id)
    await expect(putCountLine(lineFor(visit.id, 8))).rejects.toThrow(/finalized/i)
  })

  it('returns only finalized visits in history, newest first', async () => {
    const older = await createRun('2026-08-22')
    const olderVisit = await openVisit(older.id, 'L7')
    await putCountLine(lineFor(olderVisit.id, 3))
    await finalizeVisit(olderVisit.id)

    const newer = await createRun('2026-08-26')
    const newerVisit = await openVisit(newer.id, 'L7')
    await putCountLine(lineFor(newerVisit.id, 8))
    await finalizeVisit(newerVisit.id)

    const draftRun = await createRun('2026-08-29')
    await openVisit(draftRun.id, 'L7')   // left as a draft

    const history = await historyForMachine('L7')
    expect(history).toHaveLength(2)
    expect(history[0].lines[0].after).toBe(8)
    expect(history[1].lines[0].after).toBe(3)
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test src/data/repositories/visits`
Expected: FAIL — `Failed to resolve import "./runs"`.

- [ ] **Step 6: Write the repositories**

`src/data/repositories/runs.ts`:

```ts
import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, Run } from '../../domain/types'

export async function createRun(date: string): Promise<Run> {
  const stamp = now()
  const run: Run = { id: newId(), date, createdAt: stamp, updatedAt: stamp }
  await db.runs.put(run)
  return run
}

export async function listRuns(): Promise<Run[]> {
  const runs = await db.runs.toArray()
  return runs.sort((a, b) => b.date.localeCompare(a.date))
}

export function getRun(id: Id): Promise<Run | undefined> {
  return db.runs.get(id)
}
```

`src/data/repositories/visits.ts`:

```ts
import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { CountLine, Id, Visit } from '../../domain/types'

export async function openVisit(runId: Id, machineId: Id): Promise<Visit> {
  const existing = await db.visits
    .where('[runId+machineId]')
    .equals([runId, machineId])
    .first()
  if (existing) return existing

  const visit: Visit = {
    id: newId(), runId, machineId, status: 'draft', updatedAt: now(),
  }
  await db.visits.put(visit)
  return visit
}

export function getCountLines(visitId: Id): Promise<CountLine[]> {
  return db.countLines.where('visitId').equals(visitId).toArray()
}

export async function putCountLine(line: CountLine): Promise<void> {
  const visit = await db.visits.get(line.visitId)
  if (!visit) throw new Error(`Unknown visit ${line.visitId}`)
  if (visit.status === 'finalized') {
    throw new Error(`Visit ${line.visitId} is finalized and cannot be modified`)
  }
  await db.countLines.put(line)
}

export async function finalizeVisit(visitId: Id): Promise<Visit> {
  const visit = await db.visits.get(visitId)
  if (!visit) throw new Error(`Unknown visit ${visitId}`)
  const finalized: Visit = {
    ...visit, status: 'finalized', finalizedAt: now(), updatedAt: now(),
  }
  await db.visits.put(finalized)
  return finalized
}

export async function historyForMachine(
  machineId: Id,
): Promise<{ visit: Visit; lines: CountLine[] }[]> {
  const visits = (await db.visits.toArray())
    .filter((v) => v.machineId === machineId && v.status === 'finalized')
    .sort((a, b) => (b.finalizedAt ?? 0) - (a.finalizedAt ?? 0))

  return Promise.all(
    visits.map(async (visit) => ({ visit, lines: await getCountLines(visit.id) })),
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites.

- [ ] **Step 8: Commit**

```bash
git add src/domain/levels.ts src/domain/levels.test.ts src/data/repositories
git commit -m "feat: add run and visit lifecycle with finalized-visit immutability"
```

---

## Task 8: Fill computation

**Files:**
- Create: `src/domain/fill.ts`
- Test: `src/domain/fill.test.ts`

**Interfaces:**
- Consumes: `ResolvedSlot`, `Id` from Task 2.
- Produces:
  - `slotTotal(contents: SlotContents): number`
  - `fillToCapacity(slot: ResolvedSlot, contents: SlotContents): SlotContents`
  - `type SlotContents = { itemId: Id; qty: number }[]`

Rules: capacity is shared across everything in the slot. `fillToCapacity` tops the slot up
to `capacity` using the **highest-preference accepted item** — the first entry of
`slot.accepts` — leaving other items untouched. Already-full and over-full slots are
returned unchanged.

**Phase 3 hook:** an optional `available: Map<Id, number>` parameter will be added here to
constrain the top-up by what is on the trolley, walking further down `accepts` when the
preferred item is exhausted. Phase 1 has no trolley, so there is no constraint.

- [ ] **Step 1: Write the failing test**

`src/domain/fill.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { slotTotal, fillToCapacity } from './fill'
import type { ResolvedSlot } from './types'

const single: ResolvedSlot = { slotNumber: 58, capacity: 8, accepts: ['coke'] }
const mixed: ResolvedSlot = { slotNumber: 52, capacity: 5, accepts: ['sunkist', 'fanta'] }

describe('slotTotal', () => {
  it('sums every item in the slot', () => {
    expect(slotTotal([{ itemId: 'sunkist', qty: 3 }, { itemId: 'fanta', qty: 2 }])).toBe(5)
  })

  it('is zero for an empty slot', () => {
    expect(slotTotal([])).toBe(0)
  })
})

describe('fillToCapacity', () => {
  it('tops a single-item slot up to capacity', () => {
    expect(fillToCapacity(single, [{ itemId: 'coke', qty: 3 }]))
      .toEqual([{ itemId: 'coke', qty: 8 }])
  })

  it('adds the preferred item to an empty slot', () => {
    expect(fillToCapacity(single, [])).toEqual([{ itemId: 'coke', qty: 8 }])
  })

  it('tops a mixed slot to the shared capacity, not per item', () => {
    const result = fillToCapacity(mixed, [
      { itemId: 'sunkist', qty: 3 }, { itemId: 'fanta', qty: 1 },
    ])
    expect(slotTotal(result)).toBe(5)
    // the shortfall of 1 goes to the preferred item
    expect(result).toEqual([{ itemId: 'sunkist', qty: 4 }, { itemId: 'fanta', qty: 1 }])
  })

  it('leaves a full slot untouched', () => {
    const contents = [{ itemId: 'coke', qty: 8 }]
    expect(fillToCapacity(single, contents)).toEqual(contents)
  })

  it('never removes stock from an over-full slot', () => {
    const contents = [{ itemId: 'coke', qty: 10 }]
    expect(fillToCapacity(single, contents)).toEqual(contents)
  })

  it('does not mutate its input', () => {
    const contents = [{ itemId: 'coke', qty: 3 }]
    fillToCapacity(single, contents)
    expect(contents).toEqual([{ itemId: 'coke', qty: 3 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/domain/fill`
Expected: FAIL — `Failed to resolve import "./fill"`.

- [ ] **Step 3: Write minimal implementation**

`src/domain/fill.ts`:

```ts
import type { Id, ResolvedSlot } from './types'

export type SlotContents = { itemId: Id; qty: number }[]

export function slotTotal(contents: SlotContents): number {
  return contents.reduce((sum, entry) => sum + entry.qty, 0)
}

export function fillToCapacity(
  slot: ResolvedSlot,
  contents: SlotContents,
): SlotContents {
  const shortfall = slot.capacity - slotTotal(contents)
  if (shortfall <= 0) return contents.map((entry) => ({ ...entry }))

  const preferredId = slot.accepts[0]
  const next = contents.map((entry) => ({ ...entry }))
  const existing = next.find((entry) => entry.itemId === preferredId)

  if (existing) existing.qty += shortfall
  else next.unshift({ itemId: preferredId, qty: shortfall })

  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/domain/fill`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/fill.ts src/domain/fill.test.ts
git commit -m "feat: compute slot fill against shared capacity"
```

---

## Task 9: The counting screen

The deliverable that replaces the paper. Everything before this exists to serve it.

**Files:**
- Create: `src/ui/components/TrayTabs.tsx`, `src/ui/run/SlotRow.tsx`,
  `src/ui/run/CountScreen.tsx`, `src/ui/run/useCounting.ts`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/run/useCounting.test.tsx`, `src/ui/run/CountScreen.test.tsx`

**Interfaces:**
- Consumes: `useMachineMap` (Task 6); `lastRecordedLevels`, `levelKey` (Task 7);
  `fillToCapacity`, `slotTotal`, `SlotContents` (Task 8); `openVisit`, `putCountLine`,
  `finalizeVisit`, `historyForMachine`, `getCountLines` (Task 7); `TRAYS`, `trayOf`
  (Task 2).
- Produces:
  - `useCounting(runId: Id, machineId: Id)` returning exactly:
    `{ loading: boolean, map: MachineMap, items: Map<Id, Item>, before: Map<string, number>, after: Map<string, number>, filled: Set<number>, touched: Set<string>, setBefore(slotNumber, itemId, qty): Promise<void>, toggleFill(slotNumber): Promise<void>, finalize(): Promise<void>, ranDry(slot: ResolvedSlot): boolean }`
  - `Stepper({ value, onChange, min?, max?, label })`
  - `TrayTabs({ active, onSelect, present })`
  - `SlotRow({ slot, items, before, isFilled, ranDry, onSetBefore, onToggleFill })` —
    Task 10 adds an `onEdit` prop to this component.
  - `CountScreen({ runId, machineId, onDone })`

Behaviour required by the spec:
- Every count opens pre-filled from `lastRecordedLevels`, marked untouched.
- `after` equals `before` unless the slot is filled, in which case it equals the
  `fillToCapacity` result.
- Every change persists immediately via `putCountLine` — no Save button.
- A slot whose `before` total is 0 is flagged as ran dry.

- [ ] **Step 1: Write the failing hook test**

`src/ui/run/useCounting.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { setPlacement } from '../../data/repositories/placements'
import { createRun } from '../../data/repositories/runs'
import {
  openVisit, putCountLine, finalizeVisit, getCountLines,
} from '../../data/repositories/visits'
import { newId, now } from '../../domain/ids'
import { useCounting } from './useCounting'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function seed() {
  const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
  const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
  await setPlacement(coke.id, { kind: 'base' }, [58])
  return { coke, machine }
}

describe('useCounting', () => {
  it('seeds before-counts from the last finalized visit', async () => {
    const { coke, machine } = await seed()

    const past = await createRun('2026-08-22')
    const pastVisit = await openVisit(past.id, machine.id)
    await putCountLine({
      id: newId(), visitId: pastVisit.id, slotNumber: 58, itemId: coke.id,
      before: 2, after: 8, touched: true, updatedAt: now(),
    })
    await finalizeVisit(pastVisit.id)

    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.before.get(`58:${coke.id}`)).toBe(8)
    expect(result.current.touched.has(`58:${coke.id}`)).toBe(false)
  })

  it('seeds zero when the machine has no history', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.before.get(`58:${coke.id}`)).toBe(0)
  })

  it('mirrors before into after until the slot is filled', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setBefore(58, coke.id, 3) })
    expect(result.current.after.get(`58:${coke.id}`)).toBe(3)

    await act(async () => { await result.current.toggleFill(58) })
    expect(result.current.after.get(`58:${coke.id}`)).toBe(8)
  })

  it('persists each change immediately, with no save step', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.setBefore(58, coke.id, 3) })

    const lines = await getCountLines(visit.id)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ before: 3, after: 3, touched: true })
  })

  it('finalizes the visit and blocks further writes', async () => {
    const { coke, machine } = await seed()
    const run = await createRun('2026-08-26')
    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.setBefore(58, coke.id, 3) })
    await act(async () => { await result.current.finalize() })

    await expect(result.current.setBefore(58, coke.id, 4)).rejects.toThrow(/finalized/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/ui/run`
Expected: FAIL — `Failed to resolve import "./useCounting"`.

- [ ] **Step 3: Write the hook**

`src/ui/run/useCounting.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { useMachineMap } from '../useMachineMap'
import { levelKey, lastRecordedLevels } from '../../domain/levels'
import { fillToCapacity, slotTotal, type SlotContents } from '../../domain/fill'
import { newId, now } from '../../domain/ids'
import {
  finalizeVisit, historyForMachine, openVisit, putCountLine,
} from '../../data/repositories/visits'
import type { Id, ResolvedSlot, Visit } from '../../domain/types'

export function useCounting(runId: Id, machineId: Id) {
  const { map, items, loading: mapLoading } = useMachineMap(machineId)
  const [visit, setVisit] = useState<Visit | null>(null)
  const [before, setBeforeState] = useState<Map<string, number>>(new Map())
  const [after, setAfterState] = useState<Map<string, number>>(new Map())
  const [filled, setFilled] = useState<Set<number>>(new Set())
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (mapLoading) return
    void (async () => {
      const [openedVisit, history] = await Promise.all([
        openVisit(runId, machineId),
        historyForMachine(machineId),
      ])
      const levels = lastRecordedLevels(history)
      const seeded = new Map<string, number>()
      for (const slot of map) {
        for (const itemId of slot.accepts) {
          const key = levelKey(slot.slotNumber, itemId)
          seeded.set(key, levels.get(key) ?? 0)
        }
      }
      setVisit(openedVisit)
      setBeforeState(seeded)
      setAfterState(new Map(seeded))
      setLoading(false)
    })()
  }, [mapLoading, map, runId, machineId])

  const contentsOf = useCallback(
    (slot: ResolvedSlot, source: Map<string, number>): SlotContents =>
      slot.accepts.map((itemId) => ({
        itemId,
        qty: source.get(levelKey(slot.slotNumber, itemId)) ?? 0,
      })),
    [],
  )

  const persist = useCallback(
    async (slotNumber: number, itemId: Id, b: number, a: number, isTouched: boolean) => {
      if (!visit) return
      await putCountLine({
        id: newId(), visitId: visit.id, slotNumber, itemId,
        before: b, after: a, touched: isTouched, updatedAt: now(),
      })
    },
    [visit],
  )

  const setBefore = useCallback(
    async (slotNumber: number, itemId: Id, qty: number) => {
      const key = levelKey(slotNumber, itemId)
      const nextBefore = new Map(before).set(key, qty)
      const nextAfter = new Map(after)
      if (!filled.has(slotNumber)) nextAfter.set(key, qty)

      setBeforeState(nextBefore)
      setAfterState(nextAfter)
      setTouched(new Set(touched).add(key))
      await persist(slotNumber, itemId, qty, nextAfter.get(key) ?? qty, true)
    },
    [before, after, filled, touched, persist],
  )

  const toggleFill = useCallback(
    async (slotNumber: number) => {
      const slot = map.find((s) => s.slotNumber === slotNumber)
      if (!slot) return

      const nextFilled = new Set(filled)
      const nextAfter = new Map(after)
      const target = filled.has(slotNumber)
        ? contentsOf(slot, before)
        : fillToCapacity(slot, contentsOf(slot, before))

      if (filled.has(slotNumber)) nextFilled.delete(slotNumber)
      else nextFilled.add(slotNumber)

      for (const entry of target) {
        nextAfter.set(levelKey(slotNumber, entry.itemId), entry.qty)
      }

      setFilled(nextFilled)
      setAfterState(nextAfter)

      for (const entry of target) {
        const key = levelKey(slotNumber, entry.itemId)
        await persist(
          slotNumber, entry.itemId,
          before.get(key) ?? 0, entry.qty, touched.has(key),
        )
      }
    },
    [map, filled, after, before, touched, contentsOf, persist],
  )

  const finalize = useCallback(async () => {
    if (!visit) return
    const finalized = await finalizeVisit(visit.id)
    setVisit(finalized)
  }, [visit])

  const ranDry = useCallback(
    (slot: ResolvedSlot) => slotTotal(contentsOf(slot, before)) === 0,
    [before, contentsOf],
  )

  return {
    loading: loading || mapLoading,
    map, items, before, after, filled, touched,
    setBefore, toggleFill, finalize, ranDry,
  }
}
```

- [ ] **Step 4: Run the hook test to verify it passes**

Run: `npm test src/ui/run/useCounting`
Expected: PASS — 5 tests.

- [ ] **Step 5: Write `Stepper`, `TrayTabs` and `SlotRow`**

`src/ui/components/Stepper.tsx`:

```tsx
export function Stepper({
  value, onChange, min = 0, max = 99, label,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  label: string
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`${label} decrease`}
        className="h-9 w-9 rounded-lg bg-gray-200 text-lg font-semibold"
        onClick={() => onChange(clamp(value - 1))}
      >
        −
      </button>
      <span aria-label={label} className="min-w-8 text-center text-lg font-bold">
        {value}
      </span>
      <button
        type="button"
        aria-label={`${label} increase`}
        className="h-9 w-9 rounded-lg bg-gray-200 text-lg font-semibold"
        onClick={() => onChange(clamp(value + 1))}
      >
        +
      </button>
    </div>
  )
}
```

`src/ui/components/TrayTabs.tsx`:

```tsx
import { TRAYS } from '../../domain/trays'

export function TrayTabs({
  active, onSelect, present,
}: {
  active: number
  onSelect: (tray: number) => void
  present: Set<number>
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b bg-white p-2">
      {TRAYS.filter((t) => present.has(t)).map((tray) => (
        <button
          key={tray}
          type="button"
          onClick={() => onSelect(tray)}
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            tray === active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}
        >
          {tray}
        </button>
      ))}
    </div>
  )
}
```

`src/ui/run/SlotRow.tsx`:

```tsx
import { Stepper } from '../components/Stepper'
import { levelKey } from '../../domain/levels'
import type { Id, Item, ResolvedSlot } from '../../domain/types'

export function SlotRow({
  slot, items, before, isFilled, ranDry, onSetBefore, onToggleFill,
}: {
  slot: ResolvedSlot
  items: Map<Id, Item>
  before: Map<string, number>
  isFilled: boolean
  ranDry: boolean
  onSetBefore: (slotNumber: number, itemId: Id, qty: number) => void
  onToggleFill: (slotNumber: number) => void
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
```

- [ ] **Step 6: Write the failing screen test**

`src/ui/run/CountScreen.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { setPlacement } from '../../data/repositories/placements'
import { createRun } from '../../data/repositories/runs'
import { openVisit, getCountLines } from '../../data/repositories/visits'
import { CountScreen } from './CountScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('CountScreen', () => {
  it('renders slots and persists a decrement without any save action', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')
    const visit = await openVisit(run.id, machine.id)

    render(<CountScreen runId={run.id} machineId={machine.id} onDone={vi.fn()} />)

    await screen.findByText('Coke')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    await user.click(screen.getByLabelText('slot 58 increase'))

    const lines = await getCountLines(visit.id)
    expect(lines[0].before).toBe(1)
  })

  it('marks an empty slot as ran dry', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 8, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-26')

    render(<CountScreen runId={run.id} machineId={machine.id} onDone={vi.fn()} />)
    expect(await screen.findByText('RAN DRY')).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run screen test to verify it fails**

Run: `npm test src/ui/run/CountScreen`
Expected: FAIL — `Failed to resolve import "./CountScreen"`.

- [ ] **Step 8: Write `CountScreen`**

`src/ui/run/CountScreen.tsx`:

```tsx
import { useState } from 'react'
import { TrayTabs } from '../components/TrayTabs'
import { SlotRow } from './SlotRow'
import { trayOf } from '../../domain/trays'
import { useCounting } from './useCounting'
import type { Id } from '../../domain/types'

export function CountScreen({
  runId, machineId, onDone,
}: {
  runId: Id
  machineId: Id
  onDone: () => void
}) {
  const counting = useCounting(runId, machineId)
  const [tray, setTray] = useState<number | null>(null)

  if (counting.loading) return <div className="p-4">Loading…</div>

  const present = new Set(counting.map.map((s) => trayOf(s.slotNumber)))
  const activeTray = tray ?? [...present].sort((a, b) => a - b)[0] ?? 10
  const slots = counting.map.filter((s) => trayOf(s.slotNumber) === activeTray)

  return (
    <div>
      <TrayTabs active={activeTray} onSelect={setTray} present={present} />

      <ul className="flex flex-col gap-2 p-2">
        {slots.map((slot) => (
          <SlotRow
            key={slot.slotNumber}
            slot={slot}
            items={counting.items}
            before={counting.before}
            isFilled={counting.filled.has(slot.slotNumber)}
            ranDry={counting.ranDry(slot)}
            onSetBefore={(slotNumber, itemId, qty) => {
              void counting.setBefore(slotNumber, itemId, qty)
            }}
            onToggleFill={(slotNumber) => {
              void counting.toggleFill(slotNumber)
            }}
          />
        ))}
      </ul>

      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            void counting.finalize().then(onDone)
          }}
          className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white"
        >
          Finish machine
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Add the run flow to `App.tsx`**

Each machine row gets **two** actions — counting it, and viewing its map. Counting is the
primary action; the map screen from Task 6 must stay reachable.

In `src/ui/machines/MachineListScreen.tsx`, replace the props and the `<ul>` block:

```tsx
export function MachineListScreen({
  onCount, onViewMap,
}: {
  onCount: (machineId: Id, runId: Id) => void
  onViewMap: (machineId: Id) => void
}) {
```

Add these imports at the top of the file:

```tsx
import { createRun, listRuns } from '../../data/repositories/runs'
```

Add this helper above the `return`:

```tsx
  async function startCount(machineId: Id) {
    const today = new Date().toISOString().slice(0, 10)
    const runs = await listRuns()
    const run = runs.find((r) => r.date === today) ?? (await createRun(today))
    onCount(machineId, run.id)
  }
```

Replace the `<ul>` block with:

```tsx
      <ul className="flex flex-col gap-2">
        {machines.map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded-lg border p-3">
            <button
              type="button"
              onClick={() => void startCount(m.id)}
              className="flex-1 text-left"
            >
              <span className="font-semibold">L{m.level}</span>
              <span className="ml-2 text-gray-500">{m.label}</span>
            </button>
            <button
              type="button"
              aria-label={`View map for L${m.level}`}
              onClick={() => onViewMap(m.id)}
              className="text-xs font-bold text-blue-600"
            >
              Map
            </button>
          </li>
        ))}
      </ul>
```

In `src/ui/App.tsx`, add the import:

```tsx
import { CountScreen } from './run/CountScreen'
```

add to the `Screen` union:

```tsx
  | { name: 'count'; runId: Id; machineId: Id }
```

add this case to the switch:

```tsx
      case 'count':
        return (
          <CountScreen
            runId={screen.runId}
            machineId={screen.machineId}
            onDone={() => setScreen({ name: 'machines' })}
          />
        )
```

and replace the `case 'machines':` return with:

```tsx
        return (
          <MachineListScreen
            onCount={(machineId, runId) => setScreen({ name: 'count', runId, machineId })}
            onViewMap={(machineId) => setScreen({ name: 'machine-map', machineId })}
          />
        )
```

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: PASS — all suites.

- [ ] **Step 11: Verify the build and typecheck**

Run: `npm run build`
Expected: exits 0 with no TypeScript errors.

- [ ] **Step 12: Commit**

```bash
git add src/ui
git commit -m "feat: add counting screen with last-level defaults and fill toggle"
```

---

## Task 10: In-place map correction

The printed map is ~90% accurate, so correcting it must be reachable while standing at the
machine. A correction writes a machine-scoped `ItemPlacement`, which is the same data the
item-side editor writes.

**Files:**
- Create: `src/ui/run/SlotEditSheet.tsx`
- Modify: `src/ui/run/SlotRow.tsx`, `src/ui/run/CountScreen.tsx`
- Test: `src/ui/run/SlotEditSheet.test.tsx`

**Interfaces:**
- Consumes: `listItems` (Task 4), `setPlacement` (Task 4), `setSlotConfig` (Task 4),
  `effectivePlacement` (Task 3).
- Produces: `SlotEditSheet({ machineId, slotNumber, items, currentItemIds, onSaved, onCancel })`

Saving adds an item to the slot by writing a machine-scoped placement whose `slots` is the
item's effective slot list plus this slot number. Removing does the reverse. Both leave the
base placement untouched, so other machines are unaffected.

- [ ] **Step 1: Write the failing test**

`src/ui/run/SlotEditSheet.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem, listItems } from '../../data/repositories/items'
import { setPlacement, listPlacements } from '../../data/repositories/placements'
import { effectivePlacement } from '../../domain/placement'
import { SlotEditSheet } from './SlotEditSheet'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('SlotEditSheet', () => {
  it('adds a second item to a slot without disturbing other machines', async () => {
    const user = userEvent.setup()
    const sunkist = await saveItem({ name: 'Sunkist', price: 4.5, basePar: 5, boxSize: 24 })
    const fanta = await saveItem({ name: 'Fanta', price: 4.5, basePar: 5, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    const items = await listItems()
    render(
      <SlotEditSheet
        machineId="L7"
        slotNumber={52}
        items={items}
        currentItemIds={[sunkist.id]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Add Fanta' }))

    const placements = await listPlacements()
    expect(effectivePlacement(fanta.id, 'L7', placements)?.slots).toEqual([52])
    // another machine still resolves without Fanta
    expect(effectivePlacement(fanta.id, 'L5', placements)).toBeUndefined()
  })

  it('removes an item from this machine only', async () => {
    const user = userEvent.setup()
    const sunkist = await saveItem({ name: 'Sunkist', price: 4.5, basePar: 5, boxSize: 24 })
    await setPlacement(sunkist.id, { kind: 'base' }, [52])

    const items = await listItems()
    render(
      <SlotEditSheet
        machineId="L7"
        slotNumber={52}
        items={items}
        currentItemIds={[sunkist.id]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove Sunkist' }))

    const placements = await listPlacements()
    expect(effectivePlacement(sunkist.id, 'L7', placements)?.slots).toEqual([])
    expect(effectivePlacement(sunkist.id, 'L5', placements)?.slots).toEqual([52])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/ui/run/SlotEditSheet`
Expected: FAIL — `Failed to resolve import "./SlotEditSheet"`.

- [ ] **Step 3: Write `SlotEditSheet`**

`src/ui/run/SlotEditSheet.tsx`:

```tsx
import { listPlacements, setPlacement } from '../../data/repositories/placements'
import { effectivePlacement } from '../../domain/placement'
import type { Id, Item } from '../../domain/types'

export function SlotEditSheet({
  machineId, slotNumber, items, currentItemIds, onSaved, onCancel,
}: {
  machineId: Id
  slotNumber: number
  items: Item[]
  currentItemIds: Id[]
  onSaved: () => void
  onCancel: () => void
}) {
  async function slotsFor(itemId: Id): Promise<number[]> {
    const placements = await listPlacements()
    return effectivePlacement(itemId, machineId, placements)?.slots ?? []
  }

  async function add(itemId: Id) {
    const slots = await slotsFor(itemId)
    if (!slots.includes(slotNumber)) {
      await setPlacement(itemId, { kind: 'machine', machineId }, [...slots, slotNumber])
    }
    onSaved()
  }

  async function remove(itemId: Id) {
    const slots = await slotsFor(itemId)
    await setPlacement(
      itemId,
      { kind: 'machine', machineId },
      slots.filter((s) => s !== slotNumber),
    )
    onSaved()
  }

  const present = items.filter((i) => currentItemIds.includes(i.id))
  const absent = items.filter((i) => !currentItemIds.includes(i.id))

  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 font-semibold">Slot {slotNumber}</h3>

      <ul className="mb-3 flex flex-col gap-1">
        {present.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{item.name}</span>
            <button
              type="button"
              onClick={() => void remove(item.id)}
              className="text-xs font-bold text-red-600"
            >
              {`Remove ${item.name}`}
            </button>
          </li>
        ))}
      </ul>

      <ul className="mb-3 flex max-h-48 flex-col gap-1 overflow-y-auto">
        {absent.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="flex-1 text-sm text-gray-500">{item.name}</span>
            <button
              type="button"
              onClick={() => void add(item.id)}
              className="text-xs font-bold text-blue-600"
            >
              {`Add ${item.name}`}
            </button>
          </li>
        ))}
      </ul>

      <button type="button" onClick={onCancel} className="text-sm text-gray-500">
        Close
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/ui/run/SlotEditSheet`
Expected: PASS — 2 tests.

- [ ] **Step 5: Open the sheet from a slot row**

In `src/ui/run/SlotRow.tsx`, add an `onEdit` prop and a button that calls it. Add to the
props type:

```tsx
  onEdit: (slotNumber: number) => void
```

and add this button immediately after the `Fill` button, inside the same flex row:

```tsx
        <button
          type="button"
          aria-label={`Edit slot ${slot.slotNumber}`}
          onClick={() => onEdit(slot.slotNumber)}
          className="px-1 text-lg text-gray-400"
        >
          ⋯
        </button>
```

In `src/ui/run/CountScreen.tsx`, add state and render the sheet:

```tsx
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
```

pass `onEdit={setEditingSlot}` to each `SlotRow`, and render below the list:

```tsx
      {editingSlot !== null && (
        <SlotEditSheet
          machineId={machineId}
          slotNumber={editingSlot}
          items={[...counting.items.values()]}
          currentItemIds={
            counting.map.find((s) => s.slotNumber === editingSlot)?.accepts ?? []
          }
          onSaved={() => {
            setEditingSlot(null)
            window.location.reload()
          }}
          onCancel={() => setEditingSlot(null)}
        />
      )}
```

Import `SlotEditSheet` at the top of `CountScreen.tsx`.

Note: `window.location.reload()` is a deliberate stopgap so the resolved map refreshes
after a placement change. Replacing it with a `reload()` call threaded from
`useMachineMap` through `useCounting` is the first cleanup in Phase 2.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — all suites.

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/ui
git commit -m "feat: correct a machine's slot contents from the counting screen"
```

---

## Definition of done for Phase 1

- `npm test` passes; `npm run build` exits 0.
- The catalogue holds items with operator-set par, price and box size.
- 15 machines exist, each resolving its own map from base placements plus overrides.
- A machine can be counted in one pass: values default to the last recorded level, `Fill`
  derives the after-count, empty slots flag as ran dry, and every change persists with no
  Save button.
- A slot's contents can be corrected while standing at the machine.
- Finalized visits reject further writes.

## Known gaps carried into Phase 2

Recorded so they are not mistaken for oversights:

1. `SlotEditSheet` triggers `window.location.reload()` after saving. Thread a `reload()`
   callback through instead.
2. `putCountLine` writes a new row per change, so `countLines` accumulates duplicates per
   `(visitId, slotNumber, itemId)`. `getCountLines` currently returns all of them.
   Phase 2 should upsert on that triple, or have readers take the newest by `updatedAt`.
   No Phase 1 test depends on the duplicate behaviour.
3. Slot capacity is only editable via `setSlotConfig` in code — there is no UI for it yet.
   Capacity falls back to the first accepted item's `basePar`, which is correct for
   single-item slots and needs an editor for mixed ones.
