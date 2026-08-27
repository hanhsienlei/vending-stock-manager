# Phase 2 — Understand: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sales and stock visible — log stock movements with reasons, derive
what sold from them, and show it on a report page with a date range and a stock
matrix.

**Architecture:** One new table (`Adjustment`) and one new field
(`CountLine.price`). Everything else is derived at read time by pure functions in
`src/domain/`, matching how the machine map already works — spec §4.2 chose
read-time resolution so there is "no materialized machine map to fall out of
date", and Phase 2's design §3.1 applies the same rule to sales.

**Tech Stack:** TypeScript, React 19, Dexie 4 (IndexedDB), Vitest +
@testing-library/react, Tailwind 4, Vite 6.

**Spec:** `docs/superpowers/specs/2026-08-27-phase-2-understand-design.md`
Parent spec (authority): `docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md`

## Global Constraints

- **`src/domain/` performs no I/O.** `src/domain/purity.test.ts` fails the build
  if any file there imports `dexie`, `react`, `../data/`, `./data/` or `node:fs`.
  Every calculation in this plan lives there; every read lives in
  `src/data/repositories/`.
- **No new runtime dependencies.** The PDF export that would have needed one is
  held (design §2).
- **Schema goes to v3 and no further in this plan.** Additive only.
- **v3 is the first migration to run against real data** (design §10). Every
  upgrade test writes through the older schema *first* and opens the newer one
  *second*. A test that writes its data after the upgrade proves nothing — see
  `src/data/db.test.ts` and commit `5f6defc` for the pattern and why.
- **Signed units.** `Adjustment.units` is signed relative to its own location:
  negative leaves, positive arrives. This is what collapses spec §3.3's formula
  into one sum.
- **British spelling in prose, US spelling in identifiers** — matches the
  existing codebase (`finalizedAt`, but "behaviour" in comments).
- **Every task ends green:** `npx vitest run` passes with no unhandled errors,
  and `npm run build` (which runs `tsc --noEmit`) succeeds.
- **Check for warnings before committing:**
  `npx vitest run 2>&1 | grep -iE "warning|act\(|unhandled|Errors "` must print
  nothing.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/domain/adjustments.ts` | The reason table as data: what each reason does to stock, and whether it enters the residual. |
| `src/domain/sales.ts` | The residual for one period. Pure arithmetic over count lines and adjustments. |
| `src/domain/packs.ts` | Units ↔ boxes + loose. |
| `src/domain/storeroom.ts` | Balance = last verified count + movements since. |
| `src/domain/stockMatrix.ts` | Item rows × machine columns for the stock sheet layout. |
| `src/data/repositories/adjustments.ts` | Reads and writes for `Adjustment`, including atomic transfers. |
| `src/data/repositories/sales.ts` | Pairs visits into periods and feeds `salesForPeriod`. The only place that knows a period spans two visits. |
| `src/ui/adjustments/AdjustmentSheet.tsx` | One sheet, both locations. Opened from `⋯` and from the storeroom. |
| `src/ui/report/ReportScreen.tsx` | The report view: range selector, summary, matrix. |
| `src/ui/report/StockMatrix.tsx` | The matrix table, with toggleable machine columns. |
| `src/ui/report/useReport.ts` | Loads what `ReportScreen` renders. |

**Modified:**

| File | Change |
| --- | --- |
| `src/domain/types.ts` | `Adjustment`, `AdjustmentReason`; `price` on `CountLine`. |
| `src/data/db.ts` | Schema v3. |
| `src/ui/run/useCounting.ts` | Write `price` at both count-line write sites. |
| `src/ui/run/SlotEditSheet.tsx` | Link to the adjustment sheet. |
| `src/ui/storeroom/StoreroomScreen.tsx` | Ledger balance, boxes + loose, adjustment entry. |
| `src/ui/storeroom/useStoreroom.ts` | Balance from anchor + movements. |
| `src/ui/history/HistoryScreen.tsx` | Two views: Receipts and Report. |
| `src/ui/App.tsx` | Let the matrix escape `max-w-lg`. |

---

## Task 1: Schema v3 — the adjustments table and the price snapshot

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/data/db.ts:40-56`
- Test: `src/data/db.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Adjustment`, `AdjustmentReason`, `AdjustmentLocationKind` types;
  `CountLine.price: number`; `db.adjustments` table.

- [ ] **Step 1: Add the types**

In `src/domain/types.ts`, add `price` to `CountLine` and append the new types:

```ts
export interface CountLine {
  id: Id
  visitId: Id
  slotNumber: number
  itemId: Id
  before: number
  after: number
  touched: boolean
  filled: boolean
  /** The item's price when this line was recorded. Snapshotted so a later
   * price change cannot re-price past runs and break reconciliation against
   * machine takings (design §3.6). */
  price: number
  updatedAt: number
}

export type AdjustmentReason =
  | 'transfer'   // no loss — leaves one location, arrives at another
  | 'expired'    // write-off
  | 'damaged'    // write-off
  | 'missing'    // shrinkage
  | 'delivery'   // the only reason that increases total stock
  | 'miscount'   // a data fix, NOT a stock movement — never enters the residual

export type AdjustmentLocationKind = 'machine' | 'storeroom'

/** A stock movement with a reason, at a machine slot or the storeroom
 * (spec §4.1, §5.3).
 *
 * The location is three flat columns rather than a nested object, and that is
 * deliberate: `ItemPlacement.scope` is nested, cannot be indexed, and forces a
 * full scan on every map resolution — known-gaps.md calls it "the likeliest
 * painful migration in the current schema". This does not repeat it. */
export interface Adjustment {
  id: Id
  itemId: Id
  locationKind: AdjustmentLocationKind
  machineId?: Id
  slotNumber?: number
  reason: AdjustmentReason
  /** Signed, relative to this location: negative leaves, positive arrives. */
  units: number
  /** Links the two rows of one transfer. */
  transferId?: Id
  note?: string
  /** When the adjustment was logged. Set from the clock at write time; there
   * is no field to change it, so nothing can be backdated (design §4.1). */
  occurredAt: number
  updatedAt: number
}
```

- [ ] **Step 2: Write the failing upgrade tests**

Append to `src/data/db.test.ts`, inside a new `describe`:

```ts
describe('schema version 3 upgrade', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete(DB_NAME)
  })

  // v3 is the first migration to run against real data — v2 was done while
  // the database was empty, which is why its risk was acceptable then and is
  // not now. So this writes through v2 first and opens v3 second.
  it('backfills price on count lines that predate the field', async () => {
    const legacy = openLegacyV2()
    await legacy.open()
    await legacy.table('items').put({
      id: 'coke', name: 'Coke', price: 4.5, basePar: 5, boxSize: 24, updatedAt: 1,
    })
    const lineId = newId()
    await legacy.table('countLines').put({
      id: lineId, visitId: 'v1', slotNumber: 58, itemId: 'coke',
      before: 3, after: 8, touched: true, filled: true, updatedAt: 1,
    })
    legacy.close()

    await db.open()

    expect((await db.countLines.get(lineId))?.price).toBe(4.5)
  })

  it('backfills a deleted item\'s line at zero rather than leaving it undefined', async () => {
    const legacy = openLegacyV2()
    await legacy.open()
    const lineId = newId()
    // No matching item row: the item was deleted, which deleteItem allows —
    // it deliberately leaves CountLine rows alone so past counts are not
    // rewritten.
    await legacy.table('countLines').put({
      id: lineId, visitId: 'v1', slotNumber: 58, itemId: 'gone',
      before: 3, after: 8, touched: true, filled: true, updatedAt: 1,
    })
    legacy.close()

    await db.open()

    expect((await db.countLines.get(lineId))?.price).toBe(0)
  })

  it('leaves a price that is already present untouched', async () => {
    const legacy = openLegacyV2()
    await legacy.open()
    await legacy.table('items').put({
      id: 'coke', name: 'Coke', price: 9.99, basePar: 5, boxSize: 24, updatedAt: 1,
    })
    const lineId = newId()
    // Simulates a row already migrated once, or written after the upgrade,
    // at a price that has since changed on the item.
    await legacy.table('countLines').put({
      id: lineId, visitId: 'v1', slotNumber: 58, itemId: 'coke',
      before: 3, after: 8, touched: true, filled: true, price: 4.5, updatedAt: 1,
    })
    legacy.close()

    await db.open()

    expect((await db.countLines.get(lineId))?.price).toBe(4.5)
  })

  it('keeps every pre-upgrade visit and count line', async () => {
    const legacy = openLegacyV2()
    await legacy.open()
    await legacy.table('visits').put({
      id: 'v1', runId: 'r1', machineId: 'L7',
      status: 'finalized', finalizedAt: 1, updatedAt: 1,
    })
    await legacy.table('countLines').put({
      id: newId(), visitId: 'v1', slotNumber: 58, itemId: 'coke',
      before: 3, after: 8, touched: true, filled: true, updatedAt: 1,
    })
    legacy.close()

    await db.open()

    expect(await db.visits.toArray()).toHaveLength(1)
    expect(await db.countLines.toArray()).toHaveLength(1)
  })

  it('adds an adjustments table indexed for the queries Phase 2 makes', async () => {
    await db.open()

    await db.adjustments.put({
      id: newId(), itemId: 'coke', locationKind: 'machine',
      machineId: 'L7', slotNumber: 58, reason: 'expired', units: -2,
      occurredAt: 1, updatedAt: 1,
    })

    expect(await db.adjustments.where('machineId').equals('L7').toArray())
      .toHaveLength(1)
    expect(await db.adjustments.where('itemId').equals('coke').toArray())
      .toHaveLength(1)
    expect(
      await db.adjustments.where('[machineId+slotNumber]').equals(['L7', 58]).toArray(),
    ).toHaveLength(1)
  })
})
```

Add this helper beside the existing `openLegacyV1`, in the same file:

```ts
/** The database exactly as version 2 left it — `filled` present on count
 * lines, `machineId` indexed on visits, `storeroomBalances` present, but no
 * `price` and no `adjustments`. This is the shape an operator's browser
 * actually holds after the first real restock run. */
function openLegacyV2(): Dexie {
  const legacy = new Dexie(DB_NAME)
  legacy.version(1).stores({
    items: 'id, name',
    machines: 'id, level',
    placements: 'id, itemId',
    slotConfigs: 'id, [machineId+slotNumber]',
    runs: 'id, date',
    visits: 'id, runId, [runId+machineId]',
    countLines: 'id, visitId, [visitId+slotNumber]',
  })
  legacy.version(2).stores({
    items: 'id, name',
    machines: 'id, level',
    placements: 'id, itemId',
    slotConfigs: 'id, [machineId+slotNumber]',
    runs: 'id, date',
    visits: 'id, runId, [runId+machineId], machineId',
    countLines: 'id, visitId, [visitId+slotNumber]',
    storeroomBalances: 'id, itemId',
  })
  return legacy
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/data/db.test.ts`
Expected: FAIL. The price tests fail with `expected undefined to be 4.5`; the
adjustments test fails with `SchemaError: KeyPath machineId on object store
adjustments is not indexed` or `Cannot read properties of undefined`.

- [ ] **Step 4: Add version 3 to the schema**

In `src/data/db.ts`, add `adjustments` to the typed table list at the top:

```ts
export const db = new Dexie('vending-stock-manager') as Dexie & {
  items: EntityTable<Item, 'id'>
  machines: EntityTable<Machine, 'id'>
  placements: EntityTable<ItemPlacement, 'id'>
  slotConfigs: EntityTable<SlotConfig, 'id'>
  runs: EntityTable<Run, 'id'>
  visits: EntityTable<Visit, 'id'>
  countLines: EntityTable<CountLine, 'id'>
  storeroomBalances: EntityTable<StoreroomBalance, 'id'>
  adjustments: EntityTable<Adjustment, 'id'>
}
```

Import `Adjustment` in the type import at the top of the file. Then append
after the v2 block:

```ts
// v3 — additive, two changes:
//  1. New `adjustments` table (design §4.1). Its location is three flat
//     columns, so every query Phase 2 makes is an index lookup rather than
//     the full scan `ItemPlacement.scope` forces.
//  2. `countLines` gains `price`, the item's price at count time, so a later
//     price change cannot re-price past runs (design §3.6). Existing rows are
//     backfilled from the item's current price — the best figure available,
//     and exactly right for every line recorded before any price moved.
//
// Unlike v2, this migration runs against real data: the first restock run has
// been recorded. Its tests write through the v2 schema before opening v3.
db.version(3).stores({
  items: 'id, name',
  machines: 'id, level',
  placements: 'id, itemId',
  slotConfigs: 'id, [machineId+slotNumber]',
  runs: 'id, date',
  visits: 'id, runId, [runId+machineId], machineId',
  countLines: 'id, visitId, [visitId+slotNumber]',
  storeroomBalances: 'id, itemId',
  adjustments:
    'id, itemId, occurredAt, machineId, transferId, [machineId+slotNumber]',
}).upgrade(async (tx) => {
  // Read every item once rather than per line: a machine's worth of lines all
  // reference the same handful of items, and `modify` runs per row.
  const items = await tx.table('items').toArray()
  const priceById = new Map<string, number>(
    items.map((i: Item) => [i.id, i.price]),
  )

  await tx.table('countLines').toCollection().modify((line: CountLine) => {
    if (line.price !== undefined) return
    // An item deleted since the count has no price to recover. `deleteItem`
    // deliberately leaves CountLine rows alone so past counts are not
    // rewritten, so this is reachable. Zero revenue is the honest answer;
    // the units still count.
    line.price = priceById.get(line.itemId) ?? 0
  })
})
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/data/db.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Make the rest of the suite compile**

`CountLine.price` is required, so every test fixture that builds a `CountLine`
literal now fails `tsc`. Run `npm run build` to list them, and add `price: 0`
to each — these are fixtures whose revenue is not under test.

Files known to contain such fixtures:
`src/data/repositories/visits.test.ts`, `src/ui/run/CountScreen.test.tsx`,
`src/ui/run/useCounting.test.tsx`, `src/ui/history/VisitReceipt.test.tsx`,
`src/ui/history/HistoryScreen.test.tsx`,
`src/ui/machines/MachineListScreen.test.tsx`.

- [ ] **Step 7: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: all tests pass, build clean.

- [ ] **Step 8: Commit**

```bash
git add src/domain/types.ts src/data/db.ts src/data/db.test.ts src/data/repositories/visits.test.ts src/ui
git commit -m "feat(data): schema v3 — adjustments table and a price snapshot on count lines

Adjustment's location is three flat columns, not a nested object, so every
query is an index lookup — deliberately not repeating the ItemPlacement.scope
gap that forces a full scan on every map resolution.

CountLine.price is backfilled from each item's current price, which is exactly
right for every line recorded before a price moved, and zero for an item since
deleted (deleteItem leaves count lines alone by design).

This is the first migration to run against real data, so its tests write
through the v2 schema and open v3 second."
```

---

## Task 2: The reason table

**Files:**
- Create: `src/domain/adjustments.ts`
- Test: `src/domain/adjustments.test.ts`

**Interfaces:**
- Consumes: `AdjustmentReason` from Task 1.
- Produces: `ADJUSTMENT_REASONS: ReasonSpec[]`, `reasonSpec(reason)`,
  `entersResidual(reason)`.

- [ ] **Step 1: Write the failing test**

Create `src/domain/adjustments.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ADJUSTMENT_REASONS, reasonSpec, entersResidual } from './adjustments'
import type { AdjustmentReason } from './types'

describe('the adjustment reason table', () => {
  it('covers spec §5.3 exactly, plus delivery', () => {
    expect(ADJUSTMENT_REASONS.map((r) => r.reason)).toEqual([
      'transfer', 'expired', 'damaged', 'missing', 'delivery', 'miscount',
    ])
  })

  // Spec §3.3: "Miscount corrections adjust the recorded level without
  // entering this calculation at all — they are data fixes, not stock
  // movements." Getting this wrong double-counts a correction as a sale.
  it('keeps a miscount out of the residual, and everything else in', () => {
    expect(entersResidual('miscount')).toBe(false)

    const others: AdjustmentReason[] =
      ['transfer', 'expired', 'damaged', 'missing', 'delivery']
    expect(others.filter((r) => !entersResidual(r))).toEqual([])
  })

  it('marks delivery as the only reason that increases total stock', () => {
    const increasing = ADJUSTMENT_REASONS
      .filter((r) => r.totalStock === 'increase')
      .map((r) => r.reason)
    expect(increasing).toEqual(['delivery'])
  })

  it('treats a transfer as moving stock, not losing it', () => {
    expect(reasonSpec('transfer').totalStock).toBe('unchanged')
  })

  it('gives every reason a label for the sheet', () => {
    expect(ADJUSTMENT_REASONS.filter((r) => r.label.trim() === '')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/adjustments.test.ts`
Expected: FAIL — `Failed to resolve import "./adjustments"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/adjustments.ts`:

```ts
import type { AdjustmentReason } from './types'

export interface ReasonSpec {
  reason: AdjustmentReason
  label: string
  /** What this does to stock across the whole estate. */
  totalStock: 'increase' | 'decrease' | 'unchanged'
  /** Whether it is a stock movement the sales residual must account for. */
  entersResidual: boolean
}

/** Spec §5.3's table as data rather than as branching scattered across call
 * sites — adding a reason is a row. Order is display order in the sheet. */
export const ADJUSTMENT_REASONS: ReasonSpec[] = [
  {
    reason: 'transfer',
    label: 'Move to another machine or the storeroom',
    totalStock: 'unchanged',
    entersResidual: true,
  },
  { reason: 'expired', label: 'Expired', totalStock: 'decrease', entersResidual: true },
  { reason: 'damaged', label: 'Damaged or broken', totalStock: 'decrease', entersResidual: true },
  { reason: 'missing', label: 'Missing or taken', totalStock: 'decrease', entersResidual: true },
  { reason: 'delivery', label: 'Delivery arrived', totalStock: 'increase', entersResidual: true },
  {
    reason: 'miscount',
    label: 'Miscount correction',
    totalStock: 'unchanged',
    // Spec §5.3 and §3.3: a data fix, not a stock movement. It corrects the
    // record without entering the sales calculation at all.
    entersResidual: false,
  },
]

const BY_REASON = new Map(ADJUSTMENT_REASONS.map((r) => [r.reason, r]))

export function reasonSpec(reason: AdjustmentReason): ReasonSpec {
  const spec = BY_REASON.get(reason)
  if (!spec) throw new Error(`Unknown adjustment reason: ${reason}`)
  return spec
}

export function entersResidual(reason: AdjustmentReason): boolean {
  return reasonSpec(reason).entersResidual
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/adjustments.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/adjustments.ts src/domain/adjustments.test.ts
git commit -m "feat(domain): the adjustment reason table, as data

Spec §5.3's reasons plus 'delivery', each carrying what it does to total stock
and whether it enters the sales residual. A miscount is the one that changes a
level without entering the calculation — it is a data fix, not a movement."
```

---

## Task 3: The adjustments repository

**Files:**
- Create: `src/data/repositories/adjustments.ts`
- Test: `src/data/repositories/adjustments.test.ts`

**Interfaces:**
- Consumes: `Adjustment` (Task 1), `db.adjustments` (Task 1).
- Produces:
  - `recordAdjustment(draft: AdjustmentDraft): Promise<Adjustment>`
  - `recordTransfer(params: TransferParams): Promise<[Adjustment, Adjustment]>`
  - `listAdjustments(): Promise<Adjustment[]>`
  - `adjustmentsForMachine(machineId: Id): Promise<Adjustment[]>`
  - `storeroomAdjustments(): Promise<Adjustment[]>`
  - `type AdjustmentDraft = Omit<Adjustment, 'id' | 'occurredAt' | 'updatedAt' | 'transferId'>`
  - `type AdjustmentLocation = { kind: 'storeroom' } | { kind: 'machine'; machineId: Id; slotNumber: number }`

- [ ] **Step 1: Write the failing test**

Create `src/data/repositories/adjustments.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db'
import {
  recordAdjustment, recordTransfer, listAdjustments,
  adjustmentsForMachine, storeroomAdjustments,
} from './adjustments'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('recordAdjustment', () => {
  it('stamps occurredAt from the clock, not from the caller', async () => {
    const before = Date.now()
    const saved = await recordAdjustment({
      itemId: 'coke', locationKind: 'storeroom',
      reason: 'delivery', units: 24,
    })

    expect(saved.occurredAt).toBeGreaterThanOrEqual(before)
    expect(saved.occurredAt).toBeLessThanOrEqual(Date.now())
  })

  it('keeps the sign it was given, so a loss stays negative', async () => {
    await recordAdjustment({
      itemId: 'coke', locationKind: 'machine',
      machineId: 'L7', slotNumber: 58, reason: 'expired', units: -2,
    })

    expect((await listAdjustments())[0].units).toBe(-2)
  })

  it('finds a machine\'s adjustments through the index', async () => {
    await recordAdjustment({
      itemId: 'coke', locationKind: 'machine',
      machineId: 'L7', slotNumber: 58, reason: 'expired', units: -2,
    })
    await recordAdjustment({
      itemId: 'coke', locationKind: 'machine',
      machineId: 'L2', slotNumber: 58, reason: 'expired', units: -1,
    })

    const found = await adjustmentsForMachine('L7')
    expect(found).toHaveLength(1)
    expect(found[0].machineId).toBe('L7')
  })

  it('separates storeroom adjustments from machine ones', async () => {
    await recordAdjustment({
      itemId: 'coke', locationKind: 'storeroom', reason: 'delivery', units: 24,
    })
    await recordAdjustment({
      itemId: 'coke', locationKind: 'machine',
      machineId: 'L7', slotNumber: 58, reason: 'expired', units: -2,
    })

    const storeroom = await storeroomAdjustments()
    expect(storeroom).toHaveLength(1)
    expect(storeroom[0].reason).toBe('delivery')
  })
})

describe('recordTransfer', () => {
  // Spec §5.3: "A transfer is a single action that updates both locations
  // atomically."
  it('writes both sides, opposite signs, sharing a transferId', async () => {
    const [out, into] = await recordTransfer({
      itemId: 'coke',
      units: 3,
      from: { kind: 'machine', machineId: 'L7', slotNumber: 58 },
      to: { kind: 'storeroom' },
    })

    expect(out.units).toBe(-3)
    expect(into.units).toBe(3)
    expect(out.transferId).toBe(into.transferId)
    expect(out.transferId).toBeDefined()
    expect(out.reason).toBe('transfer')
    expect(into.reason).toBe('transfer')
    expect(out.machineId).toBe('L7')
    expect(into.locationKind).toBe('storeroom')
  })

  it('rejects a transfer to the place it came from', async () => {
    await expect(recordTransfer({
      itemId: 'coke',
      units: 3,
      from: { kind: 'machine', machineId: 'L7', slotNumber: 58 },
      to: { kind: 'machine', machineId: 'L7', slotNumber: 58 },
    })).rejects.toThrow(/same location/i)

    expect(await listAdjustments()).toEqual([])
  })

  it('rejects a transfer of zero or fewer units', async () => {
    await expect(recordTransfer({
      itemId: 'coke',
      units: 0,
      from: { kind: 'storeroom' },
      to: { kind: 'machine', machineId: 'L7', slotNumber: 58 },
    })).rejects.toThrow(/at least one unit/i)

    expect(await listAdjustments()).toEqual([])
  })

  // The half-written transfer is the failure that matters: stock that left one
  // place and arrived nowhere silently becomes shrinkage in the residual.
  it('writes neither side when the write fails', async () => {
    const bulkPut = vi.spyOn(db.adjustments, 'bulkPut')
      .mockRejectedValueOnce(new Error('disk full'))

    await expect(recordTransfer({
      itemId: 'coke',
      units: 3,
      from: { kind: 'machine', machineId: 'L7', slotNumber: 58 },
      to: { kind: 'storeroom' },
    })).rejects.toThrow('disk full')

    expect(await listAdjustments()).toEqual([])
    bulkPut.mockRestore()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/repositories/adjustments.test.ts`
Expected: FAIL — `Failed to resolve import "./adjustments"`.

- [ ] **Step 3: Write the implementation**

Create `src/data/repositories/adjustments.ts`:

```ts
import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Adjustment, Id } from '../../domain/types'

export type AdjustmentDraft =
  Omit<Adjustment, 'id' | 'occurredAt' | 'updatedAt' | 'transferId'>

export type AdjustmentLocation =
  | { kind: 'storeroom' }
  | { kind: 'machine'; machineId: Id; slotNumber: number }

/** `occurredAt` is stamped here, from the clock, and is never taken from the
 * caller — design §4.1. The cost, recorded there: nothing can be backdated. */
export async function recordAdjustment(draft: AdjustmentDraft): Promise<Adjustment> {
  const stamp = now()
  const adjustment: Adjustment = {
    ...draft, id: newId(), occurredAt: stamp, updatedAt: stamp,
  }
  await db.adjustments.put(adjustment)
  return adjustment
}

function columnsFor(location: AdjustmentLocation) {
  return location.kind === 'storeroom'
    ? { locationKind: 'storeroom' as const }
    : {
        locationKind: 'machine' as const,
        machineId: location.machineId,
        slotNumber: location.slotNumber,
      }
}

function sameLocation(a: AdjustmentLocation, b: AdjustmentLocation): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'storeroom' || b.kind === 'storeroom') return true
  return a.machineId === b.machineId && a.slotNumber === b.slotNumber
}

export interface TransferParams {
  itemId: Id
  /** Positive magnitude. The signs are applied here, one per side. */
  units: number
  from: AdjustmentLocation
  to: AdjustmentLocation
  note?: string
}

/** Spec §5.3: "A transfer is a single action that updates both locations
 * atomically." One `bulkPut` inside one transaction, so a failure leaves
 * neither row — a half-written transfer is stock that left one place and
 * arrived nowhere, which the residual would silently book as shrinkage. */
export async function recordTransfer(
  params: TransferParams,
): Promise<[Adjustment, Adjustment]> {
  const { itemId, units, from, to, note } = params

  if (!Number.isFinite(units) || units < 1) {
    throw new Error('A transfer must move at least one unit')
  }
  if (sameLocation(from, to)) {
    throw new Error('A transfer must not start and end at the same location')
  }

  const stamp = now()
  const transferId = newId()
  const base = { itemId, reason: 'transfer' as const, transferId, note, occurredAt: stamp, updatedAt: stamp }

  const out: Adjustment = { ...base, ...columnsFor(from), id: newId(), units: -units }
  const into: Adjustment = { ...base, ...columnsFor(to), id: newId(), units }

  await db.transaction('rw', db.adjustments, async () => {
    await db.adjustments.bulkPut([out, into])
  })

  return [out, into]
}

export function listAdjustments(): Promise<Adjustment[]> {
  return db.adjustments.toArray()
}

export function adjustmentsForMachine(machineId: Id): Promise<Adjustment[]> {
  return db.adjustments.where('machineId').equals(machineId).toArray()
}

/** `locationKind` is not indexed — a storeroom row has no `machineId`, and
 * IndexedDB omits rows whose indexed key is undefined, so filtering the small
 * table in memory is simpler than a second index that only ever holds two
 * distinct values. */
export async function storeroomAdjustments(): Promise<Adjustment[]> {
  const all = await db.adjustments.toArray()
  return all.filter((a) => a.locationKind === 'storeroom')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/repositories/adjustments.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/repositories/adjustments.ts src/data/repositories/adjustments.test.ts
git commit -m "feat(data): record adjustments, with transfers written atomically

A transfer is two rows sharing a transferId, opposite signs, one transaction —
spec §5.3's 'one action, both sides'. Tested for the failure that matters: a
half-written transfer is stock that left one place and arrived nowhere, which
the residual would book as shrinkage."
```

---

## Task 4: Snapshot the price when a count line is written

**Files:**
- Modify: `src/ui/run/useCounting.ts:204-216` (`persist`), `:366-383` (finalize batch)
- Test: `src/ui/run/useCounting.test.tsx`

**Interfaces:**
- Consumes: `CountLine.price` (Task 1). `useCounting` already holds
  `items: Map<Id, Item>` from `useMachineMap` — that is the price source.
- Produces: every `CountLine` written by the app carries a real price.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/run/useCounting.test.tsx`, following the fixture style already
in that file (create the item, machine, placement and run, render the hook,
act on it, read the persisted lines back):

```ts
describe('the price snapshot', () => {
  it('records the price in force when the slot was counted', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setBefore(58, coke.id, 3)
    })

    const [line] = await getCountLines(visit.id)
    expect(line.price).toBe(4.5)
  })

  it('records the price on every line at finalize, not just the touched ones', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const chips = await saveItem({ name: 'Chips', price: 3.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    await setPlacement(chips.id, { kind: 'base' }, [12])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.finalize()
    })

    const lines = await getCountLines(visit.id)
    const byItem = new Map(lines.map((l) => [l.itemId, l.price]))
    expect(byItem.get(coke.id)).toBe(4.5)
    expect(byItem.get(chips.id)).toBe(3.5)
  })

  // The whole point of the snapshot (design §3.6): a price change must not
  // reach backwards.
  it('leaves an already-recorded line at its original price when the item is repriced', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const machine = await saveMachine({ label: 'Lift lobby', level: 7 })
    await setPlacement(coke.id, { kind: 'base' }, [58])
    const run = await createRun('2026-08-27')
    const visit = await openVisit(run.id, machine.id)

    const { result } = renderHook(() => useCounting(run.id, machine.id))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.setBefore(58, coke.id, 3)
    })

    await saveItem({ id: coke.id, name: 'Coke', price: 5, basePar: 5, boxSize: 24 })

    const [line] = await getCountLines(visit.id)
    expect(line.price).toBe(4.5)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/run/useCounting.test.tsx -t "price"`
Expected: FAIL — `expected 0 to be 4.5` (the fixture default added in Task 1
Step 6 is what gets written until this task changes it).

- [ ] **Step 3: Write price at both write sites**

In `src/ui/run/useCounting.ts`, add a lookup helper near `contentsOf`:

```ts
  /** The price to stamp on a line being written now. `items` comes from
   * `useMachineMap`, so this is a map read, not a database round trip on the
   * tapping path. Zero for an item that has gone missing from the catalogue —
   * the units still count, the revenue is simply unknowable (design §3.6). */
  const priceOf = useCallback(
    (itemId: Id) => items.get(itemId)?.price ?? 0,
    [items],
  )
```

Then in `persist`, add `price` to the written line:

```ts
      await putCountLine({
        id: newId(), visitId: visit.id, slotNumber, itemId,
        before: b, after: a, touched: isTouched, filled: isFilled,
        price: priceOf(itemId), updatedAt: now(),
      })
```

and add `priceOf` to that `useCallback`'s dependency array (`[visit, priceOf]`).

In the finalize batch, add `price` to the mapped line:

```ts
          return {
            id: newId(),
            visitId: visit.id,
            slotNumber: slot.slotNumber,
            itemId,
            before: before.get(key) ?? 0,
            after: after.get(key) ?? 0,
            touched: touched.has(key),
            filled: filled.has(slot.slotNumber),
            price: priceOf(itemId),
            updatedAt: now(),
          }
```

and add `priceOf` to the finalize `useCallback`'s dependency array.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/run/useCounting.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/ui/run/useCounting.ts src/ui/run/useCounting.test.tsx
git commit -m "feat(count): stamp the item's price onto every count line

Both write sites — the per-tap persist and the whole-machine finalize batch.
The price comes from the items map useMachineMap already holds, so this is a
map read rather than a database round trip on the tapping path.

Without it, repricing an item would re-price every past run and break
reconciliation against machine takings (design §3.6)."
```

---

## Task 5: The sales residual

**Files:**
- Create: `src/domain/sales.ts`
- Test: `src/domain/sales.test.ts`

**Interfaces:**
- Consumes: `CountLine`, `Visit`, `Adjustment` (Task 1); `entersResidual`
  (Task 2); `levelKey` from `src/domain/levels.ts`.
- Produces:
  - `interface SalesLine { slotNumber, itemId, opening, closing, movements, sold: number | null, censoredReason?: CensoredReason, ranDry: boolean, price: number, revenue: number | null }`
  - `type CensoredReason = 'no-previous-visit' | 'left-slot-with-stock'`
  - `interface VisitRecord { visit: Visit; lines: CountLine[] }`
  - `salesForPeriod(previous: VisitRecord | null, current: VisitRecord, adjustments: Adjustment[]): SalesLine[]`

- [ ] **Step 1: Write the failing test**

Create `src/domain/sales.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { salesForPeriod } from './sales'
import type { Adjustment, CountLine, Visit } from './types'

const visit = (id: string, finalizedAt: number): Visit => ({
  id, runId: 'r1', machineId: 'L7', status: 'finalized', finalizedAt,
  updatedAt: finalizedAt,
})

const line = (
  visitId: string, slotNumber: number, itemId: string,
  before: number, after: number, extra: Partial<CountLine> = {},
): CountLine => ({
  id: `${visitId}-${slotNumber}-${itemId}`, visitId, slotNumber, itemId,
  before, after, touched: true, filled: false, price: 4.5, updatedAt: 1,
  ...extra,
})

const movement = (
  itemId: string, slotNumber: number, units: number,
  reason: Adjustment['reason'], occurredAt: number,
): Adjustment => ({
  id: `${itemId}-${occurredAt}`, itemId, locationKind: 'machine',
  machineId: 'L7', slotNumber, reason, units, occurredAt, updatedAt: occurredAt,
})

describe('salesForPeriod', () => {
  it('sells the difference between what was left and what was found', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4)] },
      [],
    )

    expect(result.opening).toBe(10)
    expect(result.closing).toBe(4)
    expect(result.sold).toBe(6)
    expect(result.revenue).toBe(27)
  })

  // Spec §3.3's own worked cases.
  it('does not book a write-off as a sale', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 5, 5)] },
      [movement('coke', 58, -2, 'expired', 150)],
    )

    expect(result.sold).toBe(3)
  })

  it('counts stock transferred in as available to sell', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 5, 5)] },
      [movement('coke', 58, 3, 'transfer', 150)],
    )

    expect(result.sold).toBe(8)
  })

  it('ignores a miscount correction entirely', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4)] },
      [movement('coke', 58, -5, 'miscount', 150)],
    )

    expect(result.sold).toBe(6)
  })

  it('ignores movements outside the period', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4)] },
      [
        movement('coke', 58, -2, 'expired', 50),   // before the opening visit
        movement('coke', 58, -2, 'expired', 250),  // after the closing visit
      ],
    )

    expect(result.sold).toBe(6)
  })

  it('uses the closing line\'s price, so a period is valued as it was counted', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10, { price: 9.99 })] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4, { price: 4.5 })] },
      [],
    )

    expect(result.price).toBe(4.5)
    expect(result.revenue).toBe(27)
  })

  // Design §3.3: the operator's decision. An untouched row means seen and
  // unchanged, so it reports zero rather than being censored.
  it('reports zero for an untouched slot rather than censoring it', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 3)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 3, 3, { touched: false })] },
      [],
    )

    expect(result.sold).toBe(0)
    expect(result.censoredReason).toBeUndefined()
  })

  it('censors the first ever visit, which has no opening', () => {
    const [result] = salesForPeriod(
      null,
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 4, 4)] },
      [],
    )

    expect(result.sold).toBeNull()
    expect(result.revenue).toBeNull()
    expect(result.censoredReason).toBe('no-previous-visit')
  })

  // Design §3.4. The operator drains a line before removing it, so this is the
  // abnormal case: the item left the slot still holding stock, and the app
  // cannot tell whether it sold or was pulled out.
  it('censors an item that left a slot while it still held stock', () => {
    const results = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 5)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'fanta', 0, 5)] },
      [],
    )

    const coke = results.find((r) => r.itemId === 'coke')
    expect(coke?.sold).toBeNull()
    expect(coke?.censoredReason).toBe('left-slot-with-stock')
  })

  // The normal changeover, which must NOT be censored: Coke was drained to
  // zero before it was removed, so zero sold is the truthful answer.
  it('reports zero, not censored, when a drained line leaves a slot', () => {
    const results = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 0, 0)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'fanta', 0, 5)] },
      [],
    )

    const coke = results.find((r) => r.itemId === 'coke')
    expect(coke?.sold).toBe(0)
    expect(coke?.censoredReason).toBeUndefined()
  })

  it('reports a slot that ran dry, with its sales still counted', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [line('v1', 58, 'coke', 3, 10)] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 0, 0)] },
      [],
    )

    expect(result.ranDry).toBe(true)
    expect(result.sold).toBe(10)
  })

  it('handles a mixed slot as two independent results', () => {
    const results = salesForPeriod(
      {
        visit: visit('v1', 100),
        lines: [line('v1', 52, 'fanta', 0, 3), line('v1', 52, 'sunkist', 0, 2)],
      },
      {
        visit: visit('v2', 200),
        lines: [line('v2', 52, 'fanta', 1, 1), line('v2', 52, 'sunkist', 2, 2)],
      },
      [],
    )

    expect(results.find((r) => r.itemId === 'fanta')?.sold).toBe(2)
    expect(results.find((r) => r.itemId === 'sunkist')?.sold).toBe(0)
  })

  it('treats an item new to a slot as having opened at zero', () => {
    const [result] = salesForPeriod(
      { visit: visit('v1', 100), lines: [] },
      { visit: visit('v2', 200), lines: [line('v2', 58, 'coke', 4, 4)] },
      [],
    )

    expect(result.opening).toBe(0)
    // Found 4 in a slot that closed empty last time: negative sales are not
    // possible, so this is stock that arrived unrecorded, reported as zero.
    expect(result.sold).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/sales.test.ts`
Expected: FAIL — `Failed to resolve import "./sales"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/sales.ts`:

```ts
import { entersResidual } from './adjustments'
import { levelKey } from './levels'
import type { Adjustment, CountLine, Id, Visit } from './types'

export type CensoredReason = 'no-previous-visit' | 'left-slot-with-stock'

export interface VisitRecord {
  visit: Visit
  lines: CountLine[]
}

export interface SalesLine {
  slotNumber: number
  itemId: Id
  /** What the previous visit left in the slot. */
  opening: number
  /** What this visit found. */
  closing: number
  /** Net signed adjustments in the period, miscounts excluded. */
  movements: number
  /** Units sold, or null when the period is censored. */
  sold: number | null
  censoredReason?: CensoredReason
  ranDry: boolean
  price: number
  revenue: number | null
}

/** The residual for one period — the gap between two consecutive finalized
 * visits to one machine (spec §3.3).
 *
 *     sales = opening − closing + Σ signed movements
 *
 * Signed units collapse the spec's longer formula into that one sum: 2 expired
 * is −2, 3 transferred in is +3. Fills need no term of their own, because a
 * fill happens *at* a visit and is therefore already inside `previous.after`;
 * adding one would double-count it.
 *
 * Pure: takes plain data, returns plain data, reads no database. */
export function salesForPeriod(
  previous: VisitRecord | null,
  current: VisitRecord,
  adjustments: Adjustment[],
): SalesLine[] {
  const openingAt = new Map<string, number>()
  for (const l of previous?.lines ?? []) {
    openingAt.set(levelKey(l.slotNumber, l.itemId), l.after)
  }

  const closingAt = new Map<string, CountLine>()
  for (const l of current.lines) {
    closingAt.set(levelKey(l.slotNumber, l.itemId), l)
  }

  // The period runs from the previous visit being finished to this one being
  // finished. `occurredAt` is the moment the adjustment was logged (design
  // §4.1), so one logged at the machine during this count falls inside it.
  const from = previous?.visit.finalizedAt ?? 0
  const to = current.visit.finalizedAt ?? Number.MAX_SAFE_INTEGER

  const movementAt = new Map<string, number>()
  for (const a of adjustments) {
    if (a.slotNumber === undefined) continue
    if (!entersResidual(a.reason)) continue
    if (a.occurredAt <= from || a.occurredAt > to) continue
    const key = levelKey(a.slotNumber, a.itemId)
    movementAt.set(key, (movementAt.get(key) ?? 0) + a.units)
  }

  const keys = new Set([...openingAt.keys(), ...closingAt.keys()])
  const results: SalesLine[] = []

  for (const key of keys) {
    const closingLine = closingAt.get(key)
    const opening = openingAt.get(key) ?? 0
    const movements = movementAt.get(key) ?? 0

    // The item is no longer in this slot. Its own last recorded level decides
    // whether that is knowable: drained to zero before removal is the normal
    // changeover and means zero sold; removed while still holding stock could
    // equally be a sale or a pull-out, so it is censored (design §3.4).
    if (!closingLine) {
      const [slotPart, itemPart] = splitKey(key)
      results.push({
        slotNumber: slotPart,
        itemId: itemPart,
        opening,
        closing: 0,
        movements,
        sold: opening > 0 ? null : 0,
        censoredReason: opening > 0 ? 'left-slot-with-stock' : undefined,
        ranDry: false,
        price: 0,
        revenue: opening > 0 ? null : 0,
      })
      continue
    }

    const closing = closingLine.before
    const censored: CensoredReason | undefined =
      previous === null ? 'no-previous-visit' : undefined

    // Clamped at zero: a negative residual means stock arrived without being
    // recorded, which is not a negative sale.
    const sold = censored ? null : Math.max(0, opening - closing + movements)

    results.push({
      slotNumber: closingLine.slotNumber,
      itemId: closingLine.itemId,
      opening,
      closing,
      movements,
      sold,
      censoredReason: censored,
      ranDry: closing === 0,
      price: closingLine.price,
      revenue: sold === null ? null : sold * closingLine.price,
    })
  }

  return results.sort(
    (a, b) => a.slotNumber - b.slotNumber || a.itemId.localeCompare(b.itemId),
  )
}

/** `levelKey` is `${slotNumber}:${itemId}`, and an itemId is a UUID that may
 * itself contain no colon — so the first colon is the boundary. */
function splitKey(key: string): [number, Id] {
  const at = key.indexOf(':')
  return [Number(key.slice(0, at)), key.slice(at + 1)]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/sales.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Confirm domain purity still holds**

Run: `npx vitest run src/domain/purity.test.ts`
Expected: PASS — `sales.ts` imports only from `src/domain/`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/sales.ts src/domain/sales.test.ts
git commit -m "feat(domain): the sales residual

sales = opening − closing + Σ signed movements. Signed units collapse spec
§3.3's longer formula into one sum, and fills need no term because a fill
happens at a visit and is already inside the previous after.

Censors only what is genuinely unknowable: the first visit to a machine, and
an item that left a slot while still holding stock. The operator's normal
changeover drains a line to zero first, so it reports zero rather than being
censored — tested both ways."
```

---

## Task 6: Periods and the date range

**Files:**
- Create: `src/data/repositories/sales.ts`
- Test: `src/data/repositories/sales.test.ts`

**Interfaces:**
- Consumes: `salesForPeriod`, `VisitRecord`, `SalesLine` (Task 5);
  `listAdjustments` (Task 3); `db` tables.
- Produces:
  - `interface PeriodReport { runId: Id; runDate: string; machineId: Id; visit: Visit; editedLate: boolean; lines: SalesLine[] }`
  - `salesForRange(startDate: string, endDate: string): Promise<PeriodReport[]>`
  - `salesForRun(runId: Id): Promise<PeriodReport[]>`

- [ ] **Step 1: Write the failing test**

Create `src/data/repositories/sales.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { saveItem } from './items'
import { saveMachine } from './machines'
import { createRun } from './runs'
import { openVisit, putCountLine, finalizeVisit } from './visits'
import { recordAdjustment } from './adjustments'
import { salesForRange, salesForRun } from './sales'
import { newId, now } from '../../domain/ids'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function countMachine(
  runDate: string, machineId: string, itemId: string,
  before: number, after: number,
) {
  const run = await createRun(runDate)
  const visit = await openVisit(run.id, machineId)
  await putCountLine({
    id: newId(), visitId: visit.id, slotNumber: 58, itemId,
    before, after, touched: true, filled: false, price: 4.5, updatedAt: now(),
  })
  await finalizeVisit(visit.id)
  return { run, visit }
}

describe('salesForRange', () => {
  it('pairs each visit with the machine\'s previous one', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-20', l7.id, coke.id, 0, 10)
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    const [report] = await salesForRange('2026-08-27', '2026-08-27')

    expect(report.runDate).toBe('2026-08-27')
    expect(report.lines[0].sold).toBe(6)
  })

  // Design §5.1: a period is attributed to the run of its closing visit.
  it('attributes a skipped machine to the run it was next counted in', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-13', l7.id, coke.id, 0, 10)
    // No run on the 20th for this machine.
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    expect(await salesForRange('2026-08-20', '2026-08-20')).toEqual([])

    const [report] = await salesForRange('2026-08-27', '2026-08-27')
    expect(report.lines[0].sold).toBe(6)
  })

  it('sums across runs when the range spans several', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-13', l7.id, coke.id, 0, 10)
    await countMachine('2026-08-20', l7.id, coke.id, 7, 10)
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    const reports = await salesForRange('2026-08-14', '2026-08-27')

    expect(reports).toHaveLength(2)
    expect(reports.reduce((sum, r) => sum + (r.lines[0].sold ?? 0), 0)).toBe(9)
  })

  it('excludes runs outside the range at both ends', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-13', l7.id, coke.id, 0, 10)
    await countMachine('2026-08-20', l7.id, coke.id, 7, 10)
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    const reports = await salesForRange('2026-08-20', '2026-08-20')
    expect(reports.map((r) => r.runDate)).toEqual(['2026-08-20'])
  })

  it('ignores a draft visit, which has closed no period', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-20', l7.id, coke.id, 0, 10)
    const run = await createRun('2026-08-27')
    await openVisit(run.id, l7.id)

    expect(await salesForRange('2026-08-27', '2026-08-27')).toEqual([])
  })

  it('feeds the period its own machine\'s adjustments only', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const l2 = await saveMachine({ label: 'Gym', level: 2 })
    await countMachine('2026-08-20', l7.id, coke.id, 0, 10)
    await recordAdjustment({
      itemId: coke.id, locationKind: 'machine',
      machineId: l2.id, slotNumber: 58, reason: 'expired', units: -5,
    })
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    const [report] = await salesForRange('2026-08-27', '2026-08-27')
    expect(report.lines[0].sold).toBe(6)
  })

  // Design §3.2: sales always follow the counts, and an edit that lands after
  // the period closed is marked rather than blocked.
  it('marks a visit edited after the next run began', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const first = await countMachine('2026-08-20', l7.id, coke.id, 0, 10)
    await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    // Edit the older visit now — after the later run exists.
    await putCountLine({
      id: newId(), visitId: first.visit.id, slotNumber: 58, itemId: coke.id,
      before: 1, after: 10, touched: true, filled: false, price: 4.5,
      updatedAt: now(),
    })

    const [older] = await salesForRange('2026-08-20', '2026-08-20')
    expect(older.editedLate).toBe(true)

    const [newer] = await salesForRange('2026-08-27', '2026-08-27')
    expect(newer.editedLate).toBe(false)
  })
})

describe('salesForRun', () => {
  it('is the same as a range covering that run\'s date', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await countMachine('2026-08-20', l7.id, coke.id, 0, 10)
    const { run } = await countMachine('2026-08-27', l7.id, coke.id, 4, 10)

    const byRun = await salesForRun(run.id)
    const byRange = await salesForRange('2026-08-27', '2026-08-27')

    expect(byRun).toEqual(byRange)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/repositories/sales.test.ts`
Expected: FAIL — `Failed to resolve import "./sales"`.

- [ ] **Step 3: Write the implementation**

Create `src/data/repositories/sales.ts`:

```ts
import { db } from '../db'
import { salesForPeriod } from '../../domain/sales'
import type { SalesLine, VisitRecord } from '../../domain/sales'
import type { Id, Visit } from '../../domain/types'

export interface PeriodReport {
  runId: Id
  runDate: string
  machineId: Id
  visit: Visit
  /** The visit was edited after its period had already closed (design §3.2).
   * Derived from timestamps already stored — no extra state. */
  editedLate: boolean
  lines: SalesLine[]
}

/** The only place that knows a period spans two visits.
 *
 * A period is bounded by two consecutive finalized visits to one machine and
 * is attributed to the run of its **closing** visit (design §5.1). That makes
 * a run and a date range the same operation — a run is a range covering one
 * date — and means a machine skipped in a run contributes nothing to it rather
 * than a double-length period. */
export async function salesForRange(
  startDate: string,
  endDate: string,
): Promise<PeriodReport[]> {
  const [runs, visits, adjustments] = await Promise.all([
    db.runs.toArray(),
    db.visits.toArray(),
    db.adjustments.toArray(),
  ])

  const runById = new Map(runs.map((r) => [r.id, r]))
  const finalized = visits
    .filter((v) => v.status === 'finalized')
    .sort((a, b) => (a.finalizedAt ?? 0) - (b.finalizedAt ?? 0))

  const previousFor = new Map<Id, Visit>()
  const seenPerMachine = new Map<Id, Visit>()
  for (const v of finalized) {
    const prior = seenPerMachine.get(v.machineId)
    if (prior) previousFor.set(v.id, prior)
    seenPerMachine.set(v.machineId, v)
  }

  const inRange = finalized.filter((v) => {
    const date = runById.get(v.runId)?.date
    return date !== undefined && date >= startDate && date <= endDate
  })

  const adjustmentsByMachine = new Map<Id, typeof adjustments>()
  for (const a of adjustments) {
    if (!a.machineId) continue
    const list = adjustmentsByMachine.get(a.machineId) ?? []
    list.push(a)
    adjustmentsByMachine.set(a.machineId, list)
  }

  const reports = await Promise.all(inRange.map(async (visit) => {
    const previous = previousFor.get(visit.id)
    const [lines, previousLines] = await Promise.all([
      linesFor(visit.id),
      previous ? linesFor(previous.id) : Promise.resolve([]),
    ])

    const previousRecord: VisitRecord | null =
      previous ? { visit: previous, lines: previousLines } : null

    return {
      runId: visit.runId,
      runDate: runById.get(visit.runId)?.date ?? '',
      machineId: visit.machineId,
      visit,
      editedLate: wasEditedLate(visit, finalized),
      lines: salesForPeriod(
        previousRecord,
        { visit, lines },
        adjustmentsByMachine.get(visit.machineId) ?? [],
      ),
    }
  }))

  return reports.sort(
    (a, b) => a.runDate.localeCompare(b.runDate) || a.machineId.localeCompare(b.machineId),
  )
}

export async function salesForRun(runId: Id): Promise<PeriodReport[]> {
  const run = await db.runs.get(runId)
  if (!run) return []
  return salesForRange(run.date, run.date)
}

function linesFor(visitId: Id) {
  return db.countLines.where('visitId').equals(visitId).toArray()
}

/** The period closed when the machine's next visit was finalized. An edit
 * landing after that arrived too late to be part of the count it changes. */
function wasEditedLate(visit: Visit, finalized: Visit[]): boolean {
  const next = finalized.find(
    (v) => v.machineId === visit.machineId
      && (v.finalizedAt ?? 0) > (visit.finalizedAt ?? 0),
  )
  if (!next) return false
  return visit.updatedAt > (next.finalizedAt ?? 0)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/repositories/sales.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/data/repositories/sales.ts src/data/repositories/sales.test.ts
git commit -m "feat(data): pair visits into periods and query them by date range

A period is bounded by two consecutive finalized visits to one machine and is
attributed to the run of its closing visit (design §5.1). That makes a run and
a date range the same operation, and means a machine skipped in a run
contributes nothing to it rather than a double-length period — tested both ways.

editedLate is derived from timestamps already stored, so the marker adds no
state."
```

---

## Task 7: The adjustment sheet

**Files:**
- Create: `src/ui/adjustments/AdjustmentSheet.tsx`
- Test: `src/ui/adjustments/AdjustmentSheet.test.tsx`
- Modify: `src/ui/run/SlotEditSheet.tsx`

**Interfaces:**
- Consumes: `ADJUSTMENT_REASONS` (Task 2), `recordAdjustment`,
  `recordTransfer`, `AdjustmentLocation` (Task 3).
- Produces: `<AdjustmentSheet location={...} items={...} machines={...} onSaved={} onCancel={} />`

- [ ] **Step 1: Write the failing test**

Create `src/ui/adjustments/AdjustmentSheet.test.tsx`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { listAdjustments } from '../../data/repositories/adjustments'
import { AdjustmentSheet } from './AdjustmentSheet'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('AdjustmentSheet', () => {
  it('records a write-off as a negative movement at the slot', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    const onSaved = vi.fn()

    render(
      <AdjustmentSheet
        location={{ kind: 'machine', machineId: l7.id, slotNumber: 58 }}
        itemId={coke.id}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    )

    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '2')
    await user.selectOptions(screen.getByLabelText('Reason'), 'expired')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [saved] = await listAdjustments()
    expect(saved).toMatchObject({
      itemId: coke.id, locationKind: 'machine', machineId: l7.id,
      slotNumber: 58, reason: 'expired', units: -2,
    })
  })

  it('records a delivery as a positive movement', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })

    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }}
        itemId={coke.id}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '24')
    await user.selectOptions(screen.getByLabelText('Reason'), 'delivery')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(async () => {
      expect((await listAdjustments())[0]?.units).toBe(24)
    })
  })

  it('asks where a transfer is going, and writes both sides', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })

    render(
      <AdjustmentSheet
        location={{ kind: 'machine', machineId: l7.id, slotNumber: 58 }}
        itemId={coke.id}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Destination')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Reason'), 'transfer')
    expect(await screen.findByLabelText('Destination')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '3')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(async () => {
      expect(await listAdjustments()).toHaveLength(2)
    })
    const saved = await listAdjustments()
    expect(saved.map((a) => a.units).sort((a, b) => a - b)).toEqual([-3, 3])
  })

  it('refuses a quantity of zero rather than writing a no-op movement', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
    const onSaved = vi.fn()

    render(
      <AdjustmentSheet
        location={{ kind: 'storeroom' }}
        itemId={coke.id}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    )

    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '0')
    await user.click(screen.getByRole('button', { name: 'Record' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(await listAdjustments()).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/adjustments/AdjustmentSheet.test.tsx`
Expected: FAIL — `Failed to resolve import "./AdjustmentSheet"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/adjustments/AdjustmentSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { listMachines } from '../../data/repositories/machines'
import {
  recordAdjustment, recordTransfer, type AdjustmentLocation,
} from '../../data/repositories/adjustments'
import { ADJUSTMENT_REASONS, reasonSpec } from '../../domain/adjustments'
import type { AdjustmentReason, Id, Machine } from '../../domain/types'

/** One sheet, both locations (design §7.1). Reached from `⋯` on a slot row and
 * from the storeroom screen, with the location already known from where it was
 * opened — nothing is added to the counting flow itself, which stays the
 * latency-critical path.
 *
 * Quantity is entered as a positive magnitude; the sign is decided by the
 * reason, so the operator never types a minus. */
export function AdjustmentSheet({
  location, itemId, onSaved, onCancel,
}: {
  location: AdjustmentLocation
  itemId: Id
  onSaved: () => void
  onCancel: () => void
}) {
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState<AdjustmentReason>('expired')
  const [destination, setDestination] = useState<string>('storeroom')
  const [machines, setMachines] = useState<Machine[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => setMachines(await listMachines()))()
  }, [])

  async function record() {
    const magnitude = Number(quantity)
    if (!Number.isFinite(magnitude) || magnitude < 1) {
      setError('Enter at least one unit.')
      return
    }
    setError(null)

    if (reason === 'transfer') {
      const to: AdjustmentLocation = destination === 'storeroom'
        ? { kind: 'storeroom' }
        : { kind: 'machine', machineId: destination, slotNumber: slotOf(location) }
      await recordTransfer({ itemId, units: magnitude, from: location, to })
      onSaved()
      return
    }

    // `delivery` is the only reason that adds stock (spec §5.3); everything
    // else here removes it. A miscount is signed the same way — it corrects
    // the record downward — and is excluded from the residual by reason, not
    // by sign.
    const signed = reasonSpec(reason).totalStock === 'increase' ? magnitude : -magnitude

    await recordAdjustment({
      itemId,
      ...(location.kind === 'storeroom'
        ? { locationKind: 'storeroom' as const }
        : {
            locationKind: 'machine' as const,
            machineId: location.machineId,
            slotNumber: location.slotNumber,
          }),
      reason,
      units: signed,
    })
    onSaved()
  }

  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 font-semibold">
        {location.kind === 'storeroom'
          ? 'Adjust storeroom stock'
          : `Adjust slot ${location.slotNumber}`}
      </h3>

      <label className="mb-2 flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-gray-500">Quantity</span>
        <input
          aria-label="Quantity"
          type="number"
          inputMode="numeric"
          min={1}
          className="rounded-lg border p-2"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>

      <label className="mb-2 flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-gray-500">Reason</span>
        <select
          aria-label="Reason"
          className="rounded-lg border p-2"
          value={reason}
          onChange={(e) => setReason(e.target.value as AdjustmentReason)}
        >
          {ADJUSTMENT_REASONS.map((r) => (
            <option key={r.reason} value={r.reason}>{r.label}</option>
          ))}
        </select>
      </label>

      {reason === 'transfer' && (
        <label className="mb-2 flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-gray-500">Destination</span>
          <select
            aria-label="Destination"
            className="rounded-lg border p-2"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="storeroom">Storeroom G</option>
            {machines
              .filter((m) => location.kind !== 'machine' || m.id !== location.machineId)
              .map((m) => (
                <option key={m.id} value={m.id}>L{m.level}</option>
              ))}
          </select>
        </label>
      )}

      {error && (
        <span role="alert" className="mb-2 block text-xs font-semibold text-red-600">
          {error}
        </span>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void record()}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
        >
          Record
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500">
          Cancel
        </button>
      </div>
    </div>
  )
}

/** A transfer into another machine lands in the same slot number by default.
 * The storeroom has no slots, so this is only read for machine destinations. */
function slotOf(location: AdjustmentLocation): number {
  return location.kind === 'machine' ? location.slotNumber : 0
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/adjustments/AdjustmentSheet.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Reach it from the slot edit sheet**

Add a failing test to `src/ui/run/SlotEditSheet.test.tsx`:

```ts
it('opens the adjustment sheet for an item in the slot', async () => {
  const user = userEvent.setup()
  const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
  const machine = await saveMachine({ label: 'Lift lobby', level: 7 })

  render(
    <SlotEditSheet
      machineId={machine.id}
      slotNumber={58}
      items={[coke]}
      currentItemIds={[coke.id]}
      capacity={5}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'Adjust Coke' }))

  expect(await screen.findByLabelText('Reason')).toBeInTheDocument()
})
```

Run it, confirm it fails with `Unable to find role="button" and name "Adjust
Coke"`. Then in `SlotEditSheet.tsx` add `const [adjusting, setAdjusting] =
useState<Id | null>(null)`, render an `Adjust {item.name}` button beside each
present item's Remove button, and render `<AdjustmentSheet location={{ kind:
'machine', machineId, slotNumber }} itemId={adjusting} onSaved={() => {
setAdjusting(null); onSaved() }} onCancel={() => setAdjusting(null)} />` when
`adjusting !== null`. Re-run to confirm it passes.

- [ ] **Step 6: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/ui/adjustments src/ui/run/SlotEditSheet.tsx src/ui/run/SlotEditSheet.test.tsx
git commit -m "feat(adjustments): one sheet for both locations, reached from the slot

Quantity is a positive magnitude and the reason decides the sign, so the
operator never types a minus. Choosing 'transfer' reveals a destination and
writes both sides atomically.

Reached from the ⋯ already on every slot row, per design §3.5 — nothing is
added to the counting flow, which stays the latency-critical path."
```

---

## Task 8: The storeroom ledger

**Files:**
- Create: `src/domain/packs.ts`, `src/domain/packs.test.ts`
- Create: `src/domain/storeroom.ts`, `src/domain/storeroom.test.ts`
- Modify: `src/ui/storeroom/useStoreroom.ts`, `src/ui/storeroom/StoreroomScreen.tsx`
- Test: `src/ui/storeroom/StoreroomScreen.test.tsx`

**Interfaces:**
- Consumes: `storeroomAdjustments` (Task 3), `StoreroomBalance`,
  `getStoreroomBalance`, `setStoreroomBalance` (existing).
- Produces:
  - `toBoxesAndLoose(units: number, boxSize: number): { boxes: number; loose: number }`
  - `fromBoxesAndLoose(boxes: number, loose: number, boxSize: number): number`
  - `ledgerBalance(anchor: StoreroomBalance | undefined, movements: Adjustment[]): number`

- [ ] **Step 1: Write the failing pack tests**

Create `src/domain/packs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toBoxesAndLoose, fromBoxesAndLoose } from './packs'

describe('pack and loose counting', () => {
  it('splits units into boxes and what is left over', () => {
    expect(toBoxesAndLoose(137, 24)).toEqual({ boxes: 5, loose: 17 })
  })

  it('adds them back up', () => {
    expect(fromBoxesAndLoose(5, 17, 24)).toBe(137)
  })

  // Every seeded item currently has boxSize 1, so the control has to degrade
  // to plain units on its own rather than showing "137 boxes + 0".
  it('reports everything as loose when a box holds one', () => {
    expect(toBoxesAndLoose(137, 1)).toEqual({ boxes: 0, loose: 137 })
    expect(fromBoxesAndLoose(0, 137, 1)).toBe(137)
  })

  it('treats a nonsensical box size as loose rather than dividing by zero', () => {
    expect(toBoxesAndLoose(137, 0)).toEqual({ boxes: 0, loose: 137 })
  })

  it('handles an exact number of boxes', () => {
    expect(toBoxesAndLoose(48, 24)).toEqual({ boxes: 2, loose: 0 })
  })
})
```

- [ ] **Step 2: Run it to verify it fails, then implement**

Run: `npx vitest run src/domain/packs.test.ts` — FAIL, unresolved import.

Create `src/domain/packs.ts`:

```ts
/** Spec §5.4: every quantity entered at the storeroom is boxes + loose with
 * units computed — "5 boxes + 17 rather than counting to 137". Machine
 * screens stay in loose units, because a vending slot contains no boxes.
 *
 * Every seeded item currently has `boxSize: 1`, which makes this the identity
 * split — everything loose, nothing in boxes — so the control degrades to
 * plain units on its own and starts working the day real carton sizes are
 * entered. */
export function toBoxesAndLoose(
  units: number,
  boxSize: number,
): { boxes: number; loose: number } {
  if (!Number.isFinite(boxSize) || boxSize <= 1) return { boxes: 0, loose: units }
  return { boxes: Math.floor(units / boxSize), loose: units % boxSize }
}

export function fromBoxesAndLoose(
  boxes: number,
  loose: number,
  boxSize: number,
): number {
  if (!Number.isFinite(boxSize) || boxSize <= 1) return loose
  return boxes * boxSize + loose
}
```

Re-run: PASS, 5 tests.

- [ ] **Step 3: Write the failing balance test**

Create `src/domain/storeroom.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ledgerBalance } from './storeroom'
import type { Adjustment, StoreroomBalance } from './types'

const anchor = (units: number, verifiedAt: number): StoreroomBalance => ({
  id: 'b1', itemId: 'coke', units, updatedAt: verifiedAt, verifiedAt,
})

const movement = (units: number, occurredAt: number): Adjustment => ({
  id: `m${occurredAt}`, itemId: 'coke', locationKind: 'storeroom',
  reason: 'delivery', units, occurredAt, updatedAt: occurredAt,
})

describe('ledgerBalance', () => {
  // Spec §6.5: "an estimate maintained by a ledger, not a stocktake."
  it('adds movements since the last verified count', () => {
    expect(ledgerBalance(anchor(100, 50), [movement(24, 60), movement(-10, 70)]))
      .toBe(114)
  })

  it('ignores movements from before the count that superseded them', () => {
    expect(ledgerBalance(anchor(100, 50), [movement(24, 40)])).toBe(100)
  })

  it('ignores a movement logged at the same instant as the count', () => {
    // The count is the later truth: it observed the shelf after that movement
    // had already happened.
    expect(ledgerBalance(anchor(100, 50), [movement(24, 50)])).toBe(100)
  })

  it('counts every movement when nothing has ever been verified', () => {
    expect(ledgerBalance(undefined, [movement(24, 10), movement(-4, 20)])).toBe(20)
  })

  it('never reports negative stock', () => {
    expect(ledgerBalance(anchor(5, 50), [movement(-10, 60)])).toBe(0)
  })
})
```

- [ ] **Step 4: Run it to verify it fails, then implement**

Run: `npx vitest run src/domain/storeroom.test.ts` — FAIL, unresolved import.

Create `src/domain/storeroom.ts`:

```ts
import type { Adjustment, StoreroomBalance } from './types'

/** Spec §6.5: storeroom stock is "an estimate maintained by a ledger, not a
 * stocktake". The manual count is the anchor — the last moment the shelf was
 * actually observed — and everything logged since is applied on top.
 *
 * A movement at exactly `verifiedAt` is excluded: the count is the later
 * truth, having observed the shelf after that movement happened.
 *
 * Until Phase 3 brings the trolley, the movements here are deliveries,
 * adjustments and transfers. */
export function ledgerBalance(
  anchor: StoreroomBalance | undefined,
  movements: Adjustment[],
): number {
  const since = anchor?.verifiedAt ?? -Infinity
  const net = movements
    .filter((m) => m.occurredAt > since)
    .reduce((sum, m) => sum + m.units, 0)

  return Math.max(0, (anchor?.units ?? 0) + net)
}
```

Re-run: PASS, 5 tests.

- [ ] **Step 5: Wire the ledger into the storeroom screen**

Add a failing test to `src/ui/storeroom/StoreroomScreen.test.tsx`:

```ts
it('shows a delivery on top of the last counted figure', async () => {
  const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 5, boxSize: 24 })
  await setStoreroomBalance(coke.id, 100)
  await recordAdjustment({
    itemId: coke.id, locationKind: 'storeroom', reason: 'delivery', units: 24,
  })

  render(<StoreroomScreen />)

  expect(await screen.findByLabelText('Coke on hand')).toHaveTextContent('124')
})
```

Run it, confirm it fails. Then in `useStoreroom.ts` load
`storeroomAdjustments()` alongside the balances, group them by `itemId`, and
expose `onHand: Map<Id, number>` computed with `ledgerBalance`. In
`StoreroomScreen.tsx` render that figure per row with
`aria-label={`${item.name} on hand`}`, keeping the existing manual-count input
as the anchor-setting control. Re-run to confirm it passes.

- [ ] **Step 6: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/domain/packs.ts src/domain/packs.test.ts src/domain/storeroom.ts src/domain/storeroom.test.ts src/ui/storeroom
git commit -m "feat(storeroom): a ledger balance anchored to the last manual count

Balance = last verified count + everything logged since (spec §6.5 — an
estimate maintained by a ledger, not a stocktake). The manual count built
before the first run becomes the anchor rather than being replaced.

Pack/loose is the input control rather than a separate feature. Every item has
boxSize 1 today, so the split degrades to plain units on its own and starts
working the day real carton sizes are entered."
```

---

## Task 9: The report page

**Files:**
- Create: `src/ui/report/useReport.ts`, `src/ui/report/ReportScreen.tsx`
- Test: `src/ui/report/ReportScreen.test.tsx`
- Modify: `src/ui/history/HistoryScreen.tsx`

**Interfaces:**
- Consumes: `salesForRange`, `PeriodReport` (Task 6); `formatRunDate` from
  `src/domain/date.ts`; `listMachines`, `listItems`.
- Produces: `<ReportScreen />`, rendered by `HistoryScreen` under a Report tab.

- [ ] **Step 1: Write the failing test**

Create `src/ui/report/ReportScreen.test.tsx`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../data/db'
import { saveItem } from '../../data/repositories/items'
import { saveMachine } from '../../data/repositories/machines'
import { createRun } from '../../data/repositories/runs'
import { openVisit, putCountLine, finalizeVisit } from '../../data/repositories/visits'
import { newId, now } from '../../domain/ids'
import { ReportScreen } from './ReportScreen'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function counted(
  date: string, machineId: string, itemId: string,
  before: number, after: number, price = 4.5,
) {
  const run = await createRun(date)
  const visit = await openVisit(run.id, machineId)
  await putCountLine({
    id: newId(), visitId: visit.id, slotNumber: 58, itemId,
    before, after, touched: true, filled: false, price, updatedAt: now(),
  })
  await finalizeVisit(visit.id)
}

describe('ReportScreen', () => {
  it('says so before any run has closed a period', async () => {
    render(<ReportScreen />)

    expect(await screen.findByText(/nothing to report yet/i)).toBeInTheDocument()
  })

  it('shows units and revenue for the latest run by default', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)

    const totals = await screen.findByLabelText('report totals')
    expect(totals).toHaveTextContent('6')
    expect(totals).toHaveTextContent('27.00')
  })

  it('breaks the sales down per slot', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)

    const row = await screen.findByLabelText('L7 slot 58 sales')
    expect(row).toHaveTextContent('Coke')
    expect(row).toHaveTextContent('6')
  })

  it('widens to a date range and sums across runs', async () => {
    const user = userEvent.setup()
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-13', l7.id, coke.id, 0, 10)
    await counted('2026-08-20', l7.id, coke.id, 7, 10)
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)
    await screen.findByLabelText('report totals')

    await user.clear(screen.getByLabelText('From'))
    await user.type(screen.getByLabelText('From'), '2026-08-14')
    await user.clear(screen.getByLabelText('To'))
    await user.type(screen.getByLabelText('To'), '2026-08-27')

    await waitFor(() => {
      expect(screen.getByLabelText('report totals')).toHaveTextContent('9')
    })
  })

  it('marks a slot that ran dry', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    await counted('2026-08-27', l7.id, coke.id, 0, 10)

    render(<ReportScreen />)

    expect(await screen.findByLabelText('L7 slot 58 sales')).toHaveTextContent('RAN DRY')
  })

  // Stock on hand is a current figure and must not look like it belongs to the
  // selected period (design §7.2).
  it('labels stock on hand as now, not as part of the period', async () => {
    const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
    const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
    await counted('2026-08-20', l7.id, coke.id, 0, 10)
    await counted('2026-08-27', l7.id, coke.id, 4, 10)

    render(<ReportScreen />)

    expect(await screen.findByLabelText('stock on hand')).toHaveTextContent(/now/i)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/report/ReportScreen.test.tsx`
Expected: FAIL — `Failed to resolve import "./ReportScreen"`.

- [ ] **Step 3: Write `useReport`**

Create `src/ui/report/useReport.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { listItems } from '../../data/repositories/items'
import { listMachines } from '../../data/repositories/machines'
import { listRuns } from '../../data/repositories/runs'
import { salesForRange, type PeriodReport } from '../../data/repositories/sales'
import { storeroomAdjustments } from '../../data/repositories/adjustments'
import { listStoreroomBalances } from '../../data/repositories/storeroom'
import { ledgerBalance } from '../../domain/storeroom'
import type { Id, Item, Machine } from '../../domain/types'

export interface ReportData {
  reports: PeriodReport[]
  items: Map<Id, Item>
  machines: Machine[]
  /** Current storeroom units per item — not scoped to the range. */
  storeroomOnHand: Map<Id, number>
  loading: boolean
}

export function useReport(from: string, to: string) {
  const [data, setData] = useState<ReportData>({
    reports: [], items: new Map(), machines: [],
    storeroomOnHand: new Map(), loading: true,
  })

  const load = useCallback(async () => {
    const [reports, items, machines, balances, movements] = await Promise.all([
      from && to ? salesForRange(from, to) : Promise.resolve([]),
      listItems(),
      listMachines(),
      listStoreroomBalances(),
      storeroomAdjustments(),
    ])

    const byItem = new Map<Id, typeof movements>()
    for (const m of movements) {
      const list = byItem.get(m.itemId) ?? []
      list.push(m)
      byItem.set(m.itemId, list)
    }

    setData({
      reports,
      items: new Map(items.map((i) => [i.id, i])),
      machines,
      storeroomOnHand: new Map(items.map((i) => [
        i.id,
        ledgerBalance(balances.find((b) => b.itemId === i.id), byItem.get(i.id) ?? []),
      ])),
      loading: false,
    })
  }, [from, to])

  useEffect(() => { void load() }, [load])

  return { ...data, reload: load }
}

/** The most recent run's date, used as the default range. Returns an empty
 * string when no run exists, which `useReport` reads as "nothing to load". */
export async function latestRunDate(): Promise<string> {
  const runs = await listRuns()
  return runs[0]?.date ?? ''
}
```

- [ ] **Step 4: Write `ReportScreen`**

Create `src/ui/report/ReportScreen.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useReport, latestRunDate } from './useReport'

const money = (n: number) => n.toFixed(2)

/** Design §7.2. Scoped to a run by default — which is what close-out wants and
 * needs no input — with a start and end date for the questions a single run
 * cannot answer. Both are the same computation: §5.1 attributes each period to
 * the run of its closing visit, so a run is a range covering one date. */
export function ReportScreen() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      const latest = await latestRunDate()
      setFrom(latest)
      setTo(latest)
      setReady(true)
    })()
  }, [])

  const { reports, items, machines, storeroomOnHand, loading } = useReport(from, to)

  if (!ready || loading) return <div className="p-4">Loading…</div>

  const allLines = reports.flatMap((r) => r.lines)
  const units = allLines.reduce((sum, l) => sum + (l.sold ?? 0), 0)
  const revenue = allLines.reduce((sum, l) => sum + (l.revenue ?? 0), 0)

  const inMachines = reports.length === 0 ? 0 : allLines.reduce((sum, l) => sum + l.closing, 0)
  const inStoreroom = [...storeroomOnHand.values()].reduce((sum, n) => sum + n, 0)

  const machineById = new Map(machines.map((m) => [m.id, m]))

  return (
    <div className="p-4">
      <div className="mb-3 flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase text-gray-500">From</span>
          <input
            aria-label="From"
            type="date"
            className="rounded-lg border p-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase text-gray-500">To</span>
          <input
            aria-label="To"
            type="date"
            className="rounded-lg border p-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nothing to report yet — a period closes when a machine is finished for
          a second time.
        </p>
      ) : (
        <>
          <div
            aria-label="report totals"
            className="mb-3 rounded-lg border bg-gray-50 p-3"
          >
            <div className="text-sm text-gray-500">Sold this period</div>
            <div className="text-lg font-semibold">
              {units} units · ${money(revenue)}
            </div>
          </div>

          <div
            aria-label="stock on hand"
            className="mb-3 rounded-lg border p-3 text-sm"
          >
            <div className="font-semibold">Stock on hand — now</div>
            <div className="text-gray-500">
              Machines {inMachines} · Storeroom {inStoreroom} ·
              Total {inMachines + inStoreroom}
            </div>
          </div>

          <ul className="flex flex-col gap-1">
            {reports.flatMap((report) =>
              report.lines.map((line) => {
                const level = machineById.get(report.machineId)?.level ?? '?'
                return (
                  <li
                    key={`${report.visit.id}-${line.slotNumber}-${line.itemId}`}
                    aria-label={`L${level} slot ${line.slotNumber} sales`}
                    className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                  >
                    <span className="w-10 font-bold text-gray-500">L{level}</span>
                    <span className="w-8 text-gray-500">{line.slotNumber}</span>
                    <span className="flex-1">
                      {items.get(line.itemId)?.name ?? 'Deleted item'}
                    </span>
                    {line.ranDry && (
                      <span className="font-bold text-red-600">RAN DRY</span>
                    )}
                    {report.editedLate && (
                      <span className="text-xs font-bold uppercase text-amber-600">
                        Edited late
                      </span>
                    )}
                    {line.sold === null ? (
                      <span className="text-gray-400">not counted</span>
                    ) : (
                      <span className="font-semibold tabular-nums">
                        {line.sold} · ${money(line.revenue ?? 0)}
                      </span>
                    )}
                  </li>
                )
              }),
            )}
          </ul>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/ui/report/ReportScreen.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Add the Report view to History**

Add a failing test to `src/ui/history/HistoryScreen.test.tsx`:

```ts
it('switches between the receipts and the report', async () => {
  const user = userEvent.setup()
  await createRun('2026-08-27')

  render(<HistoryScreen />)
  await screen.findByLabelText('run 2026-08-27')

  await user.click(screen.getByRole('button', { name: 'Report' }))
  expect(await screen.findByLabelText('From')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Receipts' }))
  expect(await screen.findByLabelText('run 2026-08-27')).toBeInTheDocument()
})
```

Run it, confirm it fails. Then in `HistoryScreen.tsx` add
`const [view, setView] = useState<'receipts' | 'report'>('receipts')`, render a
two-button toggle above the content, and render `<ReportScreen />` when `view
=== 'report'`. Keep the existing drill-down untouched under `'receipts'`.
Re-run to confirm it passes.

- [ ] **Step 7: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/ui/report src/ui/history
git commit -m "feat(report): the report page, inside History

Scoped to the latest run by default, with a From and To date for the questions
a single run cannot answer. Both are one computation — design §5.1 attributes a
period to the run of its closing visit, so a run is a range covering one date.

Stock on hand is labelled 'now' and does not vary with the range: it is read
from the latest count of each machine and the storeroom balance, so presenting
it as belonging to the period would be a lie."
```

---

## Task 10: The stock matrix

**Files:**
- Create: `src/domain/stockMatrix.ts`, `src/domain/stockMatrix.test.ts`
- Create: `src/ui/report/StockMatrix.tsx`, `src/ui/report/StockMatrix.test.tsx`
- Modify: `src/ui/report/ReportScreen.tsx`, `src/ui/App.tsx`

**Interfaces:**
- Consumes: `Item`, `Machine`, `CountLine` (Task 1); `ledgerBalance` (Task 8).
- Produces:
  - `interface MatrixRow { key: string; itemId: Id; itemName: string; size?: string; perMachine: Map<Id, number>; storeroom: number; total: number }`
  - `buildStockMatrix(params): MatrixRow[]`

- [ ] **Step 1: Write the failing domain test**

Create `src/domain/stockMatrix.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildStockMatrix } from './stockMatrix'
import type { Item } from './types'

const item = (id: string, name: string, size?: string): Item => ({
  id, name, price: 4.5, basePar: 5, boxSize: 1, size, updatedAt: 1,
})

describe('buildStockMatrix', () => {
  it('gives a single-item slot an unsuffixed key', () => {
    const [row] = buildStockMatrix({
      items: [item('coke', 'Coke')],
      machineIds: ['L7'],
      levelsByMachine: new Map([['L7', new Map([['58:coke', 4]])]]),
      slotsByItem: new Map([['coke', [58]]]),
      storeroomOnHand: new Map([['coke', 100]]),
    })

    expect(row.key).toBe('58')
    expect(row.perMachine.get('L7')).toBe(4)
  })

  // The notes' decision: you order Fanta, not slot 52, so the row has to sit
  // beside the thing being ordered — never a split cell.
  it('splits a mixed slot into 52-1 and 52-2, one row each', () => {
    const rows = buildStockMatrix({
      items: [item('sunkist', 'Sunkist'), item('fanta', 'Fanta')],
      machineIds: ['L7'],
      levelsByMachine: new Map([
        ['L7', new Map([['52:sunkist', 3], ['52:fanta', 2]])],
      ]),
      slotsByItem: new Map([['sunkist', [52]], ['fanta', [52]]]),
      storeroomOnHand: new Map(),
    })

    expect(rows.map((r) => r.key)).toEqual(['52-1', '52-2'])
    expect(rows.map((r) => r.itemName)).toEqual(['Fanta', 'Sunkist'])
  })

  it('totals the machines plus the storeroom', () => {
    const [row] = buildStockMatrix({
      items: [item('coke', 'Coke')],
      machineIds: ['L2', 'L7'],
      levelsByMachine: new Map([
        ['L2', new Map([['58:coke', 3]])],
        ['L7', new Map([['58:coke', 4]])],
      ]),
      slotsByItem: new Map([['coke', [58]]]),
      storeroomOnHand: new Map([['coke', 100]]),
    })

    expect(row.storeroom).toBe(100)
    expect(row.total).toBe(107)
  })

  it('reads a machine that has never counted the slot as zero, not missing', () => {
    const [row] = buildStockMatrix({
      items: [item('coke', 'Coke')],
      machineIds: ['L2', 'L7'],
      levelsByMachine: new Map([['L7', new Map([['58:coke', 4]])]]),
      slotsByItem: new Map([['coke', [58]]]),
      storeroomOnHand: new Map(),
    })

    expect(row.perMachine.get('L2')).toBe(0)
    expect(row.total).toBe(4)
  })

  it('carries the size through for the Qty column', () => {
    const [row] = buildStockMatrix({
      items: [item('coke', 'Coke', '375ml')],
      machineIds: ['L7'],
      levelsByMachine: new Map(),
      slotsByItem: new Map([['coke', [58]]]),
      storeroomOnHand: new Map(),
    })

    expect(row.size).toBe('375ml')
  })

  it('omits an item that is stocked nowhere', () => {
    expect(buildStockMatrix({
      items: [item('coke', 'Coke')],
      machineIds: ['L7'],
      levelsByMachine: new Map(),
      slotsByItem: new Map(),
      storeroomOnHand: new Map(),
    })).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails, then implement**

Run: `npx vitest run src/domain/stockMatrix.test.ts` — FAIL, unresolved import.

Create `src/domain/stockMatrix.ts`:

```ts
import { levelKey } from './levels'
import type { Id, Item } from './types'

export interface MatrixRow {
  /** The slot as locator: `58` for a single-item slot, `52-1` / `52-2` for a
   * mixed one. */
  key: string
  itemId: Id
  itemName: string
  size?: string
  perMachine: Map<Id, number>
  storeroom: number
  total: number
}

export interface StockMatrixInput {
  items: Item[]
  machineIds: Id[]
  /** Per machine: `levelKey(slot, item)` → units currently in that slot. */
  levelsByMachine: Map<Id, Map<string, number>>
  /** Which slots each item occupies, anywhere in the estate. */
  slotsByItem: Map<Id, number[]>
  storeroomOnHand: Map<Id, number>
}

/** The paper sheet's layout: one row per item, a column per machine, then the
 * storeroom and a total.
 *
 * A mixed slot becomes two rows (`52-1 Fanta`, `52-2 Sunkist`), never a split
 * cell. The operator's reason, from the report notes: you order Fanta, not
 * slot 52, so the Order column has to sit beside the thing being ordered — a
 * split cell forces mental arithmetic while standing in the storeroom. */
export function buildStockMatrix(input: StockMatrixInput): MatrixRow[] {
  const { items, machineIds, levelsByMachine, slotsByItem, storeroomOnHand } = input

  const itemsInSlot = new Map<number, Item[]>()
  for (const item of items) {
    for (const slot of slotsByItem.get(item.id) ?? []) {
      const list = itemsInSlot.get(slot) ?? []
      list.push(item)
      itemsInSlot.set(slot, list)
    }
  }

  const rows: MatrixRow[] = []

  for (const [slot, occupants] of [...itemsInSlot].sort((a, b) => a[0] - b[0])) {
    const ordered = [...occupants].sort((a, b) => a.name.localeCompare(b.name))

    ordered.forEach((item, index) => {
      const perMachine = new Map<Id, number>()
      let inMachines = 0

      for (const machineId of machineIds) {
        const units = levelsByMachine.get(machineId)?.get(levelKey(slot, item.id)) ?? 0
        perMachine.set(machineId, units)
        inMachines += units
      }

      const storeroom = storeroomOnHand.get(item.id) ?? 0

      rows.push({
        key: ordered.length > 1 ? `${slot}-${index + 1}` : String(slot),
        itemId: item.id,
        itemName: item.name,
        size: item.size,
        perMachine,
        storeroom,
        total: inMachines + storeroom,
      })
    })
  }

  return rows
}
```

Re-run: PASS, 6 tests.

- [ ] **Step 3: Write the failing component test**

Create `src/ui/report/StockMatrix.test.tsx`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StockMatrix } from './StockMatrix'
import type { MatrixRow } from '../../domain/stockMatrix'
import type { Machine } from '../../domain/types'

const machines: Machine[] = [
  { id: 'm2', label: 'Gym', level: 2, updatedAt: 1 },
  { id: 'm7', label: 'Lift lobby', level: 7, updatedAt: 1 },
]

const rows: MatrixRow[] = [{
  key: '58', itemId: 'coke', itemName: 'Coke', size: '375ml',
  perMachine: new Map([['m2', 3], ['m7', 4]]),
  storeroom: 100, total: 107,
}]

describe('StockMatrix', () => {
  it('renders a column per machine, plus GF and Total', () => {
    render(<StockMatrix rows={rows} machines={machines} />)

    expect(screen.getByRole('columnheader', { name: 'L2' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'L7' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'GF' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument()
  })

  it('shows the slot as the locator and the size as Qty', () => {
    render(<StockMatrix rows={rows} machines={machines} />)

    const row = screen.getByLabelText('stock row 58')
    expect(row).toHaveTextContent('58')
    expect(row).toHaveTextContent('Coke')
    expect(row).toHaveTextContent('375ml')
  })

  // The toggles are what make a screenshot usable — 60 items by 17 columns is
  // not legible on a phone (design §7.3). They are not optional polish.
  it('hides a machine column when its toggle is turned off', async () => {
    const user = userEvent.setup()
    render(<StockMatrix rows={rows} machines={machines} />)

    await user.click(screen.getByRole('button', { name: 'Hide L2' }))

    expect(screen.queryByRole('columnheader', { name: 'L2' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'L7' })).toBeInTheDocument()
  })

  // Hiding a column changes what is shown, never what is counted.
  it('leaves the total unchanged when a column is hidden', async () => {
    const user = userEvent.setup()
    render(<StockMatrix rows={rows} machines={machines} />)

    await user.click(screen.getByRole('button', { name: 'Hide L2' }))

    expect(screen.getByLabelText('stock row 58')).toHaveTextContent('107')
  })

  it('leaves an Order column blank for hand-writing', () => {
    render(<StockMatrix rows={rows} machines={machines} />)

    expect(screen.getByRole('columnheader', { name: 'Order' })).toBeInTheDocument()
    expect(screen.getByLabelText('order for 58')).toHaveTextContent('')
  })
})
```

- [ ] **Step 4: Run it to verify it fails, then implement**

Run: `npx vitest run src/ui/report/StockMatrix.test.tsx` — FAIL, unresolved
import.

Create `src/ui/report/StockMatrix.tsx`:

```tsx
import { useState } from 'react'
import type { MatrixRow } from '../../domain/stockMatrix'
import type { Id, Machine } from '../../domain/types'

/** The paper stock sheet, on screen. The PDF export is held (design §2), so a
 * screenshot has to do its job — which makes legibility a requirement rather
 * than polish, because 60 items by 17 columns is not readable on a phone.
 *
 * Three things make it work: machine columns that toggle off, horizontal
 * scrolling for a larger screen, and landscape. `Order` stays blank for
 * hand-writing until Phase 3 fills it, exactly as the paper does today. */
export function StockMatrix({
  rows, machines,
}: {
  rows: MatrixRow[]
  machines: Machine[]
}) {
  const [hidden, setHidden] = useState<Set<Id>>(new Set())

  const shown = machines.filter((m) => !hidden.has(m.id))

  function toggle(machineId: Id) {
    setHidden((current) => {
      const next = new Set(current)
      if (!next.delete(machineId)) next.add(machineId)
      return next
    })
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {machines.map((m) => {
          const isHidden = hidden.has(m.id)
          return (
            <button
              key={m.id}
              type="button"
              aria-label={`${isHidden ? 'Show' : 'Hide'} L${m.level}`}
              aria-pressed={!isHidden}
              onClick={() => toggle(m.id)}
              className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                isHidden ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white'
              }`}
            >
              L{m.level}
            </button>
          )
        })}
      </div>

      {/* The only horizontally scrolling surface in the app. Every other
          screen is a phone-width column and should stay one. */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="px-2 py-1">Slot</th>
              <th scope="col" className="px-2 py-1">Item</th>
              <th scope="col" className="px-2 py-1">Qty</th>
              {shown.map((m) => (
                <th key={m.id} scope="col" className="px-2 py-1 text-right">
                  L{m.level}
                </th>
              ))}
              <th scope="col" className="px-2 py-1 text-right">GF</th>
              <th scope="col" className="px-2 py-1 text-right">Total</th>
              <th scope="col" className="px-2 py-1 text-right">Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                aria-label={`stock row ${row.key}`}
                className="border-b"
              >
                <td className="px-2 py-1 font-bold text-gray-500">{row.key}</td>
                <td className="whitespace-nowrap px-2 py-1">{row.itemName}</td>
                <td className="px-2 py-1 text-gray-500">{row.size ?? ''}</td>
                {shown.map((m) => (
                  <td key={m.id} className="px-2 py-1 text-right tabular-nums">
                    {row.perMachine.get(m.id) ?? 0}
                  </td>
                ))}
                <td className="px-2 py-1 text-right tabular-nums">{row.storeroom}</td>
                <td className="px-2 py-1 text-right font-semibold tabular-nums">
                  {row.total}
                </td>
                {/* Blank by design — Phase 3 fills it; until then it is
                    hand-written, exactly as on the paper sheet. */}
                <td aria-label={`order for ${row.key}`} className="px-2 py-1" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

Re-run: PASS, 5 tests.

- [ ] **Step 5: Let the matrix escape the phone-width column**

Add a failing test to `src/ui/App.e2e.test.tsx`:

```ts
it('lets a wide screen render wider than the phone column', async () => {
  render(<App />)
  await screen.findByRole('button', { name: 'History' })

  // Every screen is a phone-width column except the matrix, which would throw
  // away everything landscape buys if it inherited max-w-lg.
  const shell = screen.getByRole('navigation').parentElement
  expect(shell).toHaveClass('lg:max-w-none')
})
```

Run it, confirm it fails. Then in `App.tsx` change the shell wrapper to
`className="mx-auto max-w-lg pt-14 lg:max-w-none"` and give the `<nav>` the
same treatment so it spans the shell. Re-run to confirm it passes.

- [ ] **Step 6: Render the matrix on the report page**

Add a failing test to `src/ui/report/ReportScreen.test.tsx`:

```ts
it('shows the stock matrix under the sales breakdown', async () => {
  const coke = await saveItem({ name: 'Coke', price: 4.5, basePar: 10, boxSize: 24 })
  const l7 = await saveMachine({ label: 'Lift lobby', level: 7 })
  await setPlacement(coke.id, { kind: 'base' }, [58])
  await counted('2026-08-20', l7.id, coke.id, 0, 10)
  await counted('2026-08-27', l7.id, coke.id, 4, 10)

  render(<ReportScreen />)

  expect(await screen.findByLabelText('stock row 58')).toHaveTextContent('Coke')
})
```

Import `setPlacement` from `../../data/repositories/placements` in that test
file. Run it, confirm it fails. Then extend `useReport` to also load
`listPlacements()` and each machine's latest levels (reuse `historyForMachine`
with a limit of 1 per machine and `lastRecordedLevels` from
`src/domain/levels.ts`), build `slotsByItem` from the placements via
`effectivePlacement`, call `buildStockMatrix`, and expose `matrixRows`. Render
`<StockMatrix rows={matrixRows} machines={machines} />` at the bottom of
`ReportScreen`. Re-run to confirm it passes.

- [ ] **Step 7: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: all green, no warnings.

- [ ] **Step 8: Verify it in the real app**

Run `npm run dev`, load the starter catalogue, count two machines on two
different dates so a period closes, then open History → Report. Confirm: the
totals are right, the matrix renders, toggling a machine off narrows the table
without changing the Total column, and the page is legible in landscape.

**This step is not optional.** Two bugs in this codebase passed every test and
were caught only by running the app — the slot sheet that rendered 3100px below
the fold, and the machine list that painted before its data loaded.

- [ ] **Step 9: Commit**

```bash
git add src/domain/stockMatrix.ts src/domain/stockMatrix.test.ts src/ui/report src/ui/App.tsx src/ui/App.e2e.test.tsx
git commit -m "feat(report): the stock matrix, built to be screenshotted

One row per item, a toggleable column per machine, then GF, Total, and an
Order column left blank for hand-writing until Phase 3 fills it — the paper
sheet's layout.

A mixed slot is two rows (52-1, 52-2), never a split cell: you order Fanta,
not slot 52, so the Order column has to sit beside the thing being ordered.

The PDF export is held, so a screenshot does its job — which makes the column
toggles a requirement rather than polish, since 60 items by 17 columns is not
legible on a phone. The app shell also had to stop forcing max-w-lg on wide
screens, or landscape would have bought nothing."
```

---

## Task 11: Close out the phase

**Files:**
- Modify: `docs/known-gaps.md`
- Create: `docs/phase-2-report.md`

- [ ] **Step 1: Record what shipped and what did not**

Write `docs/phase-2-report.md` following the shape of
`docs/tier-3-fixes-report.md`: what was built, the decisions that cost
something, the evidence (test counts, build output, what was checked in the
browser), and a "not done, and why" section covering the held PDF export and
the `Order` column that waits for Phase 3.

- [ ] **Step 2: Update the known gaps**

In `docs/known-gaps.md`, move anything Phase 2 closed into "Fixed since this
list was written" with its commit hash, and add anything found on the way.
Expected additions: the storeroom ledger has no trolley movements until Phase 3
(expected, not a gap, but worth stating), and `Adjustment` has no edit or delete
path — a mistaken adjustment is corrected by logging its opposite.

- [ ] **Step 3: Final verification**

```bash
npx vitest run
npx vitest run 2>&1 | grep -iE "warning|act\(|unhandled|Errors "
npm run build
```

Expected: all tests pass, the grep prints nothing, the build is clean.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: Phase 2 implementation report and updated known gaps"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| §2 scope — `Adjustment` | 1, 3 |
| §3.1 sales derived at read time | 5, 6 (no stored sales table anywhere) |
| §3.2 edited late, never settles | 6 |
| §3.3 untouched slot reports zero | 5 |
| §3.4 changeover censoring | 5 |
| §3.5 adjustments off the counting flow | 7 |
| §3.6 price snapshot | 1, 4 |
| §4.1 `Adjustment`, flat location, no backdating | 1, 3 |
| §4.2 reason table | 2 |
| §4.3 transfers atomic | 3 |
| §4.4 `CountLine.price` | 1 |
| §5 residual formula | 5 |
| §5.1 period attribution | 6 |
| §5.2 censoring rules | 5 |
| §6 storeroom ledger | 8 |
| §7.1 adjustment sheet | 7 |
| §7.2 report page, range, stock-on-hand-is-now | 9 |
| §7.3 matrix, toggles, landscape | 10 |
| §8 pack/loose | 8 |
| §9 known-gaps entry | 11 |
| §10 migration | 1 |
| §11 testing | every task |

**Placeholders:** none. Every code step carries the code.

**Type consistency:** `SalesLine`, `VisitRecord`, `PeriodReport`, `MatrixRow`,
`AdjustmentDraft`, `AdjustmentLocation` and `ReasonSpec` are each defined once,
in the task that produces them, and referenced by the same names afterwards.
`salesForPeriod` takes `(previous, current, adjustments)` in Tasks 5 and 6
alike. `ledgerBalance(anchor, movements)` is the same in Tasks 8 and 9.
