# Machine and item screen fixes — report

Scope: `src/ui/machines/**`, `src/ui/items/**`, `src/ui/App.tsx`, plus the
small repository/domain additions each item needed. `src/ui/run/**`,
`src/ui/components/**`, and `src/ui/useMachineMap.ts` were not touched —
another agent was working there concurrently in the same working tree (no
worktree isolation), and their in-progress, uncommitted changes were kept
out of my commits (see "Working alongside a concurrent agent" below).

Six commits, one per item, in order:

| Item | Commit |
|---|---|
| 1. Remove machine delete | `13f1532` |
| 2. Remove the add-machine form | `1576a67` |
| 3. Show the machine's level in the map header | `de949e0` |
| 4. Mark finished machines | `8559eb3` |
| 5. Hide a duplicate label | `a968eef` |
| 6. Group items by tray + search | `f9e90a7` |

---

## 1. Remove machine delete entirely

**Change.** `MachineListScreen.tsx` no longer renders Delete/Confirm/Cancel
or holds `confirmingDeleteId`. `deleteMachine` is removed from
`src/data/repositories/machines.ts` entirely, and its `describe('deleteMachine',
...)` block removed from `deletion.test.ts`.

**TDD evidence.**
```
$ npx vitest run src/ui/machines/MachineListScreen.test.tsx
 FAIL  … MachineListScreen > offers no delete affordance for a machine
Error: expect(element).not.toBeInTheDocument()
found <button aria-label="Delete L7" …>Delete</button> instead
```
Then implemented; re-run:
```
 ✓ src/ui/machines/MachineListScreen.test.tsx (1 test) 52ms
```

**Judgement call — remove `deleteMachine` from the repository, not just the
UI.** The function was well-tested (7 focused tests in `deletion.test.ts`)
and atomic, so leaving it in was tempting as "harmless, in case it's
useful." I removed it instead, for the reason the task called out: it
invites someone re-wiring a delete button back onto the list later without
the context of *why* it was pulled — the whole-row tap-target collision
that deleted a machine on a fast double-tap. The roster is permanently
fixed at fifteen (spec §1, seed-created), so there's no remaining
legitimate caller, in this app or a plausible next feature. If a genuine
admin need for a cascade delete resurfaces, `deleteItem`'s cascade pattern
in the same file is a template, and a comment in `machines.ts` points there.
Item delete (`ItemEditScreen.tsx`) was untouched — confirmed via a full read
of that file, its delete affordance and tests are unrelated to this change.

---

## 2. Remove the add-machine form

**Change.** Removed the Level/Location inputs, the Add button, and the
`level`/`label` state and `add()` handler from `MachineListScreen.tsx`.
`App.e2e.test.tsx` used this form to create its fixture machine; it now
calls `saveMachine({ level: 7, label: 'Lift lobby' })` directly before
rendering, the same way the seed creates machines.

**TDD evidence.**
```
$ npx vitest run src/ui/machines/MachineListScreen.test.tsx
 FAIL  … MachineListScreen > offers no add-machine form
found <input aria-label="Level" …> instead
```
Then implemented; re-run: 2/2 passing. `App.e2e.test.tsx` re-run green
after the fixture change.

The seed's own empty-roster guard (in `seed.ts`) is left exactly as
instructed — now redundant against hand-adding, not wrong.

---

## 3. Show which machine you are in (map screen)

**Change.** `useMachineMap` (owned by the other agent) was not touched.
Instead the full `Machine` is threaded from where it's already in memory:
`MachineListScreen.onViewMap` now hands back the `Machine` object it
already holds in state (from `listMachines()`) instead of just `machine.id`;
`App.tsx`'s `'machine-map'` screen state carries `machine: Machine` instead
of `machineId: Id`; `MachineMapScreen` takes a `machine` prop and renders
`L{level}` (plus the label, via item 5's `distinctLabel`) in a header row
next to `← Back`. No extra database read is added to the interaction path.

**TDD evidence.** New file `MachineMapScreen.test.tsx` (none existed
before):
```
$ npx vitest run src/ui/machines/MachineMapScreen.test.tsx
 FAIL  … shows the machine's level in the header
```
Then implemented; re-run: passing. Full machines + e2e suite re-run green
after the prop-shape change propagated through `App.tsx`.

---

## 4. Indicate which machines are already finished today

**Change.** Two additive, read-only repository helpers:
- `getRunForDate(date)` in `runs.ts` — deliberately *not*
  `getOrCreateRun`, so merely opening the machine list can never mint an
  empty `Run` record.
- `listVisitsForRun(runId)` in `visits.ts` — an indexed read
  (`visits.where('runId')`), at most fifteen rows.

`MachineListScreen` calls both on load (only the second if a run exists for
today), builds a `Set<Id>` of machines with a `finalized` visit, and renders
a small green "Finished" badge on those rows. This is purely additive to
the row's rendered content — `startCount` is unchanged, so a finished
machine still opens (the amended spec §7 makes finished machines editable,
being implemented concurrently on the counting screen).

**TDD evidence.**
```
$ npx vitest run src/ui/machines/MachineListScreen.test.tsx
 FAIL  … marks a machine whose visit in today's run is finalized, and only that one
Expected element to have text content: /finished/i
Received: L7Lift lobbyMap
```
Then implemented; re-run: 6/6 passing, including a dedicated
"still lets a finished machine be re-opened for counting" test that clicks
the finished row and asserts `onCount` still fires.

**Performance note.** Both new reads are indexed and bounded to ≤15 rows;
on a screen that already does one `listMachines()` read, this is not
noticeable.

---

## 5. Hide the location column when it duplicates the level

**Change.** Added `src/ui/machines/machineLabel.ts`:
```ts
export function distinctLabel(machine: Machine): string | undefined {
  return machine.label === `Level ${machine.level}` ? undefined : machine.label
}
```
Used in both `MachineListScreen` (the row) and `MachineMapScreen` (the
header, since it has the identical duplicate and is in scope).

**Judgement call — hide via a string-equality check against the seed's own
`Level ${level}` format, rather than deleting the field.** Spec §4.1 defines
a machine as being *at a location* (`L7 · Lift lobby`), so the field stays
and a genuinely distinct label (e.g. "Lift lobby") keeps rendering. The
comparison is exact-string, not heuristic — it only suppresses the label the
seed itself writes, so an operator who later edits a machine's label to
something that merely *resembles* "Level 7" (unlikely, but possible) is not
silently hidden.

**TDD evidence.**
```
$ npx vitest run src/ui/machines/MachineListScreen.test.tsx
 FAIL  … hides a machine's label when it just restates the level
found <span class="ml-2 text-gray-500">Level 2</span> instead
```
Then implemented; re-run: 7/7 passing (list) and 3/3 passing (map, after
adding the matching map-screen test).

---

## 6. Group the item list by tray, and add a search box

**Change.**
- `domain/trays.ts` gains `trayLabel(tray: number): string`, returning
  `"Tray 1"`..`"Tray 6"` for the six physical trays (`tray / 10`). This is a
  **pure addition** — `TRAYS`, `trayOf`, `slotsInTray`, `isSlotNumber`,
  `parseSlotNumbers` are untouched, and `purity.test.ts` stays green (no
  new imports of anything outside `domain/`).
- **Where the shared helper lives, for the other agent:**
  `src/domain/trays.ts`, exported as `trayLabel`. The counting screen's tray
  tabs can import it directly.
- `ItemListScreen.tsx` now reads `listPlacements()` alongside `listItems()`,
  groups items by the **trays their base placement's slots fall in** (an
  item lands under every tray it spans, not just one — handled generally,
  not assumed single-tray, per the instruction), and falls back to an
  "Unplaced" section for an item with no base placement so it stays
  findable. A `type="search"` input (`aria-label="Search items"`, role
  `searchbox`) filters by name, case-insensitive, applied before grouping.
  It's a single full-width field directly under the "+ New" button — no
  extra taps to reach it one-handed.
- `MachineMapScreen`'s own `Tray {n}` section headings had the identical
  raw-number problem (visible in the screenshot: "TRAY 10", "TRAY 20", …)
  and are in my scope (`src/ui/machines/**`), so they now use the same
  `trayLabel` helper too.

**Judgement call — grouping is derived from *base* placement only.** The
item screen has no machine in context, so a machine-scoped override
couldn't apply even if consulted (spec §4.2). This matches "derivable today
from base placements" in the brief.

**TDD evidence.**
```
$ npx vitest run src/domain/trays.test.ts
 FAIL  … trayLabel > reads the six physical trays as Tray 1 through Tray 6
TypeError: undefined is not a function
```
```
$ npx vitest run src/ui/items/ItemListScreen.test.tsx
 4 failed | 9 passed (13)
  × groups items under Tray 1..Tray 6, not Tray 10..Tray 60
  × lists an item under every tray it is placed across
  × search > filters the list by name
  × search > is case-insensitive
```
(The fifth new test, "still shows an item with no placement," passed
immediately — a flat list already rendered the item's name, which is all
that test checks; the grouping-specific assertions are what needed the
implementation.)

Then implemented; re-run:
```
✓ src/domain/trays.test.ts (13 tests)
✓ src/ui/items/ItemListScreen.test.tsx (13 tests)
✓ src/ui/machines/MachineMapScreen.test.tsx (3 tests)
```
Confirmed the starter catalogue's three multi-slot items (Nu Pure Water
48/49, Coke No Sugar 56/57, Coke 58/59) all sit within a single tray each,
so the existing "seeds 60 items → 60 listitems" test is unaffected by
multi-tray fan-out; the fan-out path itself is covered by the dedicated
"Spanning Item" test with slots `[14, 20]` (trays 1 and 2).

---

## Working alongside a concurrent agent

The other agent (counting screen) was committing directly to this same
`main` branch/working tree, no git worktree isolation between us. Twice,
`git add <my files>` followed by `git commit` picked up their staged/
uncommitted files too, because git commits the whole index and they had
files staged for their own later commit. Both times I caught it via
`git show --stat HEAD` immediately after committing, and fixed it the same
safe way: `git diff HEAD~1 -- <their files>` to capture their exact
content, `git reset --soft HEAD~1`, `git restore --staged <their files>`,
diffed again to confirm byte-identical content, then re-committed only my
files. Neither fix touched their file contents or was pushed anywhere (no
remote configured). From the third commit on I checked
`git diff --cached --stat` immediately before every commit to catch this
before it happened rather than after.

---

## Full-suite and build results

```
$ npx vitest run --run
 Test Files  22 passed (22)
      Tests  262 passed (262)
```
(262 vs. the 242-test baseline — the difference is the other agent's
concurrent counting-screen work, already committed on `main` before my
last two commits.)

No `act(...)` warnings or unhandled rejections observed in any run above.

```
$ npm run build
> tsc --noEmit && vite build
✓ 62 modules transformed.
✓ built in 553ms
PWA v0.21.2 — precache 9 entries (332.18 KiB)
```

Clean build, no type errors, at every commit point (each item's `tsc
--noEmit` was run and confirmed silent before moving to the next item).

## Files touched

- `src/ui/machines/MachineListScreen.tsx`, `.test.tsx`
- `src/ui/machines/MachineMapScreen.tsx`, `.test.tsx` (new)
- `src/ui/machines/machineLabel.ts` (new)
- `src/ui/App.tsx`
- `src/ui/App.e2e.test.tsx` (fixture only)
- `src/ui/items/ItemListScreen.tsx`, `.test.tsx`
- `src/domain/trays.ts`, `.test.ts`
- `src/data/repositories/machines.ts` (removed `deleteMachine`)
- `src/data/repositories/deletion.test.ts` (removed its tests)
- `src/data/repositories/runs.ts` (added `getRunForDate`)
- `src/data/repositories/visits.ts` (added `listVisitsForRun`, additive
  hunk only — the rest of that file's diff at commit time belonged to the
  other agent and was left alone)
