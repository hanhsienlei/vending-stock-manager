# Storeroom screen and schema v2 — implementation report

**Date:** 2026-08-27
**Branch:** `main` (no branch protection in this repo; committed directly per the
existing history's pattern)

---

## What was built

### Part 1 — schema version 2 (`src/data/db.ts`)

One additive migration, `db.version(2)`, covering all three changes:

1. **`CountLine.filled: boolean`** — now written by `useCounting` (`src/ui/run/useCounting.ts`)
   from the hook's actual fill-toggle state, and read back on seed instead of
   inferred. The old inference (`after > before`) misclassified a slot filled
   while already at capacity: `after === before` in that case, so the slot came
   back un-toggled after a remount.
2. **`visits` gains a `machineId` index.** `historyForMachine`
   (`src/data/repositories/visits.ts`) now queries
   `db.visits.where('machineId').equals(machineId)` instead of loading the whole
   table and filtering in JS.
3. **New `storeroomBalances` table**, `'id, itemId'`, one row per item:
   `{ id, itemId, units, updatedAt, verifiedAt }` (`StoreroomBalance` in
   `src/domain/types.ts`).

The `.upgrade()` transition (`src/data/db.ts`) derives `filled` for pre-existing
`countLines` rows as `after > before` — the same inference it replaces — and
only when the field is `undefined`, so a row already carrying `filled` is left
alone. This was written and tested against a real v1-shaped database (built with
a separate `Dexie` instance declaring only `version(1)`, populated, closed, then
opened through the real `db` at version 2) rather than assumed to run against an
empty store — there is no production data yet, but the operator may have already
seeded a catalogue and poked at the app in their browser, and the migration must
be correct against that case too.

`ItemPlacement.scope` was **not** touched, per the brief — it's the documented
indexability gap in `docs/known-gaps.md`, out of scope, and changing it would
touch the placement-resolution path, the wrong risk before tomorrow's run.

### Part 2 — Storeroom screen

- `src/data/repositories/storeroom.ts` — `listStoreroomBalances`,
  `getStoreroomBalance`, `setStoreroomBalance(itemId, units)`. Follows the
  existing repository conventions exactly: client-generated UUID, `updatedAt`
  (and `verifiedAt`, stamped identically — every write through this screen *is*
  a verification) on every write, read-then-write inside
  `db.transaction('rw', db.storeroomBalances, …)`, upsert on `itemId`.
- `src/ui/storeroom/useStoreroom.ts` — loads items + balances, keeps local
  `units`/`verifiedAt` maps, `setUnits(itemId, qty)` commits optimistically and
  persists behind it, rolling back both maps on a rejected write. Same shape as
  `useCounting`'s `setBefore`/`toggleFill` — no second persistence pattern
  invented.
- `src/ui/storeroom/StoreroomScreen.tsx` — lists every catalogue item
  alphabetically (via `listItems()`, already ordered by name), each row showing
  name, `size` if set, "Verified …" / "Never verified", and an editable number
  input in plain units. A header shows `N / total counted` (count of items that
  have ever been given a balance row). No Save button.
- `src/ui/App.tsx` — new `storeroom` screen case and a third bottom-nav button
  ("Storeroom") alongside Machines and Items.

**Judgement call:** the brief left the exact widget open ("editable quantity in
plain units"). The rest of the app uses a tap-based `Stepper` for plain-unit
entry, but that component defaults to a per-tap `±1` and is meant for
slot-sized numbers (0–~50 reached mostly via Fill). Storeroom counts run into
the tens or hundreds per item, and 40 taps to enter "40" would be absurd for
someone standing in the storeroom with a real count in hand. Used a plain
`<input type="number">` instead, keeping the *persistence* pattern
(optimistic-commit-then-persist-behind, no Save) identical to `useCounting` as
instructed, while choosing a different *input widget* for a different scale of
number. Each `onChange` persists immediately, same as every tap elsewhere in the
app.

**Judgement call:** "counted" for the `N / total` header is items that have a
`storeroomBalances` row at all (i.e. have been touched on this screen at least
once), not items with `units > 0` — a shelf genuinely counted as empty is still
counted.

---

## TDD evidence

### 1a — `filled` round-trip (RED against current code, before any schema change)

Added a test to `src/ui/run/useCounting.test.tsx` that fills a slot already at
its capacity, remounts, and asserts the fill toggle survives — the exact case
`after > before` cannot distinguish from an untouched slot.

RED:
```
$ npx vitest run src/ui/run/useCounting.test.tsx -t "comes back toggled after remount when filled while already at capacity"
 × useCounting resuming an open draft visit > comes back toggled after remount when filled while already at capacity
   AssertionError: expected false to be true // Object.is equality
    > expect(second.result.current.filled.has(58)).toBe(true)
```

GREEN, after adding `filled` to `CountLine`, writing it from `useCounting`'s
persist/setBefore/toggleFill/finalize paths, and reading `l.filled` (not
`l.after > l.before`) on seed:
```
$ npx vitest run src/ui/run/useCounting.test.tsx
 ✓ src/ui/run/useCounting.test.tsx (23 tests) 2276ms
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

### 1a/1b/1c — schema v2 migration (RED against pre-migration `db.ts`)

New `src/data/db.test.ts`: builds a real version-1-only database (separate
`Dexie` instance, only `.version(1)` declared), seeds it with legacy-shaped
`countLines` rows (one where `after > before`, one where `after === before`,
and one that already carries `filled: false` despite `after > before`, to prove
idempotency), closes it, then opens the app's real `db` and asserts the
upgrade's effect. Also asserts `storeroomBalances` exists and `visits` is
queryable by `machineId`.

RED:
```
$ npx vitest run src/data/db.test.ts
 × derives filled from after > before ... → expected undefined to be true
 × adds the storeroomBalances table       → expected undefined to be defined
 × indexes visits by machineId            → SchemaError: KeyPath machineId on object store visits is not indexed
 Tests  3 failed (3)
```

GREEN, after adding `db.version(2)` with the `.upgrade()`:
```
$ npx vitest run src/data/db.test.ts
 ✓ src/data/db.test.ts (3 tests) 60ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### 1b — `historyForMachine` via the index

This is an internal refactor (JS `.filter()` → indexed `.where().equals()`)
with no new externally observable behaviour, so there was no RED state to
create against it specifically — the existing `visits.test.ts` suite already
specifies "newest-first, bounded to four, finalized-only" and continues to pass
unchanged. Added one further regression test there for a gap the existing suite
didn't cover — cross-machine isolation — which would also fail loudly (a Dexie
`SchemaError`) if the `machineId` index were ever dropped or misspelled:
```
$ npx vitest run src/data/repositories/visits.test.ts
 ✓ src/data/repositories/visits.test.ts (17 tests) 296ms
```

### 1c / Part 2 — storeroom repository (RED, file didn't exist)

Added tests to `src/data/repositories/repositories.test.ts` before writing
`storeroom.ts`:
```
$ npx vitest run src/data/repositories/repositories.test.ts
Error: Failed to resolve import "./storeroom" ... Does the file exist?
 Test Files  1 failed (1)
```
GREEN after implementing `storeroom.ts`:
```
$ npx vitest run src/data/repositories/repositories.test.ts
 ✓ src/data/repositories/repositories.test.ts (13 tests) 60ms
```

### Part 2 — `StoreroomScreen` (RED, file didn't exist)

`src/ui/storeroom/StoreroomScreen.test.tsx`, written before the screen existed:
```
$ npx vitest run src/ui/storeroom/StoreroomScreen.test.tsx
Error: Failed to resolve import "./StoreroomScreen" ... Does the file exist?
 Test Files  1 failed (1)
```
GREEN after implementing `useStoreroom.ts` + `StoreroomScreen.tsx`:
```
$ npx vitest run src/ui/storeroom/StoreroomScreen.test.tsx
 ✓ src/ui/storeroom/StoreroomScreen.test.tsx (6 tests) 153ms
```
Covers: renders every catalogue item, shows size when set, pre-fills last
recorded balance / blank+"never verified" state for an uncounted item, persists
a change with no Save button in sight, upserts in place on repeated edits
(no duplicate row), and shows the live `N / total counted` header.

---

## Full suite and build (final state, after both commits)

```
$ npx vitest run
 Test Files  19 passed (19)
      Tests  219 passed (219)
```
(205 original + 14 new: 3 migration, 1 filled round-trip, 1 cross-machine
history isolation, 3 storeroom-repository, 6 StoreroomScreen.)

Checked explicitly for the two failure modes called out in the brief — none
found:
```
$ grep -in "act(...)\|not wrapped in act\|unhandled" <full test output>
NONE FOUND
```

```
$ npm run build
> tsc --noEmit && vite build
✓ 61 modules transformed.
✓ built in 575ms
PWA v0.21.2 — precache 5 entries (326.72 KiB)
```

---

## Files changed

Part 1 (commit `cc43208`):
- `src/domain/types.ts` — `CountLine.filled`, new `StoreroomBalance`
- `src/data/db.ts` — `db.version(2)` + upgrade
- `src/data/db.test.ts` — new, migration tests
- `src/data/repositories/visits.ts` — `historyForMachine` via `machineId` index
- `src/data/repositories/visits.test.ts` — cross-machine isolation test, `filled` added to `lineFor`
- `src/domain/levels.test.ts` — `filled` added to test fixture
- `src/ui/run/useCounting.ts` — writes/reads `filled` instead of inferring it
- `src/ui/run/useCounting.test.tsx` — new RED/GREEN test + `filled` added to fixtures
- `src/ui/run/CountScreen.test.tsx` — `filled` added to fixtures

Part 2 (commit `e2a5685`):
- `src/data/repositories/storeroom.ts` — new repository
- `src/data/repositories/repositories.test.ts` — storeroom repository tests
- `src/ui/storeroom/useStoreroom.ts` — new hook
- `src/ui/storeroom/StoreroomScreen.tsx` — new screen
- `src/ui/storeroom/StoreroomScreen.test.tsx` — new tests
- `src/ui/App.tsx` — Storeroom nav entry + screen wiring

---

## Addendum — post-review fix: leading-zero input bug (2026-08-27)

Review came back clean on the migration and persistence-pattern questions and
flagged one issue before tonight's run: `StoreroomScreen.tsx`'s quantity input
renders a literal `0` for an uncounted item (`value={units.get(item.id) ?? 0}`),
so the field is never blank. A tap that lands just left of that `0` followed by
a single typed digit appends instead of replacing — typing `4` yields `"40"`,
recording 40 units instead of 4. With ~60 items to key in tomorrow, a mis-tapped
caret on the twentieth row is exactly the kind of thing that happens.

**Fix applied, scoped to `src/ui/storeroom/**` only, no schema or state-shape
change:** added `onFocus={(e) => e.currentTarget.select()}` to the input
(`src/ui/storeroom/StoreroomScreen.tsx`), so the first keystroke after focusing
a row replaces its contents rather than appending to them. This also narrows
the related nuisance the reviewer noted — every keystroke persists and stamps
`verifiedAt`, so fewer intermediate values (e.g. a stray leading zero) get
written and marked freshly verified along the way.

**Test, and which of the two options was used:** added
`'selects the field on focus, so the first keystroke replaces rather than
appends'` to `src/ui/storeroom/StoreroomScreen.test.tsx`. Used the
spy-on-`select()` fallback the reviewer offered, not a real-selection
assertion (`selectionStart`/`selectionEnd`): `type="number"` inputs do not
reliably support the text-selection API across browsers, and jsdom's own
emulation of that restriction made a direct selection-state assertion an
awkward proxy for jsdom's quirks rather than the fix itself. The test spies on
`HTMLInputElement.prototype.select` with a no-op mock implementation (so it
never depends on jsdom actually performing a selection on a number input),
focuses the row's input via `userEvent.click`, and asserts the spy was called.

RED (before adding `onFocus`):
```
$ npx vitest run src/ui/storeroom/StoreroomScreen.test.tsx -t "selects the field on focus"
 × StoreroomScreen > selects the field on focus, so the first keystroke replaces rather than appends
   AssertionError: expected "select" to be called at least once
```

GREEN (after adding the one-line `onFocus` handler):
```
$ npx vitest run src/ui/storeroom/StoreroomScreen.test.tsx
 ✓ src/ui/storeroom/StoreroomScreen.test.tsx (7 tests) 152ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Full suite and build (run from the working tree as it stood after the delete
affordances for items/machines had landed on `main`, which this task did not
touch — hence the suite count above 219):
```
$ npm test
 Test Files  21 passed (21)
      Tests  242 passed (242)

$ npm test 2>&1 | grep -in "act(...)\|not wrapped in act\|unhandled"
NONE FOUND

$ npm run build
> tsc --noEmit && vite build
✓ 61 modules transformed.
✓ built in 581ms
PWA v0.21.2 — precache 5 entries (329.39 KiB)
```

**Scope check:** `git diff` for this change touches only
`src/ui/storeroom/StoreroomScreen.tsx` (one line, the `onFocus` handler) and
`src/ui/storeroom/StoreroomScreen.test.tsx` (one new test). `docs/known-gaps.md`
was not touched, and no other in-flight work in the tree (the items/machines
delete affordances, still uncommitted at the time of this fix) was staged or
committed alongside it — only the two storeroom files were `git add`ed for this
commit (`974316b`).

## Anomaly to flag

Between my two commits, a third commit (`a65bb14`, "docs: start a running
decisions record", adding `docs/decisions.md`) landed on `main` at 14:22:20 —
between `cc43208` (14:21:24) and `e2a5685` (14:24:13). **I did not create this
commit or the file.** It appears to have come from a concurrent process with
write access to the same working tree while this task was in progress. Its
content happens to describe the same schema-v2 and storeroom decisions covered
here (accurately, as far as I can tell), but I have not verified it and did not
author it — flagging it rather than silently taking credit or silently leaving
it unmentioned. No file conflicts with this task's changes resulted from it.
