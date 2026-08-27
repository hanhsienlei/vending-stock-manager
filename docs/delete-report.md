# Delete affordances for catalogue items and machines

**Date:** 2026-08-27
**Scope:** wire up `deleteItem`, add `deleteMachine`, cascade the right
dependents, decide what happens to history, add the UI affordances.

---

## What was built

### Repositories

**`src/data/repositories/items.ts` — `deleteItem`** now cascades, in one
`db.transaction('rw', db.items, db.placements, db.slotConfigs,
db.storeroomBalances, …)`:

1. Deletes the item row.
2. Deletes every `ItemPlacement` row for that itemId — base and every
   machine-scoped override.
3. Strips the itemId out of any `SlotConfig.accepts` list (`filter(...).modify(...)`
   over the `slotConfigs` table, since `accepts` isn't an indexed field). The
   `SlotConfig` row itself is kept — capacity is physical and shared with
   whatever else is in the slot (spec §4.3); only the preference reference to
   the deleted item goes.
4. Deletes the item's `storeroomBalances` row.

Not touched: `CountLine` rows. See "Historical records" below.

**`src/data/repositories/machines.ts` — new `deleteMachine`**, same shape,
one `db.transaction('rw', db.machines, db.placements, db.slotConfigs,
db.visits, db.countLines, …)`:

1. Deletes the machine row.
2. Deletes every machine-scoped `ItemPlacement` for that machine (base
   placements are estate-wide and are left alone).
3. Deletes every `SlotConfig` row for that machine.
4. Deletes any **draft** `Visit` for that machine and that visit's
   `CountLine` rows.

Not touched: a **finalized** `Visit` or its `CountLine` rows.

### UI

**`src/ui/items/ItemEditScreen.tsx`** — a "Delete item" affordance, shown
only when editing an existing item (not on the New Item screen), placed
below Save behind a `border-t` separator. First tap turns it into "Confirm
delete" + "Cancel"; only the second tap calls `deleteItem` and navigates
away via `onDone()`. Two taps rather than a browser `confirm()` dialog, to
stay consistent with the plain-DOM style already used elsewhere in this app
(`SlotEditSheet`, `ItemListScreen`), and because a native dialog can't be
asserted against in the existing RTL test style used throughout the repo.

**`src/ui/machines/MachineListScreen.tsx`** — same two-tap pattern, one
"Delete"/"Confirm"/"Cancel" per machine row (state tracked per machine id, so
confirming one row doesn't affect another). Placed last in the row — after
the primary "start count" button (which is `flex-1` and takes most of the
row) and after "Map" — so it isn't where a thumb lands scrolling the list.

---

## Reasoning on historical records

This was the part that actually mattered, so here's the reasoning in full.

**The clue in the existing code.** `resolveMachineMap` in
`src/domain/placement.ts` builds a machine's map by iterating the *live*
`items` array and looking up each item's placement — it never iterates
placements or `SlotConfig.accepts` directly. A placement or accepts-entry
for an item that no longer exists in the `items` list is therefore never
visited; it isn't filtered *out*, it's simply never reached. There was
already a test pinning this: `'ignores placements for items missing from
the catalogue'`. Every place the UI resolves an item name from an id already
guards with `?.` (`items.get(id)?.name`), in `MachineMapScreen` and
`SlotRow`, both before this change. That's a consistent design posture: the
live catalog is authoritative for what's *currently* on a machine, and
anything referencing an item outside that live set is inert, not a bug to
patch defensively at every call site.

**What that implies for `CountLine`.** A `CountLine` is not part of a
machine's live map — it's a row in `visits`/`countLines`, read by
`historyForMachine` only to seed `lastRecordedLevels` (a plain `Map<string,
number>` keyed by `slotNumber:itemId`, no item lookup at all) and, in Phase
2, to compute the sales residual. Spec §7 is explicit: "Once finalized a
visit is immutable — later corrections are `Adjustment` records, never
edits to history." Spec §11 gives the concrete precedent: placements are
resolved at read time and visits *snapshot* `slot + item` specifically "so
that re-slotting an item cannot rewrite past sales." Deleting the item is a
more drastic version of re-slotting it, and the same argument applies with
more force: if editing a placement must not rewrite history, deleting the
item that placement pointed to must not either. Spec §1 also names "sales
figures reconcile against machine takings" as a top-level success
criterion — cascading the delete into `CountLine` would silently reduce
past revenue every time an item got renamed-by-delete-and-recreate or
genuinely discontinued, which is exactly the kind of retroactive rewrite
the immutability rule exists to prevent.

**Decision: `deleteItem` does not touch `CountLine` rows, finalized or
draft.** The item disappears from the catalog and from every current
machine map; its historical counts stay exactly as recorded, dangling
itemId and all. That dangling reference is safe today (nothing reads it
back into a rendered map) and stays safe if a future screen ever displays
raw history, provided that screen follows the same `?.` pattern already
used everywhere else in this codebase.

**Decision for `deleteMachine`, and why it isn't identical.** The same
"don't rewrite history" argument applies to a **finalized** `Visit` and its
`CountLine`s — deleting the machine doesn't get to unwind sales that
already happened on it, so those rows are preserved exactly like an item's
history. But a **draft** visit is different in kind, not degree: spec §7
calls it a draft precisely because it is *not yet* the historical record —
"a visit is a draft until finalized." A draft against a machine that no
longer exists has nothing left to become; it can never be finalized (no
screen can navigate to a deleted machine to finish counting it), so leaving
it in the database is dead weight with no compensating safety property.
`deleteMachine` therefore cascades to draft visits and their count lines,
but leaves every finalized visit and its count lines untouched — mirroring
`deleteItem`'s posture on the part of the data that actually is history,
while cleaning up the part that isn't yet.

**Consequence, stated plainly:** deleting a machine that has real,
finalized restock history does not erase that history. It becomes
unreachable through normal navigation (no screen lists a deleted machine),
but it is not destroyed — it survives in IndexedDB for a future export/audit
feature, exactly as an item's sales history does. No delete in this feature
is refused outright; both deletes are unconditional and irreversible for
the *catalog* entity, and conditional (draft-only) for cascade into
count-taking data.

---

## TDD evidence

### RED

Command:
```
npx vitest run src/data/repositories/deletion.test.ts src/domain/placement.test.ts \
  src/ui/run/CountScreen.test.tsx src/ui/items/ItemEditScreen.test.tsx \
  src/ui/machines/MachineListScreen.test.tsx
```

Before any implementation, `deleteMachine` didn't exist, `deleteItem` had no
cascade, and no delete UI existed. Representative failure (machine-list
test, before `deleteMachine`/the delete button existed):

```
 ❯ src/ui/machines/MachineListScreen.test.tsx:54:29
     52|     await screen.findByText('L7')
     53|
     54|     await user.click(screen.getByRole('button', { name: 'Delete L7' }))
       |                             ^
 Unable to find an accessible element with the role "button" and name "Delete L7"
...
 Test Files  3 failed | 2 passed (5)
      Tests  17 failed | 38 passed (55)
```

(`deletion.test.ts` and `CountScreen.test.tsx`'s new case failed for the
same class of reason — `deleteMachine` was not an exported function, and the
new CountScreen regression case depended on `deleteItem`'s cascade behaviour
which didn't exist yet.)

### GREEN

Command:
```
npx vitest run src/data/repositories/deletion.test.ts src/domain/placement.test.ts \
  src/ui/run/CountScreen.test.tsx src/ui/items/ItemEditScreen.test.tsx \
  src/ui/machines/MachineListScreen.test.tsx
```

Output:
```
 ✓ src/domain/placement.test.ts (13 tests) 10ms
 ✓ src/data/repositories/deletion.test.ts (14 tests) 59ms
 ✓ src/ui/machines/MachineListScreen.test.tsx (3 tests) 129ms
 ✓ src/ui/run/CountScreen.test.tsx (9 tests) 283ms
 ✓ src/ui/items/ItemEditScreen.test.tsx (16 tests) 974ms

 Test Files  5 passed (5)
      Tests  55 passed (55)
```

### What each new test covers

- `src/data/repositories/deletion.test.ts` (new, 14 tests):
  - `deleteItem` removes the item; removes base + machine-scoped placements;
    leaves other items' placements alone; strips the itemId from
    `SlotConfig.accepts` without deleting the config; removes the storeroom
    balance; **does not touch a finalized `CountLine`** (the pinned
    historical-record decision); is atomic under a forced failure on the
    last table touched (`storeroomBalances`), asserting every earlier delete
    in the same transaction rolled back too.
  - `deleteMachine` removes the machine; removes machine-scoped placements
    only; leaves another machine's placements alone; removes the machine's
    `SlotConfig` rows; removes a **draft** visit and its count lines;
    **does not touch a finalized visit or its count lines** (the pinned
    historical-record decision, mirrored); is atomic under a forced failure
    on the last table touched (`countLines`).
- `src/domain/placement.test.ts` — added `'tolerates a stale itemId left
  over in SlotConfig.accepts'`, confirming `resolveMachineMap` resolves a
  mixed slot down to the items that still exist rather than crashing or
  emitting a `?` accepts entry.
- `src/ui/run/CountScreen.test.tsx` — added `'still renders a machine whose
  map referenced a since-deleted item'`: seeds a mixed slot (two items),
  a finalized historical count against the item that's about to be deleted,
  deletes that item through the real `deleteItem` cascade, then renders
  `CountScreen` for a fresh run on that machine and asserts it renders the
  surviving item, shows no trace of the deleted one, and that the prior
  finalized `CountLine` for the deleted item is still in the database
  untouched. This is the regression test the task called out as the one
  that "would ruin tomorrow."
- `src/ui/items/ItemEditScreen.test.tsx` — added: no delete affordance on
  the New Item screen; delete requires a second tap (first tap doesn't
  delete); delete can be cancelled before the second tap.
- `src/ui/machines/MachineListScreen.test.tsx` (new file) — same two-tap
  shape for machines, plus a test that confirming one row's delete doesn't
  leak into another row's confirm state.

---

## Full-suite and build results

Full suite:
```
npx vitest run
...
 Test Files  21 passed (21)
      Tests  241 passed (241)
   Duration  3.12s
```
219 tests passed before this work; 22 new tests added (14 in
`deletion.test.ts`, 1 in `placement.test.ts`, 1 in `CountScreen.test.tsx`,
3 in `ItemEditScreen.test.tsx`, 3 in the new `MachineListScreen.test.tsx`).
No `act(...)` warnings, no unhandled rejections in the output.

Build (`tsc --noEmit && vite build`):
```
✓ 61 modules transformed.
dist/assets/index-DgWVc2AV.js   326.87 kB │ gzip: 103.18 kB
✓ built in 568ms
PWA v0.21.2 — files generated: dist/sw.js, dist/workbox-9c191d2f.js
```
Typecheck and build both succeed.

---

## Files changed

- `src/data/repositories/items.ts` — `deleteItem` cascade + doc comment.
- `src/data/repositories/machines.ts` — new `deleteMachine` + doc comment.
- `src/ui/items/ItemEditScreen.tsx` — two-tap delete affordance.
- `src/ui/machines/MachineListScreen.tsx` — two-tap delete affordance per row.
- `src/data/repositories/deletion.test.ts` — new, cascade + atomicity +
  historical-record-pinning tests for both `deleteItem` and `deleteMachine`.
- `src/domain/placement.test.ts` — regression test for a stale `accepts`
  entry.
- `src/ui/run/CountScreen.test.tsx` — regression test: counting screen
  renders for a machine whose map referenced a deleted item.
- `src/ui/items/ItemEditScreen.test.tsx` — delete-affordance tests.
- `src/ui/machines/MachineListScreen.test.tsx` — new, delete-affordance
  tests.

No changes to `src/data/db.ts` (schema untouched, stays at version 2), no
changes to `tsconfig.json`, `package.json`, or `vite.config.ts`. Nothing
touched under `src/ui/storeroom/` or the seed beyond what deletion required
(nothing — the seed doesn't call delete).

## Not addressed / left as-is

- No confirmation beyond the in-screen two-tap pattern (no native `confirm`,
  no "type the name to confirm" — judged as over-designing a v1 affordance
  per the task's own steer).
- No UI surfaces a deleted item's or machine's orphaned historical records
  (e.g. no "view archived machine history" screen). They exist in
  IndexedDB, reachable only by direct query, which matches the current
  scope — building such a screen was not asked for.
