# Pre-run fixes — 2026-08-27

Fixes for the blockers found in tonight's whole-diff review, ahead of
tomorrow's first real restock run. Worked test-first, one commit per item,
starting from `main` at `001351e` (262 tests green, build clean).

All ten items are done. Full suite: **281 tests passing, 0 failing**. Build
clean (`tsc --noEmit && vite build`). No `act(...)` warnings, no unhandled
rejections, in any run.

Commits, oldest first:

```
c712ba8 fix(run): compute the run date in local time, not UTC (spec item 1, critical)
4fd21a0 fix(count): render Tray 1..6 labels on the counting screen's tray tabs
209e880 fix(count): exclude a visit's own history from its ran-dry judgement
493c723 fix(count): treat Fill as an observation for the ran-dry flag
1bc556e fix(count): recompute a filled slot's after when capacity changes mid-count
569bae3 docs(count): correct comments that still assert finalize is a lock
56840c6 fix(data): re-stamp the visit on every count-line write, not just finalize
dff57d4 fix(count): reject a capacity of 0 from the slot-edit sheet
4b6064b docs: move the finished-machines gap to fixed, per fix-plan item 9
97179c7 feat(storeroom): add a search box, matching the item list (item 10)
```

---

## 1 (Critical) — run date computed in UTC

**Root cause.** `MachineListScreen.tsx`'s `today()` used
`toISOString().slice(0, 10)`, which is always UTC. At Australia/Adelaide
(+09:30), any run started before 09:30 local reads as the previous UTC day.
Since spec §7's amendment made `getOrCreateRun`/`openVisit` return existing
records instead of throwing, this would have silently pointed tomorrow's
real counts at tonight's device-test run and its already-finalized visits.

**Fix.** Added `src/domain/date.ts` exporting a pure `today()` using
`new Date().toLocaleDateString('en-CA')` — the device's own local calendar
day, formatted `yyyy-mm-dd`. `MachineListScreen.tsx` now imports it instead
of defining its own; it was the only place computing "today" in the app, so
both `startCount` and the finished-machine lookup (`reload`) go through the
one fixed helper automatically — there was no second copy to miss.

**TDD evidence.**
- `src/domain/date.test.ts`: red confirmed (module didn't exist), then
  green. Pins the actual UTC/local boundary with a fake clock at
  `2026-08-27T15:00:00Z` (`2026-08-28T00:30` Adelaide) → expects
  `'2026-08-28'`, plus a second case well after local midnight to show the
  fix isn't just an offset flip.
- `src/ui/machines/MachineListScreen.test.tsx`: added a
  `describe('local calendar day, not UTC ...')` block with two integration
  tests (run creation via `startCount`, and the finished-machine badge) at
  the same fake instant. Verified both fail against the pre-fix
  implementation (temporarily reverted the import, reran with `-t`, restored
  after confirming red — see transcript commands below) before confirming
  green against the fix.

```
$ npx vitest run src/ui/machines/MachineListScreen.test.tsx -t "local calendar day"
# (with today() temporarily reverted to toISOString().slice(0,10))
 × starts a run dated the local day, not the UTC day
   AssertionError: expected '2026-08-27' to be '2026-08-28'
 × marks a machine finished against the local day's run, not the UTC day's
   AssertionError: expected element to have text content /finished/i, received "L7Lift lobbyMap"

# after restoring the fix:
 ✓ src/ui/machines/MachineListScreen.test.tsx (9 tests) 151ms
```

No further usages of `toISOString().slice(0, 10)` remain in `src/` outside
`App.e2e.test.tsx`'s unrelated `tomorrow()` test helper, which was left
alone (it only needs *a* distinct date for its assertion, not the operator's
actual calendar day).

---

## 2 (Important) — tray tabs never relabelled

`TrayTabs.tsx` rendered the raw slot-number prefix (`10 20 30 40 50 60`)
instead of `trayLabel`'s `Tray 1`..`Tray 6`, despite `trayLabel`'s own
docstring already claiming this component used it — a fix that fell between
two agents' scopes.

**Fix.** Imported `trayLabel` from `src/domain/trays.ts` and used it for the
tab's visible text. `TRAYS` and slot numbers (10–69) are untouched — this is
a rendering change only, confirmed by `domain/trays.test.ts` still passing
unmodified.

**TDD evidence.** New `src/ui/components/TrayTabs.test.tsx`: red confirmed
(`getByRole('button', {name: 'Tray 2'})` not found, raw `20`/`40` rendered
instead), then green after the one-line fix.

---

## 3 (Important) — a machine's own open visit counted as its history

`useCounting`'s `hasHistory` was built from `historyForMachine(machineId)`,
which includes the visit currently being viewed once it is finalized.
Because `finalize()` writes a `CountLine` for every slot (including
untouched ones at 0), re-opening a machine finished earlier the same
day — ordinary now that finalizing is a marker, not a lock — made every
untouched slot look like it had prior history of "0", so all ~54 rows
flagged `RAN DRY` again.

**Fix.** In the seeding effect, `historyForMachine`'s result is filtered to
exclude the open visit's own `id` before computing `hasHistory`. The draft
lines from that same visit still seed `before`/`after` as before — only the
history judgement changed.

**TDD evidence.** Two new tests in `useCounting.test.tsx`:
- `does not count a machine's own open visit as prior history for ran-dry` —
  red confirmed (`expected true to be false`), then green.
- `still flags ran dry on reopen when a genuinely earlier finalized visit
  recorded the slot empty` — control case, passed both before and after (to
  confirm the fix didn't overcorrect and blind genuine history).

---

## 4 (Important) — Fill did not count as observing the slot

`toggleFill` never added to `touched`; only `−`/`+` did. On a machine with
no history, a slot found empty and refilled without ever tapping the
stepper showed no `RAN DRY`, losing exactly the lost-sales signal the flag
exists for on the run where it matters most.

**Fix.** Turning Fill *on* now marks every item in the slot `touched`
(matching what a manual count-down already did); turning it back off is not
a new observation and leaves `touched` alone. `persist()` inside
`toggleFill` now writes the updated touched state, not the pre-fill one, so
the flag lands in the persisted `CountLine` too (`ranDry` itself stays
display-only — `CountLine` has no such field).

**TDD evidence.** New test `treats Fill as an observation ...` — red
confirmed (`expected false to be true` on `touched.has(...)`), then green;
also asserts the persisted line's `touched` field. All prior fill-related
tests (mixed-slot fill, remount/resume, toggle-off) still pass unmodified.

---

## 5 (Important) — capacity change did not refresh an already-filled slot

`SlotEditSheet`'s `onSaved` calls `counting.reload()`, which gives
`useMachineMap`'s `map` a new identity and re-fires `useCounting`'s seeding
effect — but that effect's `mergeWith` only fills gaps in `before`/`after`,
never overwrites a key already present. A filled slot's `after` was
therefore left pinned to the old capacity: raising 5 → 20 left `after`
stuck at 5, both on screen and in the persisted `CountLine`.

**Fix and judgement call.** On a non-first-entry run of the seeding effect
(i.e. a `reload()`-driven re-seed, not the initial mount), every currently
`filled` slot has its `after` **recomputed from the current capacity** via
`fillToCapacity`, then re-persisted via `putCountLines`. I chose recompute
over the alternative — clearing the slot from `filled` and forcing a
re-tap — because:
- The operator's intent ("this slot is filled") hasn't changed; only the
  physical depth was corrected. Silently dropping the Fill flag would look
  like data loss and force an extra tap for what is a routine
  capacity-typo correction.
- `fillToCapacity` is deterministic and idempotent, so the recompute is a
  no-op when capacity didn't actually change — it's safe to run on every
  `map` change rather than trying to detect "did capacity change for this
  specific slot", which would need extra state to track prior capacity.
- The `before` count (what was actually found) is never touched — only
  `after` (the derived leave-behind level) moves, consistent with spec
  §3.2's "after-count is derived, not counted."

**TDD evidence.** Two new tests:
- `recomputes a filled slot's after when its capacity changes mid-count` —
  red confirmed (`expected 8 to be 20`), then green. Also asserts `before`
  is untouched and the persisted `CountLine` reflects the new `after`.
- `leaves an unfilled slot alone when its capacity changes mid-count` —
  control case, passed both before and after.

---

## 6 (Minor) — stale comments asserting the opposite of the code

Three comments (`CountScreen.tsx` — the stepper-rejection catch and the
Finish-button catch — and `useCounting.ts`'s `setBefore` rollback comment)
still described finalize as a no-op on a finalized visit, and rejected
writes as caused by finalization. Both claims are the exact behaviour the
2026-08-27 spec §7 amendment removed; left alone they were the comments
most likely to make a future reader reinstate the guard on purpose.

**Fix.** Rewrote all three to state that a finalized visit no longer
rejects writes and that finalize always re-runs and re-stamps, while noting
that a *different* kind of rejection (deleted visit, IndexedDB failure)
remains possible and the swallow/rollback still guards against it.
Comment-only change; full suite re-run to confirm no behavioural drift.

---

## 7 (Minor) — an edit after finalize did not re-stamp the visit

Spec §7 as amended says an edit re-stamps `updatedAt`. `finalizeVisit`
already did this; a single count-line write (`putCountLine`, used by every
stepper tap and Fill via `useCounting`'s `persist`) re-stamped the
`CountLine` but left `Visit.updatedAt` stale — weakest exactly where the
amendment relies on it (edits after finalize must be traceable, since they
are no longer blocked).

**Fix.** `putCountLine` now re-stamps the parent visit's `updatedAt` inside
the same transaction as the line write, for both draft and finalized
visits. `status`/`finalizedAt` are untouched — an edit is not a re-finish.
`putCountLines` (the finalize-time whole-machine batch) was left as-is;
`finalizeVisit` already re-stamps the visit right after it runs.

**TDD evidence.** Two new tests in `visits.test.ts` using a monotonic fake
clock: one for editing a visit already finalized, one for editing a draft.
Both red confirmed (`expected N to be greater than N` — the stamp hadn't
moved), then green.

---

## 8 (Minor) — capacity could be saved as 0

`SlotEditSheet.saveCapacity` only rejected `value < 0`, so a slot could be
saved at capacity 0 and would then fill to nothing.

**Fix.** Guarded at `< 1` instead of `< 0` (also moved the input's `min`
hint from 0 to 1). A slot that genuinely holds nothing should be "not
stocked" — empty `accepts` — not a zero-deep one.

**TDD evidence.** Two new tests: `refuses to save a capacity of zero` — red
confirmed (`onSaved` was called, capacity stuck at 0), then green.
`refuses to save a negative capacity` — control case already covered by the
pre-existing `< 0` check, included as a regression lock.

---

## 9 — `docs/known-gaps.md` updated

Moved "No indication which machines are finished" from the deferred list
to "Fixed since this list was written," crediting `8559eb3` (which shipped
earlier tonight, before this session started) and noting the badge is a
status indicator, never a gate, per the §7 amendment. Reviewed the rest of
the file line by line against tonight's changes — nothing else there
(mixed-slot fill split, no PWA icons, no error surface, `basePar` capacity
drift, `pinSlotCapacities` transaction note, Fill no-op at capacity, the
add-item affordance, `ItemPlacement.scope`, no ESLint, `Item.remark`/`size`,
the open design question on `touched`) was made stale by items 1–8 or 10.

---

## 10 — search box on the storeroom screen (added mid-task, operator request)

`StoreroomScreen.tsx` listed all 60 catalogue items in one flat alphabetical
list with no way to filter — the same problem `ItemListScreen.tsx` had
before `f9e90a7`. The operator counts the ground-floor storeroom tomorrow.

**Fix.** Added the same single full-width `<input type="search">` under the
header, filtering by item name, case-insensitive substring match, same
placement and interaction as the item list. Per the operator's explicit
instruction, **did not** group by tray — trays describe a machine's
physical layout, and the storeroom is shelves with no tray structure to
mirror, so search alone. No shared component was extracted: the two
screens' surrounding markup differs enough (grouping vs. flat list, the
starter-catalogue button, etc.) that pulling out a shared `<SearchBox>`
would have meant touching `ItemListScreen.tsx` on a night where the brief
was to leave working screens alone; copied the ~10-line input block instead
and noted the duplication here.

The one behaviour called out as most likely to go wrong — the header's
"N / 60 counted" total silently reflecting only the filtered subset — does
not occur: `countedCount` and `items.length` are computed from the full,
unfiltered `items`/`verifiedAt` returned by `useStoreroom`, and only the
rendered `<ul>` uses the filtered list. Pinned by a dedicated test.

**TDD evidence.** New `describe('search', ...)` block in
`StoreroomScreen.test.tsx`, four tests: filters by name, case-insensitive,
clearing restores the full list, and the counted total is unaffected by
filtering. All four red confirmed (no `searchbox` role existed yet — every
`screen.getByRole('searchbox', ...)` call failed), then green after adding
the input and filter.

---

## Full-suite and build evidence

```
$ npx vitest run
 Test Files  24 passed (24)
      Tests  281 passed (281)
   Duration  3.90s

$ npx vitest run 2>&1 | grep -iE "warning|act\(|unhandled" | sort -u
(no output)

$ npm run build
> tsc --noEmit && vite build
✓ 63 modules transformed.
dist/assets/index-0cS7J2w7.css   11.24 kB │ gzip:   3.26 kB
dist/assets/index-Dxls-q1J.js   330.22 kB │ gzip: 104.16 kB
✓ built in 582ms
PWA v0.21.2 — files generated: dist/sw.js, dist/workbox-9c191d2f.js
```

Baseline before this session: 262 tests, clean build. Net: **+19 tests**
(9 items' worth of new/adjusted coverage plus item 10's four), all ten
fix-plan items addressed, one commit each, `domain/purity.test.ts` still
green (no `dexie`/`react`/`src/data` imports crept into `src/domain/`), no
schema change (still v2), no changes to `tsconfig.json`, `package.json`, or
`vite.config.ts`.
