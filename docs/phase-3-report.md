# Phase 3 — Decide: implementation report

Written 2026-09-07, at the end of the round that built the forecast.

Phase 3's brief (spec §10) was *"demand rate with censoring, forecast pick
list, allocation, trolley watch, order suggestion. Outcome: the trolley gets
loaded once."* Most of that shipped. One piece — the trolley watch — shipped
and was removed the same week, and that removal is the most instructive thing
in this document.

The plan is `docs/superpowers/plans/2026-09-04-phase-3-decide.md`, its design
`docs/superpowers/specs/2026-09-04-phase-3-decide-design.md`. Both were written
by an agent reading spec §6 against the code as it actually stood, which is why
§16 of the design is a list of places the original spec is wrong.

---

## What shipped

**A backup, before anything else.** `src/backup/export.ts` walks `db.tables`
rather than a hard-coded list, so a table added later is carried without the
file being edited. `import.ts` validates a bundle before destroying anything,
writes every row in one transaction so a failure leaves an empty but openable
database, and runs older bundles through the real upgrade chain. Both reachable
from the storeroom screen. Import was **not** in the plan — it was added at the
operator's direction once the rollback story turned out to be worse than
written.

**The forecast, entirely pure.** `src/domain/` gained `slotPeriods.ts`,
`rate.ts`, `forecast.ts`, `pick.ts`, `allocation.ts`, `trolley.ts` and
`order.ts`. No database, no React, no I/O — `purity.test.ts` fails the build if
any of them import Dexie or React, and now also if any forecast file so much as
mentions `CountLine.touched`.

**Schema v4**, adding one table, `trolleyLines`, with no `.upgrade()` body: it
reads no existing row and writes none. v2 rewrote every count line to derive
`filled` and v3 to backfill `price`; this one rewrites nothing, which is the
whole character of the migration.

**Screens.** A trolley screen under Machines with two modes — load and return —
so the nav stays at four items, and the machines footer became a single derived
action following the run: `Start run` → `Load trolley` → `Continue L{n}` →
`Return leftovers`. Allocation appears inside the load screen only when
something is short, naming who goes without. The order suggestion sits on the
report, and the `Order` column — blank since Phase 2, red-headed and
pink-tinted for the operator's pen — now fills itself, with a toggle to blank
it again.

**Two long-standing gaps closed on the way.** `miscount` retired as an
operator-facing reason (its enum row kept, so historical rows stay excluded
from the residual), and `transfer` withheld at a slot whose visit is open in
today's run, which closes the redistribution double-count at the moment it
exists.

**`MAKE FIRST`** — reordering a slot's preference — was listed optional in the
plan and was not. See below.

---

## Bugs the plan itself contained, caught in review

This section was the most useful part of the Phase 2 report and is the reason
this one exists.

**The plan's rollback story was wrong, and so was mine.** The design's §13 and
§14 said a reverted build "cannot open a v4 database at all," a `VersionError`
leaving the data unreachable. That is true of raw IndexedDB and false of this
app: Dexie catches the `VersionError`, retries with no version, and patches its
missing tables into the newer database in place (`dexie.js:4599`, Dexie 4.4.5).
The old build comes up **looking healthy on top of newer stores, with nothing
announcing it**. The agent implementing import checked the source instead of
accepting the premise it had been handed — twice, in writing — and that is the
only reason import deletes the database rather than clearing its tables.
Clearing would have restored the backup into the patched hybrid and left the
newer stores underneath. §13 is now corrected in place, with the passage that
was wrong quoted rather than deleted.

**`HISTORY_LIMIT = 4` bounds three periods, not four.** Four visits make three
gaps. Spec §6.1's "last 4 non-censored periods" was therefore unsatisfiable by
the existing window. Resolved with a separate `RATE_SEARCH_VISITS = 12` rather
than by changing what `HISTORY_LIMIT` means for the count screen's
carry-forward, and the bound was proved load-bearing by lowering it and
watching the right test fail.

**Spec §6.4 double-counts every mixed slot.** `Σ over slots accepting this
item` puts a slot accepting `[Coke, Fanta]` into both items' forecasts. Fixed
by crediting each slot to its `accepts[0]` only, so slot rates partition —
which is what made `MAKE FIRST` mandatory rather than optional, since the
preference order now silently drives the whole order forecast.

**`PickInput`'s three fields were not enough** for the behaviour the plan
specified. It needs `unmovedSlots` (design §4.4's "quiet" is rate 0 *and* level
unmoved, and only the caller holds the period history) and `levelOf` (walk
order is machine floor level; `SlotNeed` carries only a machine id). Both were
made required rather than optional, because an omitted optional would silently
mean "nothing is quiet". The repository was then extended to supply them —
`unmoved` compares every reading, `before` and `after`, across the five visits
that bound four periods, because a slot found at 3 and refilled to 10 every
week closes at 3 every period and would otherwise look motionless.

**The plan's own test assertion would have failed.** Task 1 specified
`expect(bundle.schemaVersion).toBe(4)` at a time when the schema was 3; the
agent asserted against `db.verno` instead, and so needed no edit when v4
landed.

**Three tests were green on their own branch and failed on integration.** The
import tests hard-coded `db.verno === 3` and native version `30`. Both halves
passed alone; the pair failed the moment schema v4 met them. Fixed by exporting
`SCHEMA_VERSION` from `db.ts` and asserting against it, including the native
version as `SCHEMA_VERSION * 10` — which is the load-bearing check in the
rolled-back-bundle test, since anything higher means the newer database
survived the restore.

**A merge conflict neither branch could see.** Two agents edited
`StockMatrix`'s neighbour `StoreroomScreen.tsx` for unrelated reasons — one
extracting a `QuantityField`, the other dropping `ADJUSTMENT_REASONS`.
Resolved by checking what the merged body actually used rather than picking a
side; both imports turned out to be dead.

---

## The trolley watch: built, shipped, removed in three days

Design §12.3 specified **one line** under the sticky column header, naming the
level an item will run out at, while there is still a decision to make about
it. What shipped looped a line per short item.

On a trolley loaded with nothing, every item on the run is short. The operator
opened a machine and found twenty-eight lines of `runs out at L2 · 0 left`
covering the count table they were standing in front of.

Two faults, and the second is the interesting one:

1. **No cap.** The design said one line; the code said `runOuts.map`.
2. **An unloaded trolley reads as a total shortage rather than as no
   information.** "0 left" of everything is technically true and useless — and
   it is the state every run is in until the trolley screen has been used.

Neither was caught by 825 tests, because the tests asserted the watch appears
when a shortfall is predicted, which it did, correctly. What no test encoded
was how much screen it was allowed to take, or what an absent trolley means.
Removed by operator decision; `runsOutAt` and `trolleyRemaining` kept, pure and
tested, with a tombstone comment recording what must be decided before it
returns.

---

## What was verified in a real browser

Less than it should have been, and the gap showed.

**Verified by hand, on the live site:** the items list in slot order; a tray
folding to `5 HIDDEN`; the storeroom carrying the same sections; the machines
footer changing from `Start run` to `Load trolley`; the load screen's empty
state; the stock matrix in landscape.

**Found only by the operator's photographs, after passing every test:**

- The `Order` column, 38px wide and sized when it was blank by design, wrapping
  `1 × 21` onto two lines and clipping its own header once task 17 started
  printing into it.
- The trolley watch, above.

Both were width and volume problems — properties tests in jsdom cannot see,
because jsdom does not lay out. The one agent that said so explicitly ("width
is guaranteed structurally and tested, not photographed") was right to flag it.

**Also found in a real browser:** a deployed change did not appear after a
normal refresh, because the service worker served its cache. The bundle hash on
the server confirmed the deploy had landed. A working feature was very nearly
reported as broken.

---

## Not done, and why

- **Task 20's own premise.** The plan said to record "import is not built;
  recovery is a hand operation." Import is built. The plan was written before
  the rollback finding.
- **The trolley watch** (above), removed rather than fixed, pending two
  decisions.
- **Nothing has met a machine.** Every verification here is a test or a
  browser. The trolley load, allocation, the return, `MAKE FIRST` and the order
  figures have not been used on a run.
- **The order suggestion does not know what has already been ordered.** No
  purchase-order lifecycle exists; two reports before a delivery will ask for
  the same cartons twice.
- **The forecast will look thin at first.** Six runs across fifteen machines is
  roughly two or three visits each, and a rate needs two non-censored periods.
  Most slots fall back to `capacity − last recorded level`, which is
  deliberately conservative. An item with no rate at all shows **blank, not
  zero** — a null rate forecasts nothing, and a zero in that column reads as
  "order none".

---

## Evidence

- 825 tests across 53 files at the close of the round; `tsc --noEmit` clean;
  `vite build` clean, no warnings.
- Schema v4, migration tested by opening a genuine v3 database, writing rows
  through that schema, closing it, and letting the app's v4 `db` run the
  upgrade — the failure mode `5f6defc` had to fix once already, where the test
  opened a fresh database and never ran the migration it was named for.
- The operator took a full backup (3,194 count lines, 53 visits, 6 runs) on the
  shipped export before v4 was merged, so the schema move was recoverable
  before it was made.
