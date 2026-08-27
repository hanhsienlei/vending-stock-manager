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

1. ~~**The transcription's `size` column is not persisted.** `Item` has no
   size field (spec §4.1: name, price, photo, box size, base par — not
   product size), and folding size into `name` (e.g. "Sunkist (375ml)")
   would break exact-name matching that the transcription's own resolutions
   rely on ("slot 52 has Sunkist and Fanta") and that the operator will use
   to find and rename the placeholder items. Size was read from the
   transcription while writing the data module but deliberately dropped,
   not carried forward. Flagging this explicitly in case it should instead
   become a real field later — nothing here blocks that.~~ **Superseded** by
   the `size` addendum below (commit `a4e10fa`): `Item.size?: string` was
   added the same way `remark` was, and all 60 `STARTER_ITEMS` entries now
   carry it verbatim from the transcription. The exact-name concern raised
   here was about folding size into `name`, not about a dedicated field —
   the addendum doesn't touch `name`, so it stands without contradiction.
   Left struck through rather than deleted so the reasoning that led to the
   addendum stays visible.
2. **Duplicate-slot products collapse to one item with two slots**, not two
   items. Nu Pure Water Bottles appears at both 48 and 49 with identical
   name/size/price; Coke No Sugar at 56 and 57; Coke at 58 and 59. Treating
   each as one item occupying `slots: [48, 49]` (etc.) rather than two
   separate items is what makes the total come out to exactly 60. The
   transcription table has **55 rows** across the six trays (5 + 10 + 10 +
   10 + 10 + 10, one row per slot number 10–14/20–69), of which 7 rows are
   marked `MIXED` and expand to 2 or 3 named items apiece (6 rows -> 2 each
   = 12, plus 1 row -> 3, replacing 7 rows with 15 names): 55 − 7 + 15 = 63
   named items. 3 of those 63 are the duplicate-slot products above,
   collapsed to 1 item each: 63 − 3 = **60**. (An earlier version of this
   note said "65 rows... minus three duplicate rows" — that arithmetic was
   wrong even though the resulting count of 60 happened to be right; this
   replaces it rather than leaving bad working next to a correct answer.)
   This matches how the existing app already models a product ("Coke is at
   58, 59" is used verbatim as the example in `ItemEditScreen.tsx`'s
   comments).
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

---

# Addendum 2 — review fixes (2026-08-27)

Five defects came back from review of the seed work: three in the safety
mechanism (one critical: the empty-catalogue gate was not atomic), one
missing test class, and one test-naming collision. All five are fixed here.
Scope: `src/**` plus this file and `docs/known-gaps.md`. No
`tsconfig.json`, `package.json`, `vite.config.ts`, or Dexie schema-version
changes.

## What changed

### 1–3 (critical/important) — the gate is now one atomic transaction

`seedStarterCatalogue` (`src/data/repositories/seed.ts`) now wraps the
emptiness check *and* every write in a single
`db.transaction('rw', db.items, db.machines, db.placements, async () => …)`:

- **Not atomic (defect #1).** Two overlapping calls — a double-tap on a
  button left enabled through ~135 writes — both used to read an empty
  catalogue and both proceed. Fixed by moving the `listItems()` check
  inside the transaction: IndexedDB serializes two `readwrite` transactions
  that touch the same object stores, so the second call's transaction does
  not even start running its body until the first has committed. By then
  the catalogue is non-empty and the second call's check correctly returns
  `false`.
- **Gate ignored machines (defect #2).** The check now reads
  `listMachines()` as well as `listItems()` and refuses to seed if *either*
  is non-empty. `App.tsx` opens on the Machines screen and invites adding
  one before Items is ever visited; a machine added by hand is now enough
  to block the seed, rather than getting a silent duplicate level.
- **Partial failure locked the gate forever (defect #3).** Previously three
  separate `Promise.all` batches, each in its own implicit transaction — a
  crash between batches left items with no placements, and because items
  then existed, the gate returned `false` for good with no in-app recovery.
  One transaction means any failure partway rolls back every write in the
  batch: items, machines, and any placements already written all revert
  together, so `listItems()`/`listMachines()` read empty again afterwards
  and a retry can succeed cleanly.

`saveItem`, `saveMachine`, and `setPlacement` are all still called as-is —
none of this reaches past the repositories into raw table calls. This
works because Dexie reuses the currently-active transaction for any table
operation performed inside its scope, including `setPlacement`'s own
nested `db.transaction('rw', db.placements, …)`: since `placements` is
already part of the outer transaction's table set, the nested call joins
it rather than opening a second one. **Verified, not assumed**: the
rollback test below forces a write to fail on the 30th `db.placements.put`
call (by spying on the raw Dexie table method, restored afterwards) and
asserts that every item and machine written earlier in the same batch is
gone too — that only holds if the nesting is real. It is; the test passes.

**Belt-and-braces**, per the review: `ItemListScreen` (`src/ui/items/ItemListScreen.tsx`)
now tracks a `busy` boolean, set before `seedStarterCatalogue()` is called
and cleared in a `finally`. The button is `disabled` while `busy` and its
label reads "Loading…". The transaction is the real fix — this only
shortens the window in which a second tap could even be dispatched.

### 4 (important) — table-driven price/size/slot regression test

Added a new `describe` block to `src/data/starterCatalogue.test.ts`:
a 63-row table (`{ slot, name, size, price }`), one row per slot/item pair
— 60 items, 3 of which occupy two slots each (Nu Pure Water Bottles at
48/49, Coke No Sugar at 56/57, Coke at 58/59) — typed independently from
`docs/catalogue-transcription.md` rather than derived from `STARTER_ITEMS`,
run through `it.each`. Each row looks up the matching `STARTER_ITEMS` entry
by `name` *and* slot membership (not by array index, so a row moved to the
wrong position in `STARTER_ITEMS` would still be checked against the right
expectation) and asserts `size` and `price` both match.

**Mutation-tested, not just written**: temporarily changed Coopers XPA's
price in `starterCatalogue.ts` from `10` to `8` (the exact transposition
example from the review) and reran — the new test failed with
`expected 8 to be 10`, all 69 other rows still passed. Reverted immediately
after (`git status` confirmed no diff left behind). This confirms the test
actually catches the regression class it's meant to catch, not just that it
runs.

### 5 (minor) — duplicate test name

`src/ui/items/ItemEditScreen.test.tsx`: the two identically-named
`it('is not required and an item without one still saves')` tests (one for
`remark`, one for `size`) are now `'remark is not required and an item
without one still saves'` and `'size is not required and an item without
one still saves'`.

## Report corrections

- The "Part 2 — Judgement calls" section's item #1 (size not persisted) is
  struck through in place, with a note that it was superseded by the `size`
  addendum (commit `a4e10fa`), rather than silently left to contradict the
  addendum below it.
- Item #2's arithmetic ("the transcription table has 65 rows... minus these
  three duplicate rows") was wrong; replaced with the correct working: 55
  rows (one per physical slot, 10–14/20–69) → 63 named items after 7 `MIXED`
  rows expand to 15 names → 60 items after collapsing the 3 duplicate-slot
  products. The answer (60) was always right; only the working was wrong.

## `docs/known-gaps.md`

Added a line under "Smaller items" recording that `Item.remark` and
`Item.size` are additions beyond spec §4.1 (which lists name, price,
photo, box size, base par — not a remark or a size field), and that
`remark` is specifically **not** the spec's unbuilt `Note` entity (§4.1:
time-stamped, photo/video, attachable to a machine or machine+item pair) —
so a future reader implementing `Note` doesn't treat `remark` as a partial
version of it or vice versa.

## TDD evidence

All commands run with plain `npm test` / `npx vitest run <path>` — no
`--exclude` flag needed; the stale worktree noted in the original report is
gone (`git worktree list` now shows only `main`), and `npm test` collects
exactly the project's own suite.

### RED — defects #1–#3 (`seed.test.ts`)

Three tests added against the not-yet-fixed `seed.ts` (three separate
transactions, items-only gate):

```
$ npx vitest run src/data/repositories/seed.test.ts
 × seedStarterCatalogue > is safe against two overlapping calls: only one full seed ever lands
   → expected [ true, true ] to deeply equal [ false, true ]
 × seedStarterCatalogue > does not reseed when a machine already exists, even with an empty catalogue
   → expected true to be false
 × seedStarterCatalogue > rolls back the whole seed if a write partway through fails, and the gate is not left stuck
   → expected [...] to have a length of +0 but got 60

 Test Files  1 failed (1)
      Tests  3 failed | 6 passed (9)
```

### GREEN — defects #1–#3

After wrapping `seedStarterCatalogue` in one `db.transaction`:

```
$ npx vitest run src/data/repositories/seed.test.ts
 ✓ src/data/repositories/seed.test.ts (9 tests) 108ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

### RED — belt-and-braces `busy` state (`ItemListScreen.test.tsx`)

Added a test that spies on `seedStarterCatalogue` (via `vi.spyOn` on the
real module — not `vi.mock`, so every other test in the file still exercises
real seeding) and holds its promise open, against the not-yet-changed
`ItemListScreen`:

```
$ npx vitest run src/ui/items/ItemListScreen.test.tsx -t "disables the button"
 × ItemListScreen > disables the button the instant it is tapped, before the write settles
   → expect(element).toBeDisabled()
   Received element is not disabled

 Tests  1 failed | 7 skipped (8)
```

### GREEN — belt-and-braces `busy` state

After adding the `busy` state and `disabled={busy}` to the button:

```
$ npx vitest run src/ui/items/ItemListScreen.test.tsx
 ✓ src/ui/items/ItemListScreen.test.tsx (8 tests) 148ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

### Defect #4 — table-driven test (verification + mutation check, not RED/GREEN)

This is a pure data-verification test, not implementation-driving, so there
is no meaningful RED state against unfinished code — the data it checks
(`STARTER_ITEMS`) was already complete and, per the original review, correct.
Instead it was mutation-tested directly against the transcription's own
transposition example:

```
$ npx vitest run src/data/starterCatalogue.test.ts   # baseline, price correct
 ✓ src/data/starterCatalogue.test.ts (70 tests) 5ms

# Coopers XPA price changed 10 -> 8 in starterCatalogue.ts
$ npx vitest run src/data/starterCatalogue.test.ts
 × every slot/item pair against the transcription, table-driven > slot 51 — 'Coopers XPA'
   → expected 8 to be 10
 Tests  1 failed | 69 passed (70)

# reverted; git status confirmed clean
$ npx vitest run src/data/starterCatalogue.test.ts
 ✓ src/data/starterCatalogue.test.ts (70 tests) 5ms
```

### Defect #5 — renamed tests

No RED/GREEN — a pure rename, verified only by the full suite below still
passing with distinct test names (checked via `grep -n` that the duplicate
string no longer appears twice in the file).

## Full suite and build

```
$ npm test
 ✓ src/data/starterCatalogue.test.ts (70 tests)
 ✓ src/domain/placement.test.ts (12 tests)
 ✓ src/data/repositories/repositories.test.ts (10 tests)
 ✓ src/data/repositories/visits.test.ts (16 tests)
 ✓ src/domain/trays.test.ts (12 tests)
 ✓ src/ui/items/ItemListScreen.test.tsx (8 tests)
 ✓ src/domain/levels.test.ts (5 tests)
 ✓ src/domain/fill.test.ts (8 tests)
 ✓ src/ui/run/SlotEditSheet.test.tsx (5 tests)
 ✓ src/ui/run/CountScreen.test.tsx (8 tests)
 ✓ src/data/repositories/seed.test.ts (9 tests)
 ✓ src/ui/App.e2e.test.tsx (1 test)
 ✓ src/domain/purity.test.ts (1 test)
 ✓ src/domain/ids.test.ts (3 tests)
 ✓ src/ui/useMachineMap.test.tsx (2 tests)
 ✓ src/ui/items/ItemEditScreen.test.tsx (13 tests)
 ✓ src/ui/run/useCounting.test.tsx (22 tests)

 Test Files  17 passed (17)
      Tests  205 passed (205)
```

205 = 137 baseline (post-`size`-addendum) + 68 new: 61 new rows in
`starterCatalogue.test.ts` (63 `it.each` rows + 1 count assertion, net +1
since one prior "carries size" style test already existed... precisely:
70 − 6 = 64 net-new in that file), 4 new in `seed.test.ts` (9 − 5), 1 new in
`ItemListScreen.test.tsx` (8 − 7 remark/size tests already counted). Checked
for clean output with `grep -i -E "act\(|warning|unhandled"` against the
captured full run — no matches (`exit=1`, i.e. no lines matched).

```
$ npm run build
> tsc --noEmit && vite build
✓ 58 modules transformed.
✓ built in 552ms
PWA v0.21.2 — precache 5 entries (323.83 KiB)
```

Clean, no type errors.

## Files changed (this round)

- `src/data/repositories/seed.ts` — atomic transaction, machines-aware gate
- `src/data/repositories/seed.test.ts` — 3 new tests (concurrent calls,
  machine-only guard, rollback + retry)
- `src/ui/items/ItemListScreen.tsx` — `busy` state, disabled button
- `src/ui/items/ItemListScreen.test.tsx` — 1 new test (disables on tap)
- `src/data/starterCatalogue.test.ts` — 63-row table-driven test
- `src/ui/items/ItemEditScreen.test.tsx` — renamed two colliding test names
- `docs/seed-report.md` — this addendum, plus corrections to the Part 2
  judgement calls
- `docs/known-gaps.md` — `remark`/`size` vs. spec §4.1 and the `Note` entity

Not touched: `tsconfig.json`, `package.json`, `vite.config.ts`,
`src/data/db.ts`.
