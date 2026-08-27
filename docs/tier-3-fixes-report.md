# Tier 3 fixes — 2026-08-27

The remainder of `docs/fix-plan-2026-08-27.md` after the pre-run batch: Tier 3,
the one cosmetic item, and the two weak tests the handover flagged.

Baseline: 281 tests, clean build, schema v2. Net: **294 tests**, no schema
change, no changes to `package.json`, `tsconfig.json` or `vite.config.ts`.

Branch `worktree-tier3-and-backfill-tests`, one commit per item.

---

## The two weak tests (`5f6defc`)

The handover said the `machineId` index test "writes its data *after* the
upgrade, so it would pass even if the backfill silently failed". That was
right, and it applied to the `storeroomBalances` test too. Both called
`db.open()` on a database `beforeEach` had just deleted — a *fresh* v2
database, which carries the index by declaration. Neither ever ran the v1→v2
upgrade it was named for.

Why it matters: `historyForMachine` queries `where('machineId')`. If
pre-upgrade visits were ever lost or left unindexed, it would return nothing
for every machine, every slot would seed at 0, and finalize would write those
zeros over the operator's carried-forward levels.

**Fix.** All three upgrade tests now write through the legacy v1 schema first
and open v2 second, plus a fourth covering the same guarantee at
`historyForMachine` itself.

**Evidence.** Removing the index declaration is not a fair test — the old
tests catch that too. The distinguishing sabotage leaves `machineId` declared
and clears `visits` inside the v2 upgrade callback, simulating a migration
that loses rows:

```
OLD  ✓ adds the storeroomBalances table
OLD  ✓ indexes visits by machineId
NEW  × indexes visits that already existed before the upgrade
       → expected [] to deeply equal [ Array(1) ]
NEW  × carries a pre-upgrade visit into historyForMachine
       → expected [] to have a length of 1 but got +0
```

The old tests were run verbatim under that sabotage to confirm they pass.
`db.ts` is byte-identical to before this commit; the change is tests only.

---

## Cosmetic — mixed slot vs ran dry (`f31eedb`)

A mixed slot that had also run dry emitted `border-red-500` and
`border-blue-500` on the same element. Nothing in `SlotRow` decided which the
operator saw; the winner was whichever utility Tailwind emitted later in its
own stylesheet.

**Fix.** Ran dry wins, exclusively — it is the signal that flags lost sales
(spec §5.2), where mixed is structural and still reads from the row's
"N items" label and its sub-rows.

---

## Item 11 — the nav under the thumb (`2299b6f`)

`fixed inset-x-0 bottom-0` is exactly where a thumb rests while scrolling a
fifty-slot machine. Now pinned to the top, `pt-14` on the body to clear it,
`z-10` so the tray tabs scroll beneath rather than over.

Navigation is used about three times a run and the scroll area constantly, so
the rare control is the one that moved.

**Also fixed a latent test problem.** The new test rendered `<App />` and
returned before the machine list's async load settled; the next test's
`db.delete()` then rejected it, and the suite reported an unhandled
`DatabaseClosedError` alongside its passes. The test now seeds a finished
visit and waits for the "Finished" badge — the last thing `reload()` sets.

---

## Item 14 — editing the map from the map screen (`d35a8b2`, `94cf425`)

Each map row gains the same `⋯` the counting screen has, opening the same
`SlotEditSheet`. `useMachineMap` already exposed `reload`, so the row re-reads
on save.

**In addition to** correcting the map from the counting screen, never instead
of it: spec §5.1 puts correction there deliberately, on the grounds that "a
separate admin screen will never get used".

**The bug the tests could not see.** The first implementation rendered the
sheet in document order, last on the page. The map lists every mapped slot at
once, so on a fully mapped machine the sheet landed ~3100px down an 828px
viewport — nearly four screens below the fold. All three tests passed, because
jsdom has no scroll position. On screen, tapping `⋯` looked like it did
nothing.

Found by running the app in Chrome at 390×844. The sheet now sits in a fixed,
dimmed overlay anchored to the bottom, capped at 80vh and scrollable,
dismissable by tapping the backdrop. The counting screen keeps its inline
sheet: it shows one tray at a time, so the sheet is already within reach.

---

## Item 13 — the slot picker (`85a7660`)

The Slots field was free text parsed by `parseSlotNumbers`, so a typo had to be
caught after the fact and explained back.

**Fix.** A toggle per physical slot, grouped by tray. **Multi-select**, as the
fix plan required: a literal single-choice control would have broken Nu Pure
Water 48/49, Coke No Sugar 56/57 and Coke 58/59. Tapping a second slot adds it;
tapping a selected slot gives it up.

Because the picker offers only the 55 slots that physically exist, an invalid
slot number is unreachable rather than rejected — the `slotError` state and its
message are gone. `parseSlotNumbers` stays: the counting screen's "open a slot
that appears in no map" field still reads typed input.

New domain helper `allSlotsInTray`, which knows the first tray is short (10–14)
and the rest hold ten. Eight screen tests changed shape, including the old
error-message test, which is replaced by `offers no control at all for a number
outside the machine trays`. A new test, `keeps a second slot selected rather
than replacing the first`, locks the two-slot regression the plan warned about.

All 55 toggles fit the phone width without wrapping — verified at 390×844.

---

## Not done, and why

- **Item 12's category grouping.** The item list already groups by tray and has
  a search box (`f9e90a7`), which the plan called "much cheaper than either and
  may be enough". A `category` field on `Item` plus 60 assigned values is a
  data-entry job, not a code one.
- **The second half of item 13** — reaching per-machine overrides from the item
  screen. The plan calls it "straightforward once the picker exists". It is now
  the only unbuilt half of a Tier 3 item.
- **Fix-plan item 5 is half-done and was not in scope.** It asked for the
  machine's level in the header of *both* the map and the counting screens.
  Only the map screen got one (`de949e0`); the counting screen still has no
  header at all. Recorded in `known-gaps.md`.
- **The "add item to an unmapped slot" gap is not closed by item 14**, despite
  appearances — the map screen only lists slots that already have a mapping, so
  an unmapped slot has no row to tap. Also recorded in `known-gaps.md`.

---

## Evidence

```
$ npx vitest run
 Test Files  24 passed (24)
      Tests  294 passed (294)

$ npx vitest run 2>&1 | grep -iE "warning|act\(|unhandled|Errors "
(no output)

$ npm run build
> tsc --noEmit && vite build
✓ built in 669ms
```

Driven in Chrome at 390×844 against the seeded starter catalogue: nav at the
top on every screen, the slot picker with Coke lit at 58/59, the map sheet
floating over L2, and a counting screen with tray tabs under the nav and no
false RAN DRY on a machine with no history.
