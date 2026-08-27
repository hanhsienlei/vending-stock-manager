# Phase 2 — Understand: implementation report

2026-08-27. Covers the eleven-task plan at
`docs/superpowers/plans/2026-08-27-phase-2-understand.md`, against the design at
`docs/superpowers/specs/2026-08-27-phase-2-understand-design.md`.

Baseline: 294 tests, clean build, schema v2 (`docs/tier-3-fixes-report.md`).
Net: **418 tests**, schema v3, one commit per task plus a mid-execution
insertion. Branch `worktree-phase-2-understand`.

---

## What shipped

**`Adjustment` and schema v3** (`492d36a`). One new table — a stock movement
with a reason, at a machine slot or the storeroom — plus `price` on
`CountLine`, backfilled from each item's current price. The location is three
flat columns (`locationKind`, `machineId`, `slotNumber`), not a nested object,
deliberately not repeating the `ItemPlacement.scope` mistake recorded in
`known-gaps.md`. This is the first migration to run against real data — the
first restock run had already been recorded — so its tests write through the
v2 schema before opening v3, following the pattern `5f6defc` established.

**The sales residual** (`4775e46`, `5a6bd89`). `sales = opening − closing + Σ
signed movements`, a pure function in `src/domain/sales.ts`. Signed units
collapse spec §3.3's longer formula into one sum: an expiry is negative, a
transfer in is positive. Censors only what is genuinely unknowable — the
first-ever visit to a machine, and an item that left a slot while it still
held stock — and reports zero rather than censoring an untouched slot or a
slot that ran dry.

**Period pairing and the date range** (`d7b7b4d`). A period is bounded by two
consecutive finalized visits to one machine and is attributed to the run of
its closing visit (design §5.1), which makes a single run and an arbitrary
date range the same computation — a run is just the range covering that run's
date. A machine skipped in a run contributes nothing to it, rather than a
double-length period.

**The adjustment sheet**, reachable both from the `⋯` already on every slot
row (`3c1b897`) and from the storeroom screen (`a605685`). Quantity is always
a positive magnitude; the reason decides the sign, so the operator never types
a minus. Choosing `transfer` reveals a destination and writes both sides
atomically in one Dexie transaction (`c6b30dc`).

**The storeroom ledger** (`615d69a`): `balance = last verified manual count +
Σ signed adjustments since`. The manual count built during the pre-run work
is the anchor, not something this phase replaces. Pack/loose entry (spec §5.4)
is built into the ledger's quantity field rather than shipped separately —
every item's `boxSize` is currently 1, so it degrades to plain units today and
starts working the day real carton sizes are entered, with no second visit to
the code.

**The report page inside History** (`03a329c`), alongside the run receipts
built the same day. Units and revenue, a per-slot breakdown, which slots ran
dry, any visit edited late or period censored — scoped to the latest run by
default, with a From/To date for questions a single run cannot answer. Stock
on hand is labelled "now": it reads each machine's latest recorded levels,
never the closing count of periods in the selected range.

**The stock matrix** (`108d604`), the paper stock sheet on screen: one row
per item, a toggleable column per machine, then `GF`, `Total`, and `Order`
left blank for hand-writing. A mixed slot is two rows (`52-1`, `52-2`), never
a split cell, because the `Order` column has to sit beside the thing being
ordered.

---

## The mid-execution scope change — the after-count became editable (Task 4b)

Partway through, the operator described their actual per-machine workflow:
**count what is left → refill → record what was left behind.** Step three
could not be recorded. The after-count was a read-only element with exactly
two reachable values — the before-count (Fill not tapped) or capacity (Fill
tapped) — so a partial refill was inexpressible, and stock redistributed
between machines during a run could not be recorded at all.

This was treated as foundational, not cosmetic: this run's after-count is
next run's opening, so a wrong one books phantom sales next period and
compounds every period after it. Spec §3.2 was amended for it (`d9cce46`),
and the after-count became an editable `Stepper` on every row, including each
sub-row of a mixed slot (`d37c7c7`). A hand-entered figure turns Fill off and
is not re-derived by a later before-count edit; tapping Fill clears it and
resumes the derived behaviour.

**Worth remembering:** with an editable after-count, redistributing stock
between machines *during a run* is self-recording. The source machine's lower
after-count and the destination's higher one capture the movement on their
own — no `Adjustment` is needed. Adjustments exist for movements *between*
visits: an expiry found at the machine, a delivery to the storeroom, a
transfer logged when the stock physically moves outside of a count.

---

## Bugs the plan itself contained, caught in review

These are the most useful part of this document — mistakes the plan's own
pseudocode or first pass would have shipped, each caught before or during
implementation rather than after.

- **A miscount was always signed negative** (`b4f7e02`). The sign came from
  `reasonSpec(reason).totalStock === 'increase'`, and a miscount's
  `totalStock` is `'unchanged'` — so the increase/else-decrease rule fell
  through to decrease every time. An operator who counted *more* than the
  record showed had no way to say so: the correction silently lowered the
  count, and through the ledger, the storeroom figure it fed. Fixed with a
  "Correction direction" control that appears whenever the chosen reason's
  `totalStock` is `'unchanged'` and it is not a transfer, letting the operator
  state which way the physical count differed.

- **`ledgerBalance` summed every movement**, while `sales.ts` already excluded
  miscounts through `entersResidual` (`99e7a91`). The rule that a miscount is
  "a data fix, NOT a stock movement" had two owners disagreeing: the sales
  residual honoured it, the storeroom balance did not. A storeroom miscount
  meant to raise the balance would have silently lowered it. Fixed by
  filtering `ledgerBalance` through the same `entersResidual` the residual
  already used, so the invariant now has one owner.

- **The report's stock-on-hand summed each period's closing count.** For a
  multi-run range this counted a machine once per run inside the range; worse,
  `closing` is the *pre-refill* count, so it was wrong even for a single
  period. Fixed before it shipped (`03a329c`): stock on hand reads each
  machine's latest recorded levels directly, is labelled "now", and does not
  vary with the selected date range at all.

- **A transfer out of the storeroom would have recorded the destination at
  slot 0** (`3c1b897`), which is not a physical slot — slot 0 would have
  poisoned the sales residual, which pairs on `(slot, item)`. Fixed by asking
  for the destination slot explicitly whenever the destination is a machine,
  validated with `isSlotNumber`, rather than reusing the source slot.

- **Visit pairing sorted on `finalizedAt` alone** (`d7b7b4d`), which is
  ambiguous whenever two visits are finalized in the same millisecond — a
  real risk under scripted or fast sequential writes, and Dexie's `toArray()`
  returns rows in primary-key (UUID) order, not insertion order, so a tie
  could pair visits backwards. Fixed by ordering on the visit's run date
  first, `finalizedAt` only as a tiebreak.

- **The app shell's wide-screen relaxation was applied to every screen**
  (`b12ae96`), not only the one containing the matrix. Task 10 dropped
  `max-w-lg` at `≥1024px` so the matrix could use a wide screen, but the shell
  wraps every screen — Machines, Items, Storeroom and Count all stretched to
  full width too, contradicting the design and the matrix's own comment that
  every other screen should stay a phone-width column. Fixed by making the
  relaxation conditional on `screen.name === 'history'`.

---

## What was verified in a real browser

Tests prove the arithmetic; they cannot prove a layout is legible. Driven in
Chrome against the seeded starter catalogue:

- At 1400px the shell drops its width cap and the stock matrix shows all
  fifteen machine columns plus `GF`, `Total` and `Order` with no horizontal
  scrolling.
- A mixed slot splits into one row per item, not a split cell, matching the
  paper sheet's `52-1` / `52-2` convention.
- Seeded counts of 10 then 4 on the same slot produce 6 sold on that line —
  the residual's basic arithmetic confirmed end to end, not just in a unit
  test.

---

## Not done, and why

- **The PDF export is held by operator decision** (`12c1746`). A screenshot
  of the on-screen matrix does the job, and the export was the only part of
  this phase that would have added a runtime dependency — a PDF library plus
  OS share-sheet handling. Held, not dropped: the matrix is deliberately built
  to be legible in a screenshot (toggleable columns, horizontal scroll,
  landscape support), so picking the export up later is a smaller job than it
  would otherwise have been.
- **The `Order` column ships blank**, exactly as it does on the paper sheet.
  It waits for Phase 3's demand rate and order suggestion (spec §6); this
  phase only had to fill `GF` and `Total`, which it does.
- **The storeroom ledger carries no trolley movements.** Its largest movement
  source waits for Phase 3. Until then the ledger reflects deliveries,
  adjustments and manual counts only — expected, not a gap, and stated
  explicitly in the design (§2).

---

## Evidence

```
$ npx vitest run
 Test Files  36 passed (36)
      Tests  418 passed (418)

$ npx vitest run 2>&1 | grep -iE "warning|act\(|unhandled|Errors "
(no output)

$ npm run build
> tsc --noEmit && vite build
✓ built in 615ms
```

Driven in Chrome against the seeded starter catalogue, per "What was verified
in a real browser" above: the matrix at 1400px with no horizontal scrolling,
a mixed slot as two rows, and a seeded 10-then-4 count producing 6 sold.
