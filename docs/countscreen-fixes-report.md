# Counting screen fixes — 2026-08-27

Scope: `src/ui/run/**`, `src/ui/components/**`, `src/data/repositories/slotConfigs.ts`,
`src/data/repositories/visits.ts`. Did not touch `src/ui/machines/**`, `src/ui/items/**`,
or `src/ui/App.tsx` — those were owned by a concurrent agent (see "Concurrent-edit
incident" below).

All four items followed red/green TDD: a failing test was written and run first, its
failure output captured, then the implementation was added and the same test re-run to
green. Commands and output below are what was actually run in this session.

---

## Item 1 — Fill records a number the screen never shows

**Root cause.** `useCounting` computed and persisted `after` correctly, but
`CountScreen` never passed it to `SlotRow`, and both of `SlotRow`'s steppers bound
`before`. Fill's green button was the only feedback on every slot type — confirmed on
`devs/debug/fill-button-on-sigle-item-slot.png` (slot 11, single item, capacity 5, reads
`1` with Fill lit) and `devs/debug/fill-button-no-action-only-change-button-color.png`.

**Fix.** `CountScreen` now passes `counting.after` to `SlotRow`. `SlotRow` renders a
read-only `AfterReadout` ("→ N") next to the before-stepper on a single-item row, and
next to each sub-row's stepper on a mixed slot. Styled distinctly (emerald, smaller
type) so before (what you found) and after (what you'll leave) don't get confused at a
glance. Not editable — spec §5.1's editable mixed split is explicitly deferred.

**Files:** `src/ui/run/SlotRow.tsx`, `src/ui/run/CountScreen.tsx`,
`src/ui/run/CountScreen.test.tsx`.

**RED:**
```
$ npx vitest run src/ui/run/CountScreen.test.tsx
 Test Files  1 failed (1)
      Tests  2 failed | 8 passed (10)
 → getByLabelText('slot 52 Sunkist after') / ('slot 11 after') not found
```

**GREEN:**
```
$ npx vitest run src/ui/run/CountScreen.test.tsx
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

**Commit:** `1dfd1be` — `fix(count): render the after-count on every slot row`

---

## Item 2 — Per-slot capacity override

**Root cause.** `setSlotConfig` had no caller in the app. Capacity came only from the
item's estate-wide `basePar`, so the operator couldn't say "this channel on L7 holds
20" without changing that item on all fifteen machines.

**Fix.** Added a capacity field to `SlotEditSheet` (already reachable from a slot row's
`⋯`), seeded from the slot's current effective capacity. Saving calls
`setSlotConfig(machineId, slotNumber, { capacity, accepts: currentItemIds })` —
`accepts` is passed through unconditionally so the override touches capacity only and
leaves preference order untouched.

**Judgement call — interaction with `pinSlotCapacities`.** `pinSlotCapacities` /
`ensureSlotConfig` are create-only: they materialise a `SlotConfig` only if one doesn't
exist yet, specifically so an add/remove of an item never silently redefines capacity.
`setSlotConfig` unconditionally overwrites, which is what an explicit override needs.
The two don't fight: once an override exists, the slot has a `SlotConfig` row, so the
next add/remove's `pinSlotCapacities` call sees it and leaves it alone (its guard is
"no existing config"). No changes needed to `slotConfigs.ts` itself.

**Files:** `src/ui/run/SlotEditSheet.tsx`, `src/ui/run/CountScreen.tsx`,
`src/ui/run/SlotEditSheet.test.tsx`.

**RED:**
```
$ npx vitest run src/ui/run/SlotEditSheet.test.tsx
 Test Files  1 failed (1)
      Tests  3 failed | 5 passed (8)
 → getByLabelText('Capacity') not found
```

**GREEN:**
```
$ npx vitest run src/ui/run/SlotEditSheet.test.tsx src/ui/run/CountScreen.test.tsx
 Test Files  2 passed (2)
      Tests  18 passed (18)
```
Added tests: shows current effective capacity as starting value; overrides capacity for
one machine without leaking to another (`resolvedSlot('L9', 52)?.capacity` stays 5 after
`resolvedSlot('L7', 52)` is set to 20); keeps preference order when only capacity
changes.

**Commit:** `59559bb` — `feat(count): add a per-slot capacity override to SlotEditSheet`

---

## Item 3 — Ran-dry flagged on never-counted slots

**Root cause.** On a machine with no history every slot seeds `before` at 0
(`lastRecordedLevels` returns nothing), and `ranDry` was simply
`slotTotal(before) === 0`. First-ever visit to a machine ⇒ ~54 red rows, burying the
real signal. The existing test `CountScreen.test.tsx > marks an empty slot as ran dry`
actually asserted this buggy behaviour directly (no history, no touch, expects
`RAN DRY`) — that test's premise was the bug, and it needed rewriting, not just adding
alongside.

**Fix.** Ran-dry now means *counted and found empty*, not *never counted*. Added
`hasHistory: Set<string>` to `useCounting`, populated from
`lastRecordedLevels(history).keys()` on every seed (including a `reload()`-driven
re-seed — it depends only on finalized history, never on in-session edits, so it's
always safe to set fresh rather than merge). `ranDry(slot)` is now: total is 0, **and**
(some accepted item has a history entry — even a recorded 0, carried forward
untouched — **or** the operator touched it this visit, even down to 0). A slot with
neither is suppressed.

**Judgement call — what counts as "history".** `lastRecordedLevels` records a key even
when the recorded value was 0, so "has an entry" (not "entry is non-zero") is the
correct check — a slot legitimately found empty last visit and carried forward
untouched must still flag; only a slot with *no* entry at all is suppressed.

**Files:** `src/ui/run/useCounting.ts`, `src/ui/run/useCounting.test.tsx`,
`src/ui/run/CountScreen.test.tsx`.

**RED:**
```
$ npx vitest run src/ui/run/useCounting.test.tsx src/ui/run/CountScreen.test.tsx
 Test Files  2 failed (2)
      Tests  3 failed | 35 passed (38)
 → useCounting > does not flag ran dry on a slot with no prior recorded level and no
   operator input: expected true to be false
 → CountScreen > does not mark a never-counted slot as ran dry...: found RAN DRY
 → CountScreen > marks a slot ran dry once the operator counts it down to zero:
   found RAN DRY before any tap (same root cause)
```

**GREEN:**
```
$ npx vitest run src/ui/run/useCounting.test.tsx src/ui/run/CountScreen.test.tsx
 Test Files  2 passed (2)
      Tests  38 passed (38)
```
Three-way coverage added: never-counted + untouched ⇒ no flag; never-counted, operator
counts to 0 ⇒ flag; history recorded 0, carried forward untouched ⇒ flag (both at the
hook level and the rendered-screen level).

**Commit history note:** landed inside `8076013` — see "Concurrent-edit incident" below.

---

## Item 4 — Finishing a machine must not lock it (spec §7, amended)

**Root cause.** `putCountLine`/`putCountLines` threw `"... is finalized and cannot be
modified"` on any write to a finalized visit, and `useCounting.finalize()` had a bail-out
(`if (!visit || visit.status === 'finalized') return`). The operator finished a
machine, noticed a miscount, and every tap after that was silently swallowed —
`devs/debug/finish-machine-should-not-block-editing-it-is-only-a-flag.png`.

**Spec.** §7 was amended today (already present in
`docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md` before this session
started): `finalizedAt` is a marker the operator set, not a lock; editing a finished
machine is allowed and re-stamps `updatedAt`. Reasoning already recorded there: §5.3
classes a miscount correction as "not a stock movement" — a wrong count is a data error,
not history to protect.

**Fix, three parts:**

1. **`putCountLine` / `putCountLines`** no longer check `visit.status === 'finalized'`.
   They still throw on an *unknown* visit (that guard is unrelated and unchanged).
2. **`finalizeVisit`** now always re-stamps `finalizedAt` and `updatedAt`, even when the
   visit is already finalized (dropped its own early return). Re-finishing after an
   edit must work and record the fact, not silently no-op.
3. **`useCounting.finalize()`** dropped the `visit.status === 'finalized'` half of its
   guard, keeping only `if (!visit) return`. It always runs the whole-machine
   `putCountLines` batch and calls `finalizeVisit`. Calling it with no edits in between
   is a harmless, idempotent-in-*content* re-write (row set and values are unchanged;
   only `updatedAt` moves forward) — confirmed by a dedicated test using a mocked
   monotonic clock.

**Judgement call — where the repository guard lives now.** The task asked me to decide
between a parameter, a separate function, or removing the throw outright, and to keep
the guard "available" for Phase 2. I extracted the old check into an exported,
currently-unused function, `assertVisitNotFinalized(visit)`, in
`src/data/repositories/visits.ts`, and simply don't call it from `putCountLine` /
`putCountLines` any more. I chose this over a boolean parameter (e.g.
`putCountLine(line, { enforceLock: true })`) because a parameter still requires every
call site to remember to pass it, and the one call site that matters (the interactive
counting path) must *never* pass it — an opt-out parameter defaulting to "unlocked" is
easy to get backwards. A separate function is explicit at the call site instead: Phase 2
calls `assertVisitNotFinalized(visit)` itself, wherever it decides a period should be
considered closed (the spec amendment flags this as still open: "Phase 2 must decide how
late an edit may arrive before the period it closes is considered settled").

**Judgement call — the dead-early-return risk.** The task warned specifically that
`finalize()`'s existing early return (added, per its own comment, to stop the
whole-machine batch throwing on a re-finalized visit) must not silently block a
legitimate re-finish after an edit. My first pass at the new/updated tests didn't
actually catch this: because `setBefore` already persists a single line immediately via
`putCountLine` (now unblocked), an edit after Finish showed up in the DB even while the
old early-return bug was still present in `finalize()` — the *batch* re-run and
re-stamp just silently didn't happen. I caught this by re-reading my own tests
skeptically per the TDD discipline ("did this test actually fail before the fix"),
found it didn't, and rewrote the re-finalize tests with a mocked monotonic clock and
strict `>` (not `>=`) comparisons on `finalizedAt`/`updatedAt`, which do fail against
the unfixed code (captured below) and pass only once the early return is fully removed.

**Files:** `src/data/repositories/visits.ts`, `src/data/repositories/visits.test.ts`,
`src/ui/run/useCounting.ts`, `src/ui/run/useCounting.test.tsx`,
`src/ui/run/CountScreen.test.tsx`.

**RED (repository layer):**
```
$ npx vitest run src/data/repositories/visits.test.ts
 Test Files  1 failed (1)
      Tests  3 failed | 16 passed (19)
 → accepts writes to a finalized visit...: Visit ... is finalized and cannot be modified
 → accepts a batch aimed at a finalized visit: same
 → re-stamps finalizedAt and updatedAt on every call...: expected 1700000014000 to be
   greater than 1700000014000  (early-return no-op, both stamps identical)
```

**GREEN (repository layer):**
```
$ npx vitest run src/data/repositories/visits.test.ts
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

**RED (hook layer, after tightening with the mocked clock):**
```
$ npx vitest run src/ui/run/useCounting.test.tsx
 Tests  2 failed | 25 passed (27)
 → re-finalizing without further edits does not throw or duplicate rows, and still
   re-stamps: expected false to be true  (updatedAt did not advance on the 2nd call)
 → persists an edit made after finalize, and re-finishing afterwards records it and
   re-stamps: expected 1700000086000 to be greater than 1700000086000
```

**GREEN (hook layer):**
```
$ npx vitest run src/ui/run/useCounting.test.tsx
 Tests  27 passed (27)
```

**GREEN (screen level, added last — mirrors the operator's exact scenario):**
```
$ npx vitest run src/ui/run/CountScreen.test.tsx
 Tests  14 passed (14)
```
Added: `accepts an edit after Finish machine is tapped, on the same screen` (tap, tap,
Finish, tap again, assert persisted) and `re-entering a finished machine still accepts
edits and Finish still works` (fresh mount against an already-finalized visit — the
literal "walked back into the machine list and back in" flow).

**Tests updated to assert the new rule** (per the task's instruction not to delete
them): `visits.test.ts`'s `rejects writes to a finalized visit` →
`accepts writes to a finalized visit — finishing a machine is a marker, not a lock`;
`rejects a batch aimed at a finalized visit` → `accepts a batch...`; `does not re-stamp
an already-finalized visit` → `re-stamps finalizedAt and updatedAt on every call...`.
`useCounting.test.tsx`'s `finalizes the visit and blocks further writes` →
`...still allows a correcting edit afterwards`; `rolls back before to the pre-write
value when a write is rejected` kept, but its trigger changed from "write rejected
because finalized" (no longer possible) to "write rejected because the visit record
itself is gone" (`db.visits.delete`), which still exercises the real rollback path in
`setBefore`/`toggleFill`. `stays a no-op when the visit is already finalized` →
`re-finalizing without further edits does not throw or duplicate rows, and still
re-stamps`; `does not rewrite a machine reopened after it was finalized` →
`re-finishing a reopened, already-finalized machine works and re-stamps, without
duplicating rows`.

**Commit history note:** landed inside `8076013` together with item 3 — see next
section.

---

## Concurrent-edit incident (git, not code)

This repo is not using worktree isolation between the concurrent agents working the
same checkout at once (me on the counting screen; another agent on the machine list,
map, and item screens, per the task's own scope split). Twice during this session, a
`git add <my files>` followed immediately by `git commit` for my own change reported
"nothing added to commit" — the other agent's own `git commit` (sometimes followed by
what looked like an amend, given a commit hash changing under the same message a moment
later) landed in the same window and swept my already-staged files into *their* commit,
under *their* message, because we share one index.

- Item 3's change first landed, unmodified in content (checked byte-for-byte via
  `git show <hash> -- src/ui/run/useCounting.ts`), inside a commit titled `fix: show the
  machine's level in the map screen header`.
- That commit was then itself amended/replaced by the other agent (hash changed,
  message unchanged) as part of their own subsequent work, and my item 3 diff did not
  survive the replacement — but it was still present, uncommitted, in the working tree
  (confirmed via `git diff` immediately before my item 4 commit).
- Item 4's own `git add`+`git commit` hit the identical race a second time.

I did not attempt any rebase/reset to reconstruct clean separate commits — the task's
git-safety rules rule out `-i` flags and I judged reconstructing history post-hoc riskier
than just re-committing current, verified-correct content once, immediately, and
documenting it. **No code or test content was lost at any point** — every collision was
caught by `git diff`/`git status` before commit rather than after, and the final commit
(`8076013`) was verified via `git show --stat` and a fresh full-suite + build run
immediately after. Items 3 and 4 ended up as one combined commit (`8076013`) instead of
two, with the mixing explained in its own commit message. Items 1 (`1dfd1be`) and 2
(`59559bb`) were unaffected and landed clean before the concurrent agent's write volume
picked up.

Practical effect on tomorrow's run: none — the app code is correct and tested regardless
of which commit a given diff physically sits in.

---

## Full suite and build (final, after all four items)

```
$ npm test -- --run
 Test Files  22 passed (22)
      Tests  256 passed (256)
```

```
$ npm run build
> tsc --noEmit && vite build
✓ 62 modules transformed.
✓ built in 554ms
PWA v0.21.2 — precache 9 entries (330.75 KiB)
```

No `act(...)` warnings, no unhandled rejections, checked explicitly on the four touched
test files:
```
$ npx vitest run src/ui/run/useCounting.test.tsx src/ui/run/CountScreen.test.tsx \
    src/ui/run/SlotEditSheet.test.tsx src/data/repositories/visits.test.ts \
    | grep -iE "act\(|warning|unhandled|error" | grep -v "✓|toThrow|is finalized"
(no output)
```

`purity.test.ts` green — no `domain/` file was touched by any of the four items
(everything landed in `data/repositories/` and `ui/run/`).

Note: several transient build failures were observed mid-session
(`error TS6133: 'listMachines' is declared but its value is never read`,
similarly for `distinctLabel`, and an `App.tsx` type error) — all in files under
`src/ui/machines/**`/`src/ui/App.tsx`, i.e. the concurrent agent's own scope, mid-edit
at the moment I happened to run `npm run build`. Each cleared on its own within
seconds on retry. The final build above, run after all four items were committed, is
clean.

---

## Item-by-item file map

| Item | Files changed | Commit |
|---|---|---|
| 1. After-count rendering | `src/ui/run/SlotRow.tsx`, `src/ui/run/CountScreen.tsx`, `src/ui/run/CountScreen.test.tsx` | `1dfd1be` |
| 2. Per-slot capacity override | `src/ui/run/SlotEditSheet.tsx`, `src/ui/run/CountScreen.tsx`, `src/ui/run/SlotEditSheet.test.tsx` | `59559bb` |
| 3. Ran-dry suppression | `src/ui/run/useCounting.ts`, `src/ui/run/useCounting.test.tsx`, `src/ui/run/CountScreen.test.tsx` | `8076013` (combined, see incident note) |
| 4. Finalize is a marker, not a lock | `src/data/repositories/visits.ts`, `src/data/repositories/visits.test.ts`, `src/ui/run/useCounting.ts`, `src/ui/run/useCounting.test.tsx`, `src/ui/run/CountScreen.test.tsx` | `8076013` |

Not touched, as instructed: `src/ui/machines/**`, `src/ui/items/**`, `src/ui/App.tsx`,
`tsconfig.json`, `package.json`, `vite.config.ts`. No schema change — `src/data/db.ts`
untouched, still version 2.
