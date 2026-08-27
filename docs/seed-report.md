# Seed report — `remark` field and starter catalogue seed

Date: 2026-08-27
Branch: `main` (worked directly on `main`, two commits)

## What was built

### Part 1 — `remark` on `Item`

- `Item.remark?: string` added to `src/domain/types.ts`. Optional, no schema
  migration (Dexie's `db.version(1).stores(...)` in `src/data/db.ts` is
  untouched — it only indexes declared keys, and `remark` isn't one).
- `src/ui/items/ItemEditScreen.tsx`: a plain `Remark` text input, loaded from
  the item on edit, saved only when non-empty (empty input means the saved
  `Item` has no `remark` key at all, not an empty string or `undefined`
  value sitting in storage).
- `src/ui/items/ItemListScreen.tsx`: renders the remark under the price/par/
  box-size line, only when present.
- Kept distinct from the spec's `Note` entity (§4.1) — no time-stamped
  observation, no photo/video, no machine attachment. Just a property on the
  catalogue entry, like name or price.

### Part 2 — starter catalogue seed

- `src/data/starterCatalogue.ts` — a plain, declarative module: `STARTER_ITEMS`
  (60 entries: `name`, `price`, `slots`, optional `remark`) and
  `STARTER_MACHINE_LEVELS` (`[2..16]`). No I/O, no logic beyond the array
  literals. A mixed slot is simply two-plus entries sharing a slot number;
  nothing else marks it as "mixed" — `resolveMachineMap` (existing domain
  code) already groups by slot number at read time.
- `src/data/repositories/seed.ts` — `seedStarterCatalogue()`, the thin
  writer. Guards on `listItems().length > 0` and no-ops (`return false`)
  if the catalogue isn't empty, so a second call — from anywhere in code,
  not just the UI — is safe. Otherwise writes through the existing
  repositories only (`saveItem`, `saveMachine`, `setPlacement`), each set
  batched with `Promise.all` rather than sequential per-item awaits. No
  `pinSlotCapacities` call — every `basePar` is 5, so every slot resolves
  capacity 5 with no `SlotConfig` needed.
- `src/ui/items/ItemListScreen.tsx` — a "Load starter catalogue" button,
  gated on `items.length === 0`. No confirm dialog: the gate condition is
  the same state the button's own visibility depends on, so once any item
  exists the button doesn't render, and once it fires (creating 60 items)
  it removes itself on the next render. No path in the UI can call it twice.

## Judgement calls

1. **The transcription's `size` column is not persisted.** `Item` has no
   size field (spec §4.1: name, price, photo, box size, base par — not
   product size), and folding size into `name` (e.g. "Sunkist (375ml)")
   would break exact-name matching that the transcription's own resolutions
   rely on ("slot 52 has Sunkist and Fanta") and that the operator will use
   to find and rename the placeholder items. Size was read from the
   transcription while writing the data module but deliberately dropped,
   not carried forward. Flagging this explicitly in case it should instead
   become a real field later — nothing here blocks that.
2. **Duplicate-slot products collapse to one item with two slots**, not two
   items. Nu Pure Water Bottles appears at both 48 and 49 with identical
   name/size/price; Coke No Sugar at 56 and 57; Coke at 58 and 59. Treating
   each as one item occupying `slots: [48, 49]` (etc.) rather than two
   separate items is what makes the total come out to exactly 60 — the
   transcription table has 65 rows across the six trays, minus these three
   duplicate rows, plus the mixed-slot items being distinct rows already
   counted individually. This matches how the existing app already models a
   product ("Coke is at 58, 59" is used verbatim as the example in
   `ItemEditScreen.tsx`'s comments).
3. **Machine label**: the transcription only names machines `L2`..`L16` with
   no location text (unlike the `Machine.label` examples elsewhere, e.g.
   "Lift lobby"). Used `Level ${n}` as a plain, correctable placeholder label
   for each seeded machine.
4. **Remark wording** on the four Red Bull/Mother items in slots 44 and 45:
   "Size on the stock sheet looks wrong for this product; not our sheet to
   correct — kept as written and unverified." Paraphrases resolution #3 in
   the transcription doc; wording is mine as instructed.
5. **`boxSize: 1`** for every item, per the brief — not derived, not
   guessed, explicitly the operator's correction task.

## TDD evidence

All commands run with `npx vitest run --exclude '**/.claude/**'`. The
`--exclude` flag is needed because a stale, gitignored git worktree at
`.claude/worktrees/phase-1-record/` (registered via `git worktree list`,
unrelated to this task) carries its own `node_modules` and duplicate test
files; without excluding it, vitest's default test glob picks up both
copies and two React installations end up mounted in one process
(`TypeError: Cannot read properties of null (reading 'useState')`). This is
pre-existing and not something this task touched — flagging it in case it's
worth `git worktree remove`-ing later. Baseline was reconfirmed with the
same exclusion before any changes: 114 tests passing, matching the brief.

### Part 1 — `remark` — RED

Added three tests to `src/ui/items/ItemEditScreen.test.tsx` (not-required
round trip, remark round trip) and created
`src/ui/items/ItemListScreen.test.tsx` (remark rendering) against the
not-yet-changed `Item` type / screens.

```
$ npx vitest run --exclude '**/.claude/**' src/ui/items
...
 FAIL  src/ui/items/ItemEditScreen.test.tsx > ItemEditScreen > is not required and an item without one still saves
 FAIL  src/ui/items/ItemEditScreen.test.tsx > ItemEditScreen > round-trips a remark: saved, then reloaded for editing
 FAIL  src/ui/items/ItemListScreen.test.tsx > ItemListScreen > shows the remark when the item has one
      Tests  3 failed | 10 passed (13)
```

### Part 1 — `remark` — GREEN

After adding `Item.remark`, the `Remark` input to `ItemEditScreen`, and the
conditional remark line in `ItemListScreen`:

```
$ npx vitest run --exclude '**/.claude/**' src/ui/items
 ✓ src/ui/items/ItemListScreen.test.tsx (2 tests) 33ms
 ✓ src/ui/items/ItemEditScreen.test.tsx (11 tests) 804ms

 Test Files  2 passed (2)
      Tests  13 passed (13)
```

Full suite after Part 1: 118 passed (114 baseline + 4 new: 2 ItemEditScreen,
2 ItemListScreen).

### Part 2 — starter catalogue seed — RED

`src/data/repositories/seed.test.ts` written against a not-yet-existing
`./seed` module:

```
$ npx vitest run --exclude '**/.claude/**' src/data/repositories/seed.test.ts
 FAIL  src/data/repositories/seed.test.ts [ src/data/repositories/seed.test.ts ]
Error: Failed to resolve import "./seed" from "src/data/repositories/seed.test.ts". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

`src/ui/items/ItemListScreen.test.tsx` — three new tests (button visible
when empty, hidden once an item exists, seeds + hides on tap) added before
the button existed:

```
$ npx vitest run --exclude '**/.claude/**' src/ui/items/ItemListScreen.test.tsx
 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
```

(The "hides once an item exists" case passed vacuously — the button didn't
exist yet either way — which is expected and was superseded once the real
button existed.)

### Part 2 — starter catalogue seed — GREEN

After `src/data/starterCatalogue.ts`, `src/data/repositories/seed.ts`, and
the `ItemListScreen` button:

```
$ npx vitest run --exclude '**/.claude/**' src/data/repositories/seed.test.ts
 ✓ src/data/repositories/seed.test.ts (5 tests) 94ms
 Test Files  1 passed (1)
      Tests  5 passed (5)

$ npx vitest run --exclude '**/.claude/**' src/ui/items/ItemListScreen.test.tsx
 ✓ src/ui/items/ItemListScreen.test.tsx (5 tests) 153ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

`src/data/starterCatalogue.test.ts` (data-shape assertions: 60 items,
fifteen machine levels, the seven mixed-slot groupings by exact name
including the three-item slot 63, the four remarked items) passed on first
run — it's a pure data module with no branching logic to red/green drive,
so these tests were written as a direct check against the transcription
rather than test-first-driving an implementation:

```
$ npx vitest run --exclude '**/.claude/**' src/data/starterCatalogue.test.ts
 ✓ src/data/starterCatalogue.test.ts (5 tests) 2ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Independently re-verified the transcription mapping outside the test
harness (`tsx` one-off, not committed) against the actual data module:

```
mixed slots: [ 44, 45, 51, 52, 53, 62, 63 ]
total distinct slots: 55
total items: 60
machines: [ 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 ]
```

## Full suite and build

```
$ npx vitest run --exclude '**/.claude/**'
 ✓ src/domain/trays.test.ts (12 tests)
 ✓ src/domain/placement.test.ts (12 tests)
 ✓ src/data/repositories/repositories.test.ts (10 tests)
 ✓ src/data/repositories/visits.test.ts (16 tests)
 ✓ src/domain/levels.test.ts (5 tests)
 ✓ src/domain/fill.test.ts (8 tests)
 ✓ src/ui/items/ItemListScreen.test.tsx (5 tests)
 ✓ src/data/repositories/seed.test.ts (5 tests)
 ✓ src/ui/run/SlotEditSheet.test.tsx (5 tests)
 ✓ src/ui/App.e2e.test.tsx (1 test)
 ✓ src/data/starterCatalogue.test.ts (5 tests)
 ✓ src/ui/run/CountScreen.test.tsx (8 tests)
 ✓ src/domain/purity.test.ts (1 test)
 ✓ src/domain/ids.test.ts (3 tests)
 ✓ src/ui/useMachineMap.test.tsx (2 tests)
 ✓ src/ui/items/ItemEditScreen.test.tsx (11 tests)
 ✓ src/ui/run/useCounting.test.tsx (22 tests)

 Test Files  17 passed (17)
      Tests  131 passed (131)
```

No `act(...)` warnings, no unhandled rejections in the output (checked with
`grep -i -E "act\(|warning|unhandled"` against the captured run — no
matches). 131 = 114 baseline + 4 remark tests + 5 seed-data tests +
5 seed-repository tests + 3 new ItemListScreen tests (2 of the 5
ItemListScreen tests were the pre-existing remark tests from Part 1).

```
$ npm run build
> tsc --noEmit && vite build
✓ 58 modules transformed.
✓ built in 563ms
PWA v0.21.2 — precache 5 entries (322.18 KiB)
```

Clean, no type errors.

## Files changed

Part 1 (commit `7535097`):
- `src/domain/types.ts` — `Item.remark?: string`
- `src/ui/items/ItemEditScreen.tsx`, `src/ui/items/ItemEditScreen.test.tsx`
- `src/ui/items/ItemListScreen.tsx`
- `src/ui/items/ItemListScreen.test.tsx` (new)

Part 2 (this commit):
- `src/data/starterCatalogue.ts` (new) — the data
- `src/data/starterCatalogue.test.ts` (new)
- `src/data/repositories/seed.ts` (new) — the writer
- `src/data/repositories/seed.test.ts` (new)
- `src/ui/items/ItemListScreen.tsx` — button
- `src/ui/items/ItemListScreen.test.tsx` — button tests

## Not touched

`tsconfig.json`, `package.json`, `vite.config.ts`, `src/data/db.ts` schema
version — all untouched, as required. `pinSlotCapacities` is not called
anywhere in the seed path.

---

# Addendum — `size` field (2026-08-27)

Closes judgement call #1 above: the transcription's `Size` column is now
persisted, following the `remark` pattern from commit `7535097` exactly.

## What changed

- `Item.size?: string` added to `src/domain/types.ts`, right next to
  `boxSize`/`remark`. Optional, free text, display-only — nothing computes
  with it. No schema migration: `src/data/db.ts` untouched.
- `src/ui/items/ItemEditScreen.tsx`: a `Size` text input, same shape as
  `Remark` — loaded from the item on edit, saved only when non-empty (empty
  input means no `size` key at all, not `undefined` or `''` in storage).
  Placed above `Remark`, below `Box size`.
- `src/ui/items/ItemListScreen.tsx`: appended to the existing price/par/
  box-size line as `· {size}` when present, rather than a new line — keeps
  that line readable without adding a fourth row per item.
- `src/data/starterCatalogue.ts`: `StarterCatalogueItem.size?: string` added,
  and all 60 entries populated verbatim from the `Size` column of
  `docs/catalogue-transcription.md`, tray by tray. Slots 44 and 45 keep
  `600ml` and `500ml` as written — the colleague's known error for Red Bull,
  not corrected here, per the transcription's own "Resolved" note #3. Both
  already carry the unverified-size `remark` from the earlier seed.
- `src/data/repositories/seed.ts`: `seedStarterCatalogue()` now forwards
  `entry.size` into `saveItem` the same way it forwards `entry.remark`
  (spread-in only when present).

## Judgement calls

1. **Field order in the form**: `Size` placed between `Box size` and
   `Remark` — it reads as a product attribute, closer to box size than to
   the free-text remark.
2. **List placement**: appended to the existing metadata line rather than
   given its own row, per the brief's "keep that line readable" — a short
   size label (`375ml`, `27g`, `ea`) reads naturally as a fourth `·`-joined
   fact alongside price/par/box.
3. **No new remark wording for size itself.** The existing remark on the
   four Red Bull/Mother items (added in the prior seed task) already says
   the size is unverified; adding a second, size-specific remark would
   duplicate that sentence, so the size value is recorded plainly and the
   existing remark carries the caveat.

## TDD evidence

All commands run with `npx vitest run --exclude '**/.claude/**'` (same
exclusion as before, for the same stale-worktree reason recorded above).

### RED

Added tests to `src/ui/items/ItemEditScreen.test.tsx` (not-required save,
round-trip), `src/ui/items/ItemListScreen.test.tsx` (renders size when
present, renders fine with none), `src/data/starterCatalogue.test.ts`
(pins specific sizes including slot 44's `600ml`), and
`src/data/repositories/seed.test.ts` (size persists through the seed) —
all against the not-yet-changed `Item` type, screens, and data.

```
$ npx vitest run --exclude '**/.claude/**' src/ui/items src/data/starterCatalogue.test.ts src/data/repositories/seed.test.ts
 FAIL  src/data/starterCatalogue.test.ts > starter catalogue data > carries the Size column from the transcription verbatim, including the known-wrong 600ml at slot 44
 FAIL  src/data/repositories/seed.test.ts > seedStarterCatalogue > carries the size through to the persisted item
 FAIL  src/ui/items/ItemEditScreen.test.tsx > ItemEditScreen > is not required and an item without one still saves
 FAIL  src/ui/items/ItemEditScreen.test.tsx > ItemEditScreen > round-trips a size: saved, then reloaded for editing
 FAIL  src/ui/items/ItemListScreen.test.tsx > ItemListScreen > shows the size when the item has one
 Test Files  4 failed (4)
      Tests  5 failed | 27 passed (32)
```

### GREEN

After adding `Item.size`, the `Size` input to `ItemEditScreen`, the size
suffix on `ItemListScreen`'s metadata line, the populated `size` field on
all 60 `STARTER_ITEMS` entries, and forwarding `size` through
`seedStarterCatalogue`:

```
$ npx vitest run --exclude '**/.claude/**' src/ui/items src/data/starterCatalogue.test.ts src/data/repositories/seed.test.ts
 ✓ src/data/starterCatalogue.test.ts (6 tests) 2ms
 ✓ src/data/repositories/seed.test.ts (6 tests) 130ms
 ✓ src/ui/items/ItemListScreen.test.tsx (7 tests) 157ms
 ✓ src/ui/items/ItemEditScreen.test.tsx (13 tests) 930ms

 Test Files  4 passed (4)
      Tests  32 passed (32)
```

## Full suite and build

```
$ npx vitest run --exclude '**/.claude/**'
 ✓ src/data/starterCatalogue.test.ts (6 tests)
 ✓ src/domain/placement.test.ts (12 tests)
 ✓ src/data/repositories/repositories.test.ts (10 tests)
 ✓ src/data/repositories/visits.test.ts (16 tests)
 ✓ src/domain/trays.test.ts (12 tests)
 ✓ src/ui/items/ItemListScreen.test.tsx (7 tests)
 ✓ src/domain/levels.test.ts (5 tests)
 ✓ src/domain/fill.test.ts (8 tests)
 ✓ src/ui/run/SlotEditSheet.test.tsx (5 tests)
 ✓ src/data/repositories/seed.test.ts (6 tests)
 ✓ src/ui/run/CountScreen.test.tsx (8 tests)
 ✓ src/ui/App.e2e.test.tsx (1 test)
 ✓ src/domain/purity.test.ts (1 test)
 ✓ src/domain/ids.test.ts (3 tests)
 ✓ src/ui/useMachineMap.test.tsx (2 tests)
 ✓ src/ui/items/ItemEditScreen.test.tsx (13 tests)
 ✓ src/ui/run/useCounting.test.tsx (22 tests)

 Test Files  17 passed (17)
      Tests  137 passed (137)
```

137 = 131 baseline + 6 new (2 `ItemEditScreen` size tests, 2
`ItemListScreen` size tests, 1 `starterCatalogue` size-pinning test, 1
`seed` size-forwarding test). Checked for clean output with
`grep -i -E "act\(|warning|unhandled"` against the full captured run — no
matches.

```
$ npm run build
> tsc --noEmit && vite build
✓ 58 modules transformed.
✓ built in 571ms
PWA v0.21.2 — precache 5 entries (323.50 KiB)
```

Clean, no type errors.

## Files changed (addendum)

- `src/domain/types.ts` — `Item.size?: string`
- `src/ui/items/ItemEditScreen.tsx`, `src/ui/items/ItemEditScreen.test.tsx`
- `src/ui/items/ItemListScreen.tsx`, `src/ui/items/ItemListScreen.test.tsx`
- `src/data/starterCatalogue.ts` — `size` on `StarterCatalogueItem` and all
  60 entries
- `src/data/starterCatalogue.test.ts` — size-pinning test
- `src/data/repositories/seed.ts` — forwards `entry.size`
- `src/data/repositories/seed.test.ts` — size-through-seed test

Not touched: `tsconfig.json`, `package.json`, `vite.config.ts`,
`src/data/db.ts` (confirmed via `git diff --stat -- src/data/db.ts`,
empty).
