# Phase 3 — Decide: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the recorded counts into a decision — how many a day each slot
sells, how many to put on the trolley, who goes short when there are not enough,
and what to order. Outcome: the trolley gets loaded once.

**Architecture:** One new table (`TrolleyLine`) and one new directory
(`src/backup/`). Everything else is a pure function in `src/domain/` over data
that already exists, matching Phase 2 — the sales residual, the machine map and
the storeroom balance are all derived at read time, and the forecast follows the
same rule. The only genuinely new stored facts are what was needed, what was
taken, and whether the shelf was empty.

**Tech Stack:** TypeScript, React 19, Dexie 4 (IndexedDB), Vitest +
@testing-library/react, Tailwind 4, Vite 6.

**Spec:** `docs/superpowers/specs/2026-09-04-phase-3-decide-design.md`
Parent spec (authority): `docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md`
Interface: `docs/design/2026-08-28-interface-refinement.md`, tokens in `docs/design/tokens.md`

---

## Before starting: the operator's answers

**§0 of the design lists thirteen decisions that are the operator's, not the
implementer's.** This plan is written against the recommendation given for each.
If any answer differs, the task that depends on it says so in its header —
check those before starting that task, not after.

| Decision | This plan assumes | Task affected |
| --- | --- | --- |
| D1 backup export first | Yes | 1 |
| D2 horizon / safety | 7 and 3 | 9 |
| D3 rate window | 4 periods | 4 |
| D4 one trolley load per run | Yes | 8, 13 |
| D5 allocation inside the load screen | Yes | 14 |
| D6 count the return | Yes | 16 |
| D7 `Order` column fills, with a toggle | Yes | 17 |
| D8 retire `miscount` | Yes | 18 |
| D9 withhold `transfer` during an open visit | Yes | 18 |
| D10 reorderable `accepts` | Yes | 19 (skip the task if no) |
| D11 `None left in G` on the load screen only | Yes | 13 |
| D12 whole boxes by default | Yes | 13 |
| D13 all fifteen machines | Yes | 12 |

---

## Global Constraints

- **`src/domain/` performs no I/O.** `src/domain/purity.test.ts` fails the build
  if any file there imports `dexie`, `react`, `../data/`, `./data/` or
  `node:fs`. Every calculation in this plan lives there; every read lives in
  `src/data/repositories/`.
- **No file created by this plan under `src/domain/` may contain the identifier
  `touched`** (design §3.1). Task 2 adds the test that enforces it. The flag is
  corrupt on every visit finalized on or before 2026-09-04 and cannot be
  repaired, so the forecast is built from levels, dates and adjustments only.
  **This is the constraint most likely to be violated by accident** — reaching
  for `touched` to mean "observed" is the natural move, and it is wrong here.
- **`null` is not zero.** A rate of `null` means "not enough history"; a rate of
  `0` means "this slot sells nothing". They produce different needs and must
  never be collapsed, in code or in a test fixture.
- **No new runtime dependencies.** The export is `JSON.stringify` and a Blob.
- **Schema goes to v4 and no further in this plan.** Additive: one new table, no
  `.upgrade()` body, no existing row read or written.
- **The v4 upgrade test writes through the older schema first** and opens the
  newer one second — the pattern `5f6defc` established and Phase 2 §10
  insisted on. A test that writes its data after the upgrade proves nothing.
- **`ledgerBalance` keeps exactly one implementation.** The trolley becomes
  another *producer of movements*, never a second balance formula (design §3.5).
  This is the Phase 2 bug (`99e7a91`) not being repeated.
- **British spelling in prose, US spelling in identifiers** — matches the
  existing codebase (`finalizedAt`, but "behaviour" in comments).
- **Every task ends green:** `npx vitest run` passes with no unhandled errors,
  and `npm run build` (which runs `tsc --noEmit`) succeeds.
- **Check for warnings before committing:**
  `npx vitest run 2>&1 | grep -iE "warning|act\(|unhandled|Errors "` must print
  nothing. (`DatabaseClosedError` from the component-test teardown race is a
  known harness flake — `known-gaps.md` — not a failure. Everything else is.)

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/backup/export.ts` | Every table into one JSON bundle, stamped with the schema version. |
| `src/domain/slotPeriods.ts` | `SalesLine[]` → one period per slot, with the slot total and the exclusion. |
| `src/domain/rate.ts` | Demand rate per slot, its window, and the explanation of what was skipped. |
| `src/domain/forecast.ts` | Projected level and need per slot. |
| `src/domain/pick.ts` | Needs resolved to items through `accepts`; aggregation into a pick list. |
| `src/domain/allocation.ts` | Ranking, the cut line, and who goes short. |
| `src/domain/trolley.ts` | What is left on the trolley, and the level it runs out at. |
| `src/domain/order.ts` | Forecast, suggested, order quantity in boxes. |
| `src/data/repositories/trolley.ts` | Reads and writes for `TrolleyLine`; `None left in G`. |
| `src/data/repositories/forecast.ts` | Assembles the rate/need inputs from Dexie. The only place that knows how far back to read. |
| `src/ui/components/QuantityField.tsx` | Boxes + loose, lifted out of `StoreroomScreen` so two screens share one. |
| `src/ui/trolley/TrolleyScreen.tsx` | Load and return, one screen in two modes. |
| `src/ui/trolley/useTrolley.ts` | Loads what `TrolleyScreen` renders; writes the load. |
| `src/ui/trolley/AllocationSection.tsx` | Rank order and the cut line. |
| `src/ui/report/OrderSection.tsx` | Horizon, safety, and the per-item order table. |

**Modified:**

| File | Change |
| --- | --- |
| `src/domain/types.ts` | `TrolleyLine`. |
| `src/domain/sales.ts` | `clamped` on `SalesLine`. |
| `src/domain/date.ts` | `daysBetween`. |
| `src/domain/storeroom.ts` | `storeroomMovements`; `ledgerBalance` takes normalised movements. |
| `src/domain/adjustments.ts` | `offered` on `ReasonSpec`; `miscount` retired. |
| `src/domain/purity.test.ts` | The `touched` guard. |
| `src/data/db.ts` | Schema v4. |
| `src/data/repositories/sales.ts` | `previousRunDate` on `PeriodReport`. |
| `src/data/repositories/visits.ts` | Correct `HISTORY_LIMIT`'s comment. |
| `src/ui/App.tsx` | The `trolley` screen; the export button's route if it needs one. |
| `src/ui/machines/MachineListScreen.tsx` | `Load trolley` / `Return leftovers` in the footer. |
| `src/ui/run/CountScreen.tsx` | The trolley-watch line. |
| `src/ui/run/SlotEditSheet.tsx` | Withhold `transfer` during an open visit; reorder `accepts`. |
| `src/ui/adjustments/AdjustmentSheet.tsx` | `offered` filter; remove the direction control. |
| `src/ui/storeroom/StoreroomScreen.tsx` | Use the shared `QuantityField`; `On the trolley`; the export button. |
| `src/ui/storeroom/useStoreroom.ts` | Balance through `storeroomMovements`. |
| `src/ui/report/ReportScreen.tsx` | The `Order` section. |
| `src/ui/report/StockMatrix.tsx` | `orderByItem` prop. |
| `src/ui/report/useReport.ts` | Feed the order suggestion. |
| `docs/known-gaps.md`, `docs/handover.md` | Task 20. |

---

## Task 1: The backup export, and the button that makes it usable

**Depends on:** D1. If the operator says no, skip this task and put §13.1's
warning in the handover in its strongest form instead.

**Why this is first and not last.** Schema v4 is a one-way door for the app
bundle: once a v4 database exists, a reverted v3 build cannot open it
(`VersionError` from IndexedDB). Spec §8.5 promises an export/import bundle as
the answer to exactly this and `src/backup/` has never been created. Every task
after this one moves the schema. Doing it now costs one small file; doing it
after means the migration ships with no way back.

**This is the one place this plan puts a UI element before the domain work.**
An export you cannot invoke is not a safety net, so the button ships with the
function. Everything forecasting-related still lands as pure domain first.

**Files:**
- Create: `src/backup/export.ts`, `src/backup/export.test.ts`
- Modify: `src/ui/storeroom/StoreroomScreen.tsx`

**Interfaces:**
- Consumes: `db`.
- Produces: `exportBundle(): Promise<Bundle>`, `downloadBundle(): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('backup export', () => {
  it('carries every table and the schema version', async () => {
    // seed one row in each table, then:
    const bundle = await exportBundle()
    expect(bundle.schemaVersion).toBe(4)   // 3 until task 10 lands; update then
    expect(bundle.tables.items).toHaveLength(1)
    expect(bundle.tables.countLines).toHaveLength(1)
    // …one assertion per table, so a table added later fails this test
  })

  it('survives an empty database', async () => {
    const bundle = await exportBundle()
    expect(bundle.tables.items).toEqual([])
  })

  it('stamps when it was taken', async () => {
    const bundle = await exportBundle()
    expect(bundle.exportedAt).toBeGreaterThan(0)
  })
})
```

The per-table assertion is deliberate and is the point of the test: a bundle
that silently omits a table added in a later phase is worse than no bundle,
because it looks like a backup.

- [ ] **Step 2: Implement**

```ts
export interface Bundle {
  schemaVersion: number
  exportedAt: number
  tables: Record<string, unknown[]>
}

export async function exportBundle(): Promise<Bundle> {
  // db.tables enumerates what the schema actually declares, so a table added
  // in a later version is included without this file being edited. A hard-coded
  // list is the failure mode this exists to avoid.
  const tables: Record<string, unknown[]> = {}
  for (const table of db.tables) tables[table.name] = await table.toArray()
  return { schemaVersion: db.verno, exportedAt: Date.now(), tables }
}
```

`downloadBundle()` builds a `Blob`, an object URL and a synthetic `<a>` click,
then revokes the URL. No dependency.

- [ ] **Step 3: The button**

On the storeroom screen — the app's existing desk-work-at-G screen — as a
`neutral-700` text action in the footer area, named
`Export a backup · 4 Sep`. Not accent: the screen's colour budget is already
spent, and this is a safety action, not a primary one.

- [ ] **Step 4: Verify** — `npx vitest run`, `npm run build`, no warnings.
- [ ] **Step 5: Commit** — `feat(backup): export every table before the schema moves again`

---

## Task 2: The derivations Phase 3 reads — `daysBetween`, `clamped`, `previousRunDate`

Three small additions to existing files, each a prerequisite for the rate. No
schema change. Grouped because none is worth a commit alone and all three are
"make the existing derivations say one more true thing".

**Files:**
- Modify: `src/domain/date.ts`, `src/domain/sales.ts`,
  `src/data/repositories/sales.ts`, `src/domain/purity.test.ts`
- Test: `src/domain/date.test.ts`, `src/domain/sales.test.ts`,
  `src/data/repositories/sales.test.ts`

- [ ] **Step 1: `daysBetween` — failing test first**

```ts
it('counts calendar days between two stored run dates', () => {
  expect(daysBetween('2026-08-25', '2026-08-28')).toBe(3)   // Tue → Fri
  expect(daysBetween('2026-08-28', '2026-09-01')).toBe(4)   // Fri → Tue
  expect(daysBetween('2026-08-25', '2026-08-25')).toBe(0)
})

it('is not thrown off by a daylight-saving boundary', () => {
  // Adelaide moves on the first Sunday in October.
  expect(daysBetween('2026-10-02', '2026-10-06')).toBe(4)
})
```

Implement by splitting on `-` and constructing a **local** `Date` from the
parts, exactly as `formatRunDate` already does, then differencing at UTC noon to
sidestep the DST hour. `new Date('2026-08-27')` parses as UTC midnight and
renders as the 26th in any zone behind UTC — `date.ts` documents this at length
and it must not be reintroduced.

- [ ] **Step 2: `clamped` on `SalesLine` — failing test first**

```ts
it('reports a clamped residual as clamped, not as zero sold', () => {
  // opening 5, closing 9 — stock arrived without being recorded.
  const [line] = salesForPeriod(previous, current, [])
  expect(line.sold).toBe(0)
  expect(line.clamped).toBe(true)
})

it('does not mark an honest zero as clamped', () => {
  // opening 5, closing 5
  expect(salesForPeriod(previous, current, [])[0].clamped).toBe(false)
})
```

In `sales.ts`, the clamp already exists at line 139. Capture the unclamped value
and set `clamped: raw < 0`. Censored lines get `clamped: false` — there is no
residual to clamp.

**Why this matters** (design §3.4): a clamped residual is the fingerprint of the
redistribution double-count recorded in `known-gaps.md`, and the rate must not
learn from a period whose numbers did not reconcile.

- [ ] **Step 3: `previousRunDate` on `PeriodReport` — failing test first**

```ts
it('reports the run date the period opened from', async () => {
  // two runs, one machine, both finalized
  const [report] = (await salesForRange(second.date, second.date))
  expect(report.previousRunDate).toBe(first.date)
})

it('is null for a machine\'s first ever visit', async () => {
  expect((await salesForRange(d, d))[0].previousRunDate).toBeNull()
})
```

`salesForRange` already holds `previousFor` and `runById`; this returns
information it already computed and threw away.

- [ ] **Step 4: The `touched` guard in `purity.test.ts`**

```ts
// Design §3.1. `CountLine.touched` is not trustworthy on any visit finalized on
// or before 2026-09-04: wherever `Fill tray to par` was used it was persisted
// `true` for slots nobody counted, and a false positive is indistinguishable
// from a real per-slot Fill. No figure is affected — before, after and the
// residual never read it — so the forecast is built from levels instead.
// Phase 2's files predate this rule and are listed as accepted; nothing new
// joins them.
const TOUCHED_MAY_APPEAR_IN = ['types.ts']   // the field's own declaration

it('keeps the forecast away from CountLine.touched', () => { /* grep */ })
```

- [ ] **Step 5: Verify and commit** —
  `feat(sales): a clamped residual, a period's opening date, and days between runs`

---

## Task 3: Slot periods — aggregating the residual to the slot

Spec §3.4 measures demand **per slot**; `salesForPeriod` computes **per (slot,
item)**. This is the aggregation step the spec never names (design §3.2), and it
is where censoring is decided.

**Files:**
- Create: `src/domain/slotPeriods.ts`, `src/domain/slotPeriods.test.ts`

**Interfaces:**
- Consumes: `SalesLine`, `CensoredReason` from `src/domain/sales.ts`. **No new
  censoring vocabulary** — the brief is explicit that `ranDry` and
  `censoredReason` are reused rather than paralleled.
- Produces: `SlotPeriod`, `RateExclusion`, `slotPeriods()`.

```ts
export type RateExclusion = CensoredReason | 'ran-dry' | 'residual-clamped'

export interface SlotPeriod {
  machineId: Id
  slotNumber: number
  runDate: string        // the CLOSING run — orders the window
  days: number           // calendar days, >= 1
  sold: number | null    // slot total across items; null when excluded
  closingTotal: number
  exclusion?: RateExclusion
}

export function slotPeriods(
  machineId: Id,
  runDate: string,
  previousRunDate: string | null,
  lines: SalesLine[],
): SlotPeriod[]
```

- [ ] **Step 1: Failing tests**

```ts
it('sums an item-level residual into one slot figure', () => {
  // slot 52: Coke sold 3, Fanta sold 2
  expect(one(slotPeriods(...)).sold).toBe(5)
})

it('censors a slot whose TOTAL closed at zero', () => {
  expect(one(...).exclusion).toBe('ran-dry')
  expect(one(...).sold).toBeNull()
})

it('does NOT censor a mixed slot with one item at zero and stock in the other', () => {
  // 0 Coke, 4 Fanta — the channel dispensed fine all period.
  // This is the test that separates SalesLine.ranDry from the slot's ran-dry.
  expect(one(...).exclusion).toBeUndefined()
  expect(one(...).sold).toBe(5)
})

it('carries a line-level censoring reason up to the slot', () => {
  expect(one(...).exclusion).toBe('left-slot-with-stock')
})

it('excludes a period whose residual clamped', () => {
  expect(one(...).exclusion).toBe('residual-clamped')
})

it('has no period at all without an opening run date', () => {
  expect(slotPeriods(m, '2026-09-04', null, lines)).toEqual([])
})
```

- [ ] **Step 2: Implement**

Group `lines` by `slotNumber`. For each slot:
`closingTotal = Σ closing`, `sold = Σ sold` (only when every line has a figure).
Exclusion precedence, highest first: any line's `censoredReason` → that reason;
else any line `clamped` → `residual-clamped`; else `closingTotal === 0` →
`ran-dry`; else none. `days = daysBetween(previousRunDate, runDate)`, floored at
1 — two runs on one calendar day is a correction, not a zero-length period, and
dividing by zero must be impossible.

- [ ] **Step 3: Verify and commit** — `feat(forecast): demand is measured on the slot, not the line`

---

## Task 4: The demand rate

Spec §6.1. Pure. **Depends on D3** (window of 4).

**Files:**
- Create: `src/domain/rate.ts`, `src/domain/rate.test.ts`

```ts
export const RATE_WINDOW = 4
export const MIN_PERIODS_FOR_RATE = 2

export interface DemandRate {
  rate: number | null
  unitsSold: number
  days: number
  periodsUsed: number
  excluded: { runDate: string; reason: RateExclusion }[]
}

/** `periods` newest first. */
export function demandRate(periods: SlotPeriod[]): DemandRate
```

- [ ] **Step 1: Failing tests**

```ts
it('is total units over total days across the window', () => {
  // 4 periods: 9/3d, 12/4d, 9/3d, 12/4d  →  42 / 14
  expect(demandRate(periods).rate).toBeCloseTo(3.0)
  expect(demandRate(periods).unitsSold).toBe(42)
  expect(demandRate(periods).days).toBe(14)
})

it('takes the four most recent usable periods, skipping the rest', () => {
  expect(demandRate(sixPeriodsTwoExcluded).periodsUsed).toBe(4)
})

it('has no rate below two usable periods — null, not zero', () => {
  const r = demandRate([onlyOneUsable])
  expect(r.rate).toBeNull()
  expect(r.rate).not.toBe(0)
})

it('has a rate of zero for a slot that genuinely sold nothing', () => {
  expect(demandRate(fourZeroSalePeriods).rate).toBe(0)
})

it('reports what it skipped and why, so the screen can show it', () => {
  expect(demandRate(periods).excluded).toEqual([
    { runDate: '2026-08-22', reason: 'ran-dry' },
    { runDate: '2026-08-15', reason: 'ran-dry' },
  ])
})
```

The last test is not decoration. Spec §6.1 chooses a mean over anything cleverer
*because the operator has to trust the number*, and a number whose exclusions
are invisible is not checkable.

- [ ] **Step 2: Implement.** Filter out excluded periods, take the first
  `RATE_WINDOW`, sum both columns, divide. `excluded` collects every period
  skipped *within the range scanned*, so the screen can say which runs were
  passed over.

- [ ] **Step 3: Verify and commit** — `feat(forecast): units a day, pooled over four clean periods`

**Note the deviation from the spec's literal wording** in the commit body:
§6.1 says "mean(units sold per day) over the last 4 non-censored periods", which
read strictly is a mean of four quotients. Periods are 3 and 4 days alternately,
so pooled and mean-of-quotients differ. Pooled is chosen because it is the
answer to the question and because it is one division the operator can check.
Design §3.3 and §16.1 record it.

---

## Task 5: Projection and need

Spec §6.2's first half. Pure.

**Files:**
- Create: `src/domain/forecast.ts`, `src/domain/forecast.test.ts`

```ts
export interface SlotNeedInput {
  machineId: Id
  slotNumber: number
  capacity: number
  lastLevel: number      // slot total left at the last visit
  rate: number | null
  daysSince: number      // from THIS machine's last visit to the planned run
  ranDryLastPeriod: boolean
}

export interface SlotNeed extends SlotNeedInput {
  projected: number
  need: number
  basis: 'rate' | 'no-rate'
}

export function slotNeed(input: SlotNeedInput): SlotNeed
```

- [ ] **Step 1: Failing tests**

```ts
it('projects the level down at the rate and asks for the difference', () => {
  // capacity 10, left 8, 1.5/day, 4 days → projected 2 → need 8
  expect(slotNeed({...}).need).toBe(8)
})

it('falls back to capacity minus the last level when there is no rate', () => {
  // capacity 10, left 8, rate null → need 2, and basis says why
  expect(slotNeed({ ...noRate }).need).toBe(2)
  expect(slotNeed({ ...noRate }).basis).toBe('no-rate')
})

it('rounds the need up, because under-picking costs a trip', () => {
  // capacity 5, left 5, 0.4/day, 3 days → projected 3.8 → need 2, not 1
  expect(slotNeed({...}).need).toBe(2)
})

it('never projects below zero and never needs more than capacity', () => {
  expect(slotNeed({ capacity: 5, lastLevel: 2, rate: 9, daysSince: 7 }).need).toBe(5)
})

it('never returns a negative need when the slot is over capacity', () => {
  // reachable: the count cells deliberately do not clamp (interface §3.3)
  expect(slotNeed({ capacity: 5, lastLevel: 7, rate: null }).need).toBe(0)
})
```

- [ ] **Step 2: Implement as one expression, not a branch.**

```ts
const projected = rate === null ? lastLevel : Math.max(0, lastLevel - rate * daysSince)
const need = Math.min(capacity, Math.max(0, Math.ceil(capacity - projected)))
```

With `rate === null` the projection is the last level, so the formula *is*
§6.1's stated fallback. One formula is one thing to test and one thing to
explain on the screen.

- [ ] **Step 3: Verify and commit** — `feat(forecast): what a slot will be down to, and what it wants`

---

## Task 6: The pick list

Spec §6.2's item resolution. Pure. **Depends on D13.**

**Files:**
- Create: `src/domain/pick.ts`, `src/domain/pick.test.ts`

```ts
export interface PickInput {
  needs: SlotNeed[]
  accepts: Map<string, Id[]>     // `${machineId}:${slotNumber}` → preference order
  outOfStock: Set<Id>            // ledger balance is zero — a BINARY, never a quantity
}

export interface PickAssignment {
  machineId: Id; slotNumber: number; itemId: Id; units: number
}

export interface PickLine {
  itemId: Id
  needed: number
  slots: PickAssignment[]
}

export interface PickList {
  lines: PickLine[]                       // by item
  unfulfillable: SlotNeed[]               // every accepted item is out
  quiet: SlotNeed[]                       // rate 0, level unmoved 4 periods (design §4.4)
}

export function buildPickList(input: PickInput): PickList
```

- [ ] **Step 1: Failing tests**

```ts
it('resolves a slot to the first accepted item that is in stock', () => { … })

it('falls to the second accepted item when the first is out', () => { … })

it('lists a need as unfulfillable when every accepted item is out', () => {
  expect(buildPickList(input).unfulfillable).toHaveLength(1)
  expect(buildPickList(input).lines).toEqual([])
})

it('aggregates the same item across machines into one line', () => {
  expect(line('coke').needed).toBe(18)
  expect(line('coke').slots).toHaveLength(5)
})

it('does not ration against the storeroom estimate', () => {
  // ledger says 8 Coke, needs total 18: the pick list still asks for 18.
  // The estimate is an estimate; the operator is looking at the shelf.
  expect(line('coke').needed).toBe(18)
})

it('lists a slot that has sold nothing and not moved as quiet, not as a need', () => { … })

it('skips a slot whose need is zero', () => { … })
```

The rationing test is the important one and it is testing a *refusal*. Design
§3.7: a pick list that has already rationed against a wrong estimate disagrees
with what the operator can see, and they have to undo the app's arithmetic in
their head.

- [ ] **Step 2: Implement.** Walk needs in walk order (level, then slot),
  resolve, aggregate.

- [ ] **Step 3: Verify and commit** — `feat(pick): needs resolved to items, aggregated per item`

---

## Task 7: Allocation

Spec §6.2's shortfall. Pure. **Depends on D4.**

**Files:**
- Create: `src/domain/allocation.ts`, `src/domain/allocation.test.ts`

```ts
export interface AllocationLine {
  machineId: Id; slotNumber: number; itemId: Id
  need: number
  allocated: number
  rank: number
}

export interface Allocation {
  lines: AllocationLine[]      // rank order
  cutAfter: number | null      // index of the last line served in full; null = all served
}

export function allocate(
  assignments: PickAssignment[],
  needsBySlot: Map<string, SlotNeed>,
  taken: Map<Id, number>,
  levelOf: Map<Id, number>,
): Allocation
```

- [ ] **Step 1: Failing tests** — one per spec §6.2 rule

```ts
it('serves a slot that ran dry before one with a higher rate', () => { … })

it('orders the rest by demand rate, descending', () => { … })

it('breaks a tie in walk order — lowest level, then lowest slot', () => { … })

it('ranks a slot with no rate below every rated slot', () => {
  // null is neither a high rate nor a zero rate.
})

it('gives the slot at the cut line a partial allocation', () => {
  // 4 left, need 7 → allocated 4. Leaving units on the trolley helps nobody.
})

it('reports the cut line so the screen can draw it', () => {
  expect(allocate(...).cutAfter).toBe(2)
})

it('allocates nothing beyond what was taken', () => {
  expect(total(allocate(...))).toBe(taken.get('coke'))
})

it('has no cut line when everything is covered', () => {
  expect(allocate(...).cutAfter).toBeNull()
})
```

- [ ] **Step 2: Implement.** Sort, then walk allocating `min(need, remaining)`.
  Writes nothing anywhere — allocation is advisory and every number is
  overridable (spec §6.2, design §3.9).

- [ ] **Step 3: Verify and commit** — `feat(allocation): rank the shortfall and show the cut line`

---

## Task 8: The trolley's arithmetic and the watch

Spec §6.3. Pure. **Depends on D4.**

**Files:**
- Create: `src/domain/trolley.ts`, `src/domain/trolley.test.ts`

```ts
/** taken − Σ (after − before) over this run's count lines. Signed on purpose. */
export function trolleyRemaining(
  taken: Map<Id, number>,
  lines: CountLine[],
): Map<Id, number>

export interface RunOut { itemId: Id; level: number; remaining: number }

export function runsOutAt(
  remaining: Map<Id, number>,
  drawByMachine: { machineId: Id; level: number; draw: Map<Id, number> }[],
): RunOut[]
```

- [ ] **Step 1: Failing tests**

```ts
it('decrements by what went into the machine, not by a Fill tap', () => {
  // before 2, after 10 → 8 off the trolley. No `filled` flag consulted.
})

it('increments when stock is pulled OUT of a machine onto the trolley', () => {
  // before 6, after 2 → +4. Spec §3.2's intra-run redistribution, for free.
})

it('names the level an item runs out at', () => {
  expect(runsOutAt(...)).toEqual([{ itemId: 'coke', level: 11, remaining: 6 }])
})

it('says nothing when everything ahead is covered', () => {
  expect(runsOutAt(...)).toEqual([])
})
```

**Do not read `filled`, and do not read `touched`.** Spec §6.3's "decrements
with each `Fill`" is obsolete: since the after-count became editable
(spec §3.2 as amended, 2026-08-27) a refill is recorded by typing, and
`Fill tray to par` sets a whole tray. `after − before` covers every path,
including ones that do not exist yet. Design §16.5.

- [ ] **Step 2: Implement and commit** — `feat(trolley): what is left, and the level it runs out at`

---

## Task 9: The order suggestion

Spec §6.4. Pure. **Depends on D2** (7 and 3).

**Files:**
- Create: `src/domain/order.ts`, `src/domain/order.test.ts`

```ts
export const ORDER_HORIZON_DAYS = 7
export const ORDER_SAFETY_DAYS = 3

export interface OrderInput {
  itemId: Id
  boxSize: number
  onHand: number
  /** Rates of the slots whose `accepts[0]` is this item — design §3.8. */
  slotRates: (number | null)[]
  flags: ('ran-dry' | 'none-left' | 'unfulfillable')[]
}

export interface OrderLine {
  itemId: Id
  ratePerDay: number
  forecast: number
  onHand: number
  suggested: number
  boxes: number
  units: number
  flags: OrderInput['flags']
}

export function orderSuggestion(
  inputs: OrderInput[],
  horizon = ORDER_HORIZON_DAYS,
  safety = ORDER_SAFETY_DAYS,
): OrderLine[]
```

- [ ] **Step 1: Failing tests**

```ts
it('forecasts the horizon plus the safety buffer and nets off what is on hand', () => {
  // 3/day × (7 + 3) = 30, on hand 6 → suggested 24
})

it('rounds up to whole boxes', () => {
  // suggested 24, box of 24 → 1 box.  suggested 25 → 2 boxes.
})

it('reads in units at box size 1', () => {
  // the fourteen loose sundries in the catalogue
  expect(line.boxes).toBe(line.units)
})

it('suggests nothing when the storeroom already covers the horizon', () => {
  expect(line.suggested).toBe(0)
  expect(line.boxes).toBe(0)
})

it('counts a slot accepting two items towards exactly ONE of them', () => {
  // THE test for design §3.8. Spec §6.4's "Σ over slots accepting this item"
  // counts a two-item slot in both forecasts and over-orders. The slot belongs
  // to accepts[0] — the item it will actually be filled with.
})

it('treats a slot with no rate as contributing nothing, not as zero demand', () => {
  // null contributes no slot to the sum; it does not drag an average down.
})
```

- [ ] **Step 2: Implement.**

Do **not** subtract stock in the machines. The machines are full at the start of
the horizon and drain over it, and every unit that drains is replaced from the
storeroom — so the storeroom supplies the whole horizon regardless. Spec §6.4
has this right and does not say why; put the reason in the file's doc comment
(design §10) before someone "fixes" it.

- [ ] **Step 3: Verify and commit** — `feat(order): the horizon, the buffer, and how many boxes`

> **The pure-domain half of the phase ends here.** Every figure Phase 3 shows is
> now computable without a database or a browser, and every one of them is
> tested against the spec's own worked rules. Tasks 10 onwards are wiring.

---

## Task 10: Schema v4 — the trolley table

**Files:**
- Modify: `src/domain/types.ts`, `src/data/db.ts`
- Test: `src/data/db.test.ts`

- [ ] **Step 1: The type**

```ts
/** What the trolley carried on one run (spec §4.1, §6.2).
 *
 * `needed` is a SNAPSHOT and is the one figure in this codebase that is stored
 * rather than derived. A past run's pick list cannot be recomputed — it
 * depended on the levels and rates as they stood before that run counted
 * anything, and the run destroyed them. This records a decision, not a cache.
 *
 * `taken` and `returned` are always in UNITS. Boxes + loose is an input
 * convention (spec §5.4); nothing stores boxes. */
export interface TrolleyLine {
  id: Id
  runId: Id
  itemId: Id
  needed: number
  taken: number
  noneLeftInG: boolean
  loadedAt: number
  returned?: number
  returnedAt?: number
  updatedAt: number
}
```

- [ ] **Step 2: Failing upgrade tests**

```ts
describe('schema version 4 upgrade', () => {
  it('adds trolleyLines indexed for the queries Phase 3 makes', async () => {
    await db.open()
    const idx = db.trolleyLines.schema.indexes.map((i) => i.name)
    expect(idx).toContain('runId')
    expect(idx).toContain('[runId+itemId]')
  })

  // v4 rewrites nothing, so this is the assertion that matters: an upgrade
  // that touches no row must be provably innocent of touching a row.
  it('leaves every pre-upgrade row exactly as it was', async () => {
    const legacy = openLegacyV3()
    await legacy.open()
    await legacy.table('countLines').put({ …, price: 4.5, touched: true })
    await legacy.table('adjustments').put({ … })
    await legacy.table('storeroomBalances').put({ … })
    legacy.close()

    await db.open()

    expect(await db.countLines.get(lineId)).toEqual(theExactRowWrittenAbove)
    expect(await db.adjustments.toArray()).toHaveLength(1)
    expect(await db.storeroomBalances.toArray()).toHaveLength(1)
  })

  it('opens a database that has never held a trolley line', async () => {
    await db.open()
    expect(await db.trolleyLines.toArray()).toEqual([])
  })
})
```

Write through the v3 schema **first** and open v4 **second**. A test that writes
after the upgrade proves nothing — `5f6defc` exists because two tests did
exactly that.

- [ ] **Step 3: Implement**

```ts
// v4 — additive, one change: the `trolleyLines` table (design §5.1).
//
// There is NO upgrade function, and that is the whole character of this
// migration: v2 rewrote every count line to derive `filled`, v3 rewrote every
// count line to backfill `price`. v4 reads no existing row and writes none.
//
// Rollback: the DATA stays safe — nothing existing is altered or reinterpreted.
// The BUNDLE does not. IndexedDB refuses to open a database at a version above
// the one requested, so a reverted v3 build cannot open a v4 database at all
// (VersionError). This was equally true of v2 and v3 and has never been
// written down. The export in src/backup/ is the mitigation.
db.version(4).stores({
  …every v3 table redeclared verbatim…,
  trolleyLines: 'id, runId, [runId+itemId], itemId',
})
```

- [ ] **Step 4:** Update Task 1's `schemaVersion` assertion to 4.
- [ ] **Step 5: Verify and commit** — `feat(schema): v4 adds the trolley, and rewrites nothing`

---

## Task 11: The trolley repository, and the ledger gains the trolley

Spec §6.5, and the gap `known-gaps.md` has held since Phase 2. **Depends on
D11.**

**Files:**
- Create: `src/data/repositories/trolley.ts`, `…/trolley.test.ts`
- Modify: `src/domain/storeroom.ts`, `src/domain/storeroom.test.ts`,
  `src/ui/storeroom/useStoreroom.ts`

- [ ] **Step 1: `storeroomMovements` — failing tests first**

```ts
export interface Movement { units: number; at: number }

export function storeroomMovements(
  adjustments: Adjustment[],
  trolleyLines: TrolleyLine[],
): Movement[]

export function ledgerBalance(
  anchor: StoreroomBalance | undefined,
  movements: Movement[],
): number
```

```ts
it('gives the same answer as before when there is no trolley', () => {
  // Every historical run must be unchanged. This is the regression guard.
})

it('takes the load off the balance and puts the return back on', () => { … })

it('leaves an unreturned trolley line off the balance', () => {
  // `returned` is undefined until the run closes: the units are on the trolley,
  // not on the shelf, and not back in the storeroom either.
})

it('still excludes a miscount', () => {
  // The invariant Phase 2's 99e7a91 fixed. It has ONE owner and keeps it.
})
```

**`ledgerBalance` keeps its arithmetic exactly as it is** — the anchor, the
`> verifiedAt` filter, the floor at zero. Only its input type changes, from
`Adjustment[]` to `Movement[]`. The `entersResidual` filter moves into
`storeroomMovements`, where the adjustment side is normalised.

- [ ] **Step 2: `None left in G` — the interaction test**

```ts
it('leaves the balance at zero, not at minus what was taken', async () => {
  await setStoreroomBalance('coke', 40)
  await recordTrolleyLoad({ runId, itemId: 'coke', needed: 18, taken: 6, noneLeftInG: true })
  expect(await balanceOf('coke')).toBe(0)
})

it('and a delivery that afternoon takes it to the delivered figure', async () => {
  // …then a delivery of 24
  expect(await balanceOf('coke')).toBe(24)     // not 24 − 6
})
```

Design §3.6: the flag writes `StoreroomBalance { units: 0, verifiedAt: loadedAt }`
— an ordinary manual count of zero — and `ledgerBalance` excludes movements at
exactly `verifiedAt`, so the same instant's `−taken` is correctly not applied.
**The second test is the one that matters**: without it, `−taken` clamped to
zero gives the same answer as the correct behaviour, and the two only diverge
when the next delivery arrives.

- [ ] **Step 3: The repository**

```ts
export function trolleyForRun(runId: Id): Promise<TrolleyLine[]>
export async function recordTrolleyLoad(draft): Promise<TrolleyLine>   // upsert on [runId+itemId]
export async function recordTrolleyReturn(runId, itemId, returned): Promise<TrolleyLine>
export function listTrolleyLines(): Promise<TrolleyLine[]>
```

`recordTrolleyLoad` writes the trolley row and, when `noneLeftInG` is set, the
zero anchor — **in one Dexie transaction**, following `recordTransfer`'s
pattern. Either both land or neither does; a trolley row claiming an empty shelf
with the old balance still standing is worse than no row.

- [ ] **Step 4: Verify and commit** — `feat(storeroom): the ledger's largest movement source arrives`

---

## Task 12: The forecast repository — reading enough history

The only place that knows how far back the rate looks. **Depends on D13.**

**Files:**
- Create: `src/data/repositories/forecast.ts`, `…/forecast.test.ts`
- Modify: `src/data/repositories/visits.ts` (comment only)

```ts
/** Twelve finalized visits per machine — about six weeks at a Tue/Fri cadence,
 * bounding eleven candidate periods in which to find four usable ones.
 *
 * `HISTORY_LIMIT = 4` in visits.ts carries a comment saying four is "the window
 * Phase 3's demand rate needs". It is off by one before censoring is counted at
 * all: four visits bound THREE periods. That comment is corrected rather than
 * the constant changed — HISTORY_LIMIT's real job is the counting screen's
 * carry-forward, which is unaffected. */
export const RATE_SEARCH_VISITS = 12

export interface ForecastRow extends SlotNeed {
  rateDetail: DemandRate
  itemIds: Id[]
}

export function forecastForRun(plannedDate: string): Promise<ForecastRow[]>
```

- [ ] **Step 1: Failing tests**

```ts
it('finds four usable periods past several censored ones', () => { … })

it('measures days since THIS machine\'s last visit, not since the last run', async () => {
  // L7 counted last Friday, L8 skipped and last counted the Friday before.
  // L8's daysSince must be the longer one — it has been drawing down twice as
  // long, and skipped machines are the ones most likely to be empty.
})

it('gives a machine that has never been counted the no-rate fallback', () => { … })

it('reads no more than RATE_SEARCH_VISITS visits per machine', () => { … })
```

- [ ] **Step 2: Implement.** Per machine: read the last `RATE_SEARCH_VISITS`
  finalized visits, pair them into periods the way `salesForRange` does, run
  `salesForPeriod` → `slotPeriods` → `demandRate`, then `slotNeed` with
  `daysSince = daysBetween(lastVisitRunDate, plannedDate)`.

  Fifteen machines × twelve visits × ~54 slots is a few thousand rows read once
  at G. This runs on the load screen, which spec §7 calls "unhurried desk work",
  never during the walk.

- [ ] **Step 3: Verify and commit** — `feat(forecast): assemble the rate from enough history to find four clean periods`

---

## Task 13: The load trolley screen

Design §12.1. **Depends on D4, D11, D12.**

**Files:**
- Create: `src/ui/components/QuantityField.tsx`, `src/ui/trolley/TrolleyScreen.tsx`,
  `src/ui/trolley/useTrolley.ts`, and tests for each
- Modify: `src/ui/App.tsx`, `src/ui/machines/MachineListScreen.tsx`,
  `src/ui/storeroom/StoreroomScreen.tsx`

- [ ] **Step 1: Lift `QuantityField` out of `StoreroomScreen`**

It is currently module-local there. Move it to `src/ui/components/`, unchanged
in behaviour: one units field at `boxSize <= 1`, two fields with `×{boxSize} +`
above it, writing units either way through `fromBoxesAndLoose`. The storeroom's
existing tests must keep passing untouched — that is how you know the move was a
move.

- [ ] **Step 2: The screen**

`App.tsx`'s `Screen` union gains `{ name: 'trolley'; runId: Id; mode: 'load' |
'return' }`; the active tab derives to `'machines'` exactly as `count` and
`machine-map` already do. **No fifth nav item.**

Layout, per design §12.1 and the tokens:

```
grid-template-columns: 1fr 56px 96px 44px;   /* ITEM  NEED  TAKEN  NONE */
```

- Ink header row, 9.5px/700 uppercase, sticky under the tab bar.
- Item name 13.5px/600; beneath it at 11px/500 `neutral-700` **the workings**:
  `5 slots · 1.4/day · 3 days · 1 box + 6`. This line is the explainability
  requirement — every figure on the row derives from something printed beside
  it.
- `NEED` 19px/800 tabular. `TAKEN` is `QuantityField`, defaulting to the need
  rounded up to whole boxes where a carton size is known (D12).
- `NONE` is a toggle, **ink** fill when on (a selected state is ink, not accent
  — interface refinement §7's ruling 6). The row takes the 4px accent inset,
  the app's only edge mark.
- A `surface` section bar at the foot: `NOTHING EXPECTED`, listing the quiet
  slots from `PickList.quiet` at 12.5px/500 `neutral-700` (design §4.4).
- Footer, `border-top: 2px rule-strong`: `Take the trolley up` (accent fill,
  ground text — the screen's one accent) and `Back` (ground, `neutral-700`).
  Both flush left.

- [ ] **Step 3: Tests**

```ts
it('shows the need with the workings that produced it', () => { … })
it('defaults Taken to whole boxes where a carton size is known', () => { … })
it('writes the load, and the none-left flag re-anchors the balance at zero', () => { … })
it('degrades to a single units field for a loose sundry', () => { … })
it('offers Load trolley on the machines footer before anything is counted', () => { … })
```

- [ ] **Step 4: Verify and commit** — `feat(trolley): the pick list, and loading it at G`

---

## Task 14: Allocation and the cut line

Design §12.2. **Depends on D5.**

**Files:**
- Create: `src/ui/trolley/AllocationSection.tsx` and its test
- Modify: `src/ui/trolley/TrolleyScreen.tsx`

- [ ] **Step 1: The shortfall band.** `accent-200` fill, `accent-800` text,
  above the footer, only when some item's `taken` is short of `needed`:
  *"3 items short — 11 slots go without. **See who.**"*

- [ ] **Step 2: The section**, expanded from that band, separated by 2px
  `rule-strong`:

```
grid-template-columns: 30px 26px 1fr 44px;   /* LV  SL  ITEM  UNITS */
```

Served slots in rank order; a `surface` bar carrying
`CUT LINE · NOTHING BELOW IS COVERED` at 9.5px/700 uppercase; unserved slots on
a `neutral-100` fill with `0` in the units column. **Not greyed out** — 45%
opacity is the disabled state for controls, and these rows are information the
operator needs to read.

- [ ] **Step 3: Tests**

```ts
it('stays hidden when everything is covered', () => { … })
it('draws the cut line where the trolley runs out', () => { … })
it('puts a slot that ran dry above a slot with a higher rate', () => { … })
```

- [ ] **Step 4: Verify and commit** — `feat(trolley): who goes short, and where the line falls`

---

## Task 15: The trolley watch on the count screen

Spec §6.3, design §12.3.

**Files:**
- Modify: `src/ui/run/CountScreen.tsx`, `src/ui/run/useCounting.ts` (read only)
- Test: `src/ui/run/CountScreen.test.tsx`

- [ ] **Step 1: The line.** `surface` fill, `accent-700` text at 11px/500,
  directly beneath the sticky column header, rendered only when a shortfall is
  predicted:

  > `Coke runs out at L11 · 6 left`

  **Not an accent fill.** The count screen's colour budget is spent on
  `Finish machine`, and a red band above a 54-row table is the noise the
  interface refinement removed once already (its §3.5).

- [ ] **Step 2: Nothing else on the counting path changes.** No new taps, no new
  fields, and — this is the constraint that matters — **no queries during the
  walk**. Spec §8.1: "A run's full working set loads into memory at run start.
  There are no queries at all during counting." The watch's inputs are the
  trolley lines for the run and the count lines already in memory; load the
  trolley lines once when the screen mounts and recompute in memory on every
  keystroke.

- [ ] **Step 3: Tests**

```ts
it('says nothing when there is enough for the machines ahead', () => { … })
it('names the level once the projection runs short', () => { … })
it('goes quiet again when a machine turns out fuller than projected', () => { … })
it('issues no query while counting', () => { … })   // spy on the repository
```

- [ ] **Step 4: Verify and commit** — `feat(run): name the level an item runs out at, while there is still a decision`

---

## Task 16: Return leftovers

Spec §7 step 5, design §11. **Depends on D6.**

**Files:**
- Modify: `src/ui/trolley/TrolleyScreen.tsx`, `src/ui/trolley/useTrolley.ts`,
  `src/ui/machines/MachineListScreen.tsx`

- [ ] **Step 1: Return mode.** The same screen, header eyebrow
  `RETURNING · FRI 4 SEP`, columns `ITEM · TROLLEY SAYS · YOU FOUND`. The
  machines footer offers `Return leftovers` once every machine that is going to
  be counted has been.

- [ ] **Step 2: The reconciliation.** `TROLLEY SAYS` is `trolleyRemaining`;
  `YOU FOUND` is a `QuantityField`. A difference renders in `accent-700` and
  offers **one** action: log it as `missing` at the storeroom, through the
  existing adjustment sheet.

  **The app never writes the difference silently.** An unexplained difference is
  information, and hiding it inside a balance is how a ledger stops being
  trusted. This is also the only check on the machine counts that does not need
  a second walk.

- [ ] **Step 3: Tests**

```ts
it('predicts what should be left from taken minus what went into machines', () => { … })
it('puts the returned units back on the storeroom balance', () => { … })
it('shows a difference and offers to log it, but never logs it on its own', () => { … })
```

- [ ] **Step 4: Verify and commit** — `feat(trolley): count what comes back down, and say what does not add up`

---

## Task 17: The order suggestion, and the `Order` column

Spec §6.4, design §12.4. **Depends on D2, D7.**

**Files:**
- Create: `src/ui/report/OrderSection.tsx` and its test
- Modify: `src/ui/report/ReportScreen.tsx`, `src/ui/report/StockMatrix.tsx`,
  `src/ui/report/useReport.ts`, `src/ui/report/StockMatrix.test.tsx`

- [ ] **Step 1: `StockMatrix` gains one optional prop.**

```ts
export function StockMatrix({ rows, machines, orderByItem }: {
  rows: MatrixRow[]; machines: Machine[]; orderByItem?: Map<Id, string>
})
```

Absent, it renders the blank tinted cell exactly as today. Present, it prints
the figure. The accent header and `accent-100` fill stay — the column is still
visually the operator's.

**Three existing tests assert the column is blank**
(`StockMatrix.test.tsx:61-65`, `:145-150`, `:161-163`). Update them to assert
the blank case *when `orderByItem` is absent* and the filled case when it is
present. Do not delete them: "blank for the pen" is still a supported state
(D7's toggle) and must keep being covered.

- [ ] **Step 2: The `Order` section** below the sales lines on the report:

- **Horizon** and **Safety** as two figure cells on 2px ink underlines — the
  same pattern `From` / `To` already uses, 15px/700 tabular, no boxes.
  Persisted in `localStorage`, not in Dexie: they are a preference, not a
  record, and they are not worth a table or a migration.
- The table, ink header:
  `grid-template-columns: 1fr 44px 44px 54px;  /* ITEM  /DAY  ON HAND  ORDER */`
- `ORDER` reads `2 × 24` at a real carton size, plain units at `boxSize: 1`.
- A row for an item that ran dry, was flagged `None left in G`, or had an
  unfulfillable need carries the 4px accent inset (spec §6.4's highlighting).
- The legend in `StockMatrix` changes from *"Order stays blank for your pen
  until Phase 3 fills it"* to what it now does.

- [ ] **Step 3: Tests**

```ts
it('fills the Order column from the suggestion', () => { … })
it('still renders it blank when the operator turns the suggestion off', () => { … })
it('reads in boxes at a real carton size and in units at box size 1', () => { … })
it('marks an item that ran dry or ran out at G', () => { … })
it('re-computes when the horizon changes', () => { … })
```

- [ ] **Step 4: Verify and commit** — `feat(report): fill the Order column the paper sheet left blank`

---

## Task 18: Retire `miscount`; withhold `transfer` during an open visit

The two `known-gaps.md` questions deferred to this phase that are settled by a
behaviour change. Design §4.1 and §4.2. **Depends on D8, D9.**

**Files:**
- Modify: `src/domain/adjustments.ts`, `src/ui/adjustments/AdjustmentSheet.tsx`,
  `src/ui/run/SlotEditSheet.tsx`, `src/ui/storeroom/StoreroomScreen.tsx`
- Test: the corresponding test files

- [ ] **Step 1: `offered` on `ReasonSpec`**

```ts
{
  reason: 'miscount',
  label: 'Miscount correction',
  totalStock: 'unchanged',
  entersResidual: false,
  // Retired as an operator-facing reason (Phase 3 design §4.1). It could
  // change nothing anything reads: the residual reads CountLine, and an
  // Adjustment cannot alter one. The correct fix already exists and is better
  // — spec §7 as amended makes a finalized visit editable, so a wrong count is
  // fixed by typing the right number, and the storeroom's manual count
  // re-anchors the ledger. The ROW stays so `reasonSpec('miscount')` keeps
  // working for rows already on disk, which must keep being excluded from the
  // residual.
  offered: false,
}
```

The sheet filters on `offered`. The `needsDirection` correction-direction
control goes with it — `miscount` was the only reason it applied to — along
with its tests.

- [ ] **Step 2: Withhold `transfer` at a slot during an open visit**

`SlotEditSheet` already knows the machine. Pass whether that machine has a
`draft` visit in today's run, and filter `transfer` out of the slot's reason
list while it does. Outside that window — between visits, or after the machine
is finished — `transfer` stays available, because that is what it is for.

The existing on-screen warning stays for the finished-machine case, where the
operator can still get it wrong and no rule can tell:

> Only for stock moved between visits. If you moved it during this run, the two
> refilled-to counts already record it — logging it here as well subtracts it
> twice.

- [ ] **Step 3: Tests**

```ts
it('offers no miscount tile anywhere', () => { … })
it('keeps excluding a miscount row already on disk from the residual', () => { … })
it('withholds transfer at a slot while that machine\'s visit is open', () => { … })
it('offers transfer at a slot once the machine is finished', () => { … })
it('offers transfer at a slot with no visit in today\'s run', () => { … })
```

- [ ] **Step 4: Verify and commit** — `fix(adjustments): retire miscount, and close the redistribution trap while it is open`

---

## Task 19: Reorderable `accepts` (optional — D10)

**Skip this task entirely if the operator answers no to D10.**

One control fixes two separate recorded costs: Fill topping up the item being
drained during a changeover (`known-gaps.md`), and the order forecast
attributing a slot to the outgoing item (design §3.8). Both are the same root
cause — `SlotConfig.accepts` can only be reordered by removing and re-adding.

**Files:**
- Modify: `src/ui/run/SlotEditSheet.tsx`
- Test: `src/ui/run/SlotEditSheet.test.tsx`

- [ ] **Step 1:** In the sheet's **In this slot** block, add `MAKE FIRST` at
  10.5px/700 uppercase `neutral-700` on every item that is not already first.
  Writes through the existing `setSlotConfig(machineId, slotNumber, { accepts })`
  — no new repository, no schema change.

- [ ] **Step 2:** Replace the changeover helper line with what it can now say:

  > Two items means a changeover. Fill tops up whichever is first, and the order
  > suggestion counts this slot towards it. Make the incoming line first.

- [ ] **Step 3: Tests** — reordering persists; Fill then targets the new first
  item; the order forecast follows.

- [ ] **Step 4: Verify and commit** — `feat(run): make the incoming line first, and Fill follows`

---

## Task 20: Documentation

**Files:**
- Modify: `docs/known-gaps.md`
- Create: `docs/phase-3-report.md`, and a handover

- [ ] **Step 1: `known-gaps.md`.** Per design §17 — close the `miscount` bullet,
  close the redistribution bullet for the case a rule prevents, finalise the
  `setAfter`/`touched` bullet, close the "ledger carries no trolley movements"
  bullet, and add:
  - `touched` is untrustworthy on or before 2026-09-04 and has no consumer
    outside `src/ui/run/`.
  - Schema v4 is a one-way door for the bundle, as v2 and v3 were.
  - The order suggestion does not know what has already been ordered.
  - Import is not built; the export bundle is readable JSON and recovery is a
    hand operation.

- [ ] **Step 2: `docs/phase-3-report.md`**, following `phase-2-report.md`:
  what shipped, the decisions and their costs, **the bugs this plan's own
  pseudocode contained that were caught in review**, what was verified in a real
  browser, and what was not done.

  That third section is the most useful part of the Phase 2 report and should be
  written as the work happens, not reconstructed at the end.

- [ ] **Step 3: The handover.** It must **replace** the "rollback is safe" line
  the last two handovers carried, in the operator's own terms:

  > Export a backup before you open this build. The schema moved, and once it
  > has moved, the previous build cannot open your data — nothing is lost, but
  > you would be stuck on the new one until I gave you a build that could read
  > it back. The export takes one tap on the storeroom screen.

- [ ] **Step 4: Commit** — `docs: phase 3 report, handover, and the gaps it closes`

---

## Task order and why

Tasks 2–9 are pure domain and land first, matching how Phases 1 and 2 were
built: everything that can be *wrong* — the rate, the projection, the
allocation, what money gets spent on — is a pure function over plain data,
tested with no database and no browser, before a single screen exists. Spec §8.3
is explicit that this is the point of the boundary.

Task 1 is the exception and jumps the queue for one reason: it is the only thing
that makes Task 10's migration reversible, and Task 10 must not ship without it.

Tasks 10–12 wire the domain to Dexie. Tasks 13–17 are the screens, in the order
the operator meets them: load the trolley, see who goes short, watch it during
the walk, bring it back down, order more. Task 18 settles the two inherited
questions that are behaviour changes rather than calculations; it is late
because it touches screens that Tasks 13–17 are already changing. Task 19 is
optional. Task 20 is the record.

Tasks 1–9 can be reviewed and merged before any screen exists, and the app keeps
working the whole time — the domain functions have no callers until Task 12.
