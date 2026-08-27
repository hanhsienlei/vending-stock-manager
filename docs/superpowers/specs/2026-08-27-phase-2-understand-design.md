# Phase 2 — Understand

Design, 2026-08-27. Subordinate to
`docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md`, which stays
the authority. Where this document and the main spec disagree, that is a bug in
this one.

Spec §10 scopes Phase 2 as *"adjustments with reason codes, sales residual,
ran-dry reporting, storeroom ledger with pack/loose entry. Outcome: sales and
stock become visible."*

---

## 1. What this phase is for

Phase 1 replaced the paper. The app records what was in every slot and carries
it forward, but it cannot yet answer the two questions that make the record
worth keeping: **what sold, and where is my stock**.

Both answers already exist in the data. Neither is computed.

The gap is one entity and two derivations. `CountLine` holds every level ever
recorded, so sales is arithmetic on numbers already stored — as soon as the
stock that moved for reasons *other* than selling can be named. That naming is
the `Adjustment` entity, and it is the only new table this phase adds.

---

## 2. Scope

**In:**

- `Adjustment` — a stock movement with a reason, at a machine slot or the
  storeroom (spec §4.1, §5.3).
- The sales residual (spec §3.3), derived per slot per period.
- A report page inside History: units and revenue, a per-slot breakdown, stock
  on hand across machines and storeroom, and which slots ran dry — scoped to a
  run by default, or to a chosen start and end date.
- The stock matrix on that same page — one row per item, a toggleable column
  per machine, then `GF` and `Total`. See §7.3.
- The storeroom ledger (spec §6.5): a running balance anchored to the last
  manual count.
- Pack/loose quantity entry at G (spec §5.4), built into the ledger's input
  rather than shipped as a separate feature — see §8.

**Out:**

- **The trolley, pick list, allocation, demand rate and order suggestion.**
  Phase 3, spec §6. The storeroom ledger's largest movement source is the
  trolley, so until Phase 3 the ledger carries deliveries, adjustments and
  manual counts only. This is expected, not a gap.
- **Expiry warnings and dated batches.** Ruled out in the original brainstorm:
  warning before expiry "needs a use-by date per delivery batch, and stock stops
  being a number and becomes dated lots. Real work, and more to key in."
  Recording *"3 expired today"* is in scope; predicting it is not.
- **The `Note` entity** (spec §4.1). Not required by any Phase 2 outcome.
- **Fixing Fill's preference order in a mixed slot.** Found while designing this
  phase, recorded in `known-gaps.md`, deliberately not fixed here — see §9.
- **The stock sheet PDF export.** Held by operator decision: a screenshot of
  the on-screen matrix does the job, and the export is the only part of this
  phase that would add a dependency (a PDF library plus OS share-sheet
  handling). §7.3 is therefore built to be screenshotted rather than printed.
  The notes it came from stay on file; nothing about them is contradicted, only
  deferred.

---

## 3. Decisions, and what each one cost

Recorded because each was decided against a plausible alternative, and two carry
a cost that must not be rediscovered as a surprise.

### 3.1 Sales is derived at read time, never stored

Spec §4.2 chose read-time resolution for the machine map precisely so there is
"no materialized machine map to fall out of date". Sales follows the same rule:
no `SalesLine` table, no figures written at finalize.

The alternative — materialising sales when a visit is finalized — was rejected
because §7's amendment makes a finalized visit editable. A stored figure would
have to be rewritten on every correction, so it would be a cache whose entire
job is to be invalidated, and whose failure mode is a wrong number displayed
with no indication anything is stale.

Cost: the summary computes on open rather than reading a row. At fifteen
machines and roughly fifty slots this is arithmetic over a few thousand numbers,
which is nothing next to the IndexedDB reads that fetch them.

### 3.2 A late edit re-prices the past, and says so

Spec §7 leaves Phase 2 one explicit decision: *"how late an edit may arrive
before the period it closes is considered settled."*

**Decision: it never settles.** Sales are always derived from current counts, so
the summary can never disagree with the counts it is built from. Freezing was
rejected because a frozen figure that contradicts its own underlying count is
worse than a figure that moved.

A visit is **edited late** when its `updatedAt` is later than the start of that
machine's next run — that period was already closed when the edit landed. The
marker is derived from timestamps already stored; it adds no state.

Cost: a number you read last month can change. The marker makes that visible
rather than silent, which is the whole point of recording the decision here.

### 3.3 An untouched slot counts as zero sold

Every slot is recorded at finalize. A slot the operator worked and a slot they
scrolled past both end up with `before === after`, separated only by `touched`.

This resolves the open design question `known-gaps.md` has been holding for
Phase 2. **Decision: an untouched slot reports zero sold, exactly like any other
slot**, on the operator's judgement that an untouched row means *seen and
unchanged* rather than *not looked at*.

**Cost, stated plainly.** This is only true if every slot really is eyeballed.
The counting screen carries last visit's level forward and greys untouched rows,
so a whole tray can be passed without a tap. If that happens, the tray reports
genuine zero demand, and Phase 3's forecast will learn from it that nothing
sells there. `touched` remains stored on every line, so Phase 3 can revisit this
without a migration if the assumption stops holding.

### 3.4 A slot changeover needs no question during the walk

The operator's changeover is gradual: **Coke → Coke + Fanta → Fanta**. A line is
sold out before it is removed from the slot.

That makes the obvious failure case disappear on its own. When Coke leaves slot
58 its last recorded level is already 0, so `opening 0 − closing 0` is zero
sales — no phantom revenue, no special case, and nothing to ask mid-count. The
mixed phase in between needs no special handling either, because the residual
pairs on `(slot, item)` and each item carries its own opening and closing.

One case still misreports: an item removed from a slot while its last recorded
level was **above zero** — a mis-map correction, or pulling a line that is not
selling. The app can detect exactly this, because it knows the last recorded
level. That `(slot, item)` period is censored and flagged rather than booked as
sales. Prompting the operator at changeover time was rejected: it puts a
question in the latency-critical path (§7 step 4) to serve a case the normal
workflow does not produce.

### 3.5 Adjustments are rare at machines and ordinary at G

The operator's judgement: expiry and breakage in the machines barely happen. The
original brainstorm's note that *"expiry and shrinkage hit G at least as often as
the machines"* stands for the storeroom.

So adjustments get **no presence in the counting flow**. They live behind the
`⋯` already on every slot row, and on the storeroom screen where they are
routine. Nothing new appears on the counting screen, which stays the
latency-critical path it is meant to be.

### 3.6 Price is snapshotted onto the count

`Item.price` is the current price. Revenue computed from it re-prices every past
run the moment a price changes, and the resulting figure stops reconciling
against machine takings — which spec §3.3 names as the whole reason the residual
is formulated the way it is.

**Decision: `CountLine` gains `price`**, the price in force when the line was
recorded. A full price-history entity was rejected as a larger model serving one
question this answers directly.

---

## 4. Domain model

### 4.1 `Adjustment`

Spec §4.1 already defines it: *"a stock movement with a reason, at a machine slot
or the storeroom."* One entity serves both locations — machine-located
adjustments feed the sales residual, storeroom-located ones **are** the ledger.

```text
Adjustment {
  id            Id
  itemId        Id
  locationKind  'machine' | 'storeroom'
  machineId?    Id           // set only when locationKind is 'machine'
  slotNumber?   number       // set only when locationKind is 'machine'
  reason        AdjustmentReason
  units         number       // SIGNED, relative to this location
  transferId?   Id           // links the two rows of one transfer
  note?         string
  occurredAt    number       // when the adjustment was logged — see below
  updatedAt     number
}
```

**The location is flat, not nested, and that is deliberate.**
`known-gaps.md` records `ItemPlacement.scope` as "a nested object, so it cannot
be indexed and `listPlacements()` full-scans on every map resolution… the
likeliest painful migration in the current schema." `Adjustment` does not repeat
it. `locationKind`, `machineId` and `slotNumber` are separate columns so every
query this phase needs is an index lookup.

Indexes: `id, itemId, occurredAt, machineId, transferId, [machineId+slotNumber]`.

**`occurredAt` is when the adjustment was logged, not a date the operator
enters.** It is set from the clock at write time and there is no field to
change it. The alternative — asking when the stock actually moved — buys
backdating at the cost of a date picker on every adjustment, for movements
the operator logs as they find them.

The consequence, so it is not rediscovered: **an adjustment cannot be
backdated.** Noticing on Friday that a tray expired last Tuesday records it
against Friday, so it lands in the period being closed now rather than the
one it belonged to. For write-offs found at the machine during a count this
is the same period either way. It is wrong only for a movement remembered
after a later count has already closed the period — rare, given adjustments
at the machines barely happen at all (§3.5), and recoverable by correcting
the count itself.

### 4.2 Reason codes

From spec §5.3, plus `delivery` — described in the original brainstorm as "the
only reason code that increases total stock".

| Reason | Total stock | Enters the residual |
| --- | --- | --- |
| `transfer` | unchanged — leaves one location, arrives at another | yes, both sides |
| `expired` | decrease | yes — write-off |
| `damaged` | decrease | yes — write-off |
| `missing` | decrease | yes — shrinkage |
| `delivery` | increase | yes |
| `miscount` | corrects the record | **no** |

`miscount` is the one that changes a level without entering the calculation at
all (spec §5.3, §3.3) — it is a data fix, not a stock movement.

This table lives as **data** in `src/domain/adjustments.ts`, not as branching
scattered across call sites. Adding a reason is a row.

### 4.3 Transfers

Spec §5.3: *"A transfer is a single action that updates both locations
atomically."* A transfer writes **two rows in one Dexie transaction**, sharing a
`transferId`: `−n` at the source, `+n` at the destination. Either both land or
neither does.

### 4.4 `CountLine` gains `price`

```text
CountLine {
  … existing fields …
  price   number    // the item's price when this line was recorded
}
```

---

## 5. The sales residual

A pure function in `src/domain/sales.ts`. No Dexie, no React — `purity.test.ts`
already enforces that boundary for `src/domain/` and must keep passing.

For each `(slotNumber, itemId)` across one period:

```text
opening    = the previous finalized visit's `after`
closing    = this visit's `before`
movements  = this slot's adjustments for this item, occurring between the two,
             excluding `miscount`

sales = opening − closing + Σ movements
```

**Signed units collapse §3.3's whole formula into one sum.** Spec §3.3 writes it
as `opening − closing + fills in + transfers in − transfers out − write-offs −
shrinkage`. Because `units` is signed relative to the location, 2 expired is
`−2`, 3 transferred in is `+3`, and the sum is identical.

**Fills need no term.** A fill happens *at* a visit, not between two, so it is
already inside `previous.after`. Adding a fills term would double-count it.

Worked through: opening 10, closing 5, 2 expired → `10 − 5 + (−2) = 3` sold.
Opening 10, closing 5, 3 transferred in → `10 − 5 + 3 = 8` sold.

**Revenue** is `sales × CountLine.price`, per §3.6.

### 5.1 Which period a result belongs to

A period is bounded by two consecutive finalized visits to one machine, so it
does not line up with a run by itself — a machine skipped in one run has a
period spanning two.

**A period is attributed to the run of its closing visit**: the run in which
the numbers were actually counted. That makes a per-run summary and a
date-range summary the same operation, one being a range of a single run, and
it means a skipped machine simply contributes nothing to the run it was
skipped in, rather than contributing a double-length period to it.

Adjustments fall in the period whose closing visit is the first to be
finalized after they were logged. Because `occurredAt` is the moment of
logging (§4.1), one logged at a machine during a count belongs to the period
that count is closing — which is the reading that matches what the operator
just saw in the machine.

### 5.2 When a period is censored

A censored period reports **no sales figure** rather than a wrong one, and is
excluded from the data Phase 3 learns from.

- **No previous finalized visit.** The first ever visit to a machine has no
  opening. This is also why the ran-dry flag is suppressed on a machine with no
  history — the same "never counted is not zero" rule, already built.
- **An item left a slot holding stock** — §3.4's remaining case.

Explicitly **not** censored:

- **Untouched slots** — they report zero, per §3.3 above.
- **Ran-dry slots.** The sales figure is real and is reported. The flag rides on
  the derived result — not a stored row, per §3.1 — for Phase 3's demand
  censoring (spec §6.1), where a starved slot must not teach the forecast that
  demand fell.

---

## 6. Storeroom ledger

Spec §6.5: the storeroom balance is *"an estimate maintained by a ledger, not a
stocktake."*

```text
balance(item) = last verified manual count
              + Σ signed storeroom adjustments occurring after `verifiedAt`
```

The `StoreroomBalance` built during the pre-run work is the **anchor**, not
something this phase replaces. Its `verifiedAt` is what the sum runs from, and
"verified 6 days ago" keeps working unchanged. A manual count remains available
at any time and resets the estimate to truth, and is never a precondition for a
run.

Until Phase 3 brings the trolley, the ledger's movements are deliveries,
adjustments and manual counts.

---

## 7. Screens

### 7.1 Adjustment sheet

Reached from `⋯` on a slot row — the sheet that already exists — and from the
storeroom screen. Same reason codes in both places, with the location already
known from where it was opened. Shows the item's current on-hand figure for
context, then quantity and reason. Choosing `transfer` reveals a destination.

Nothing is added to the counting screen itself.

### 7.2 The report page

**Lives inside History, as a second view alongside the run receipts** built on
2026-08-27 (`7f34187`). History is already where recorded data is looked at
rather than entered, and the receipts answer *"did it keep what I typed?"*
while the report answers *"what does it add up to?"* — the same question at
two zoom levels. This also keeps the nav at four items.

It serves step 9 of the run flow, *"units sold and revenue this period; stock
on hand: machines, storeroom, total"*, and shows:

- Units and revenue, per machine and totalled
- A per-slot breakdown — the data Phase 3's forecast reads
- Stock on hand across the fifteen machines, the storeroom, and combined
- Which slots ran dry
- Any visit marked **edited late** (§3.2), and any censored period (§5.2), each
  with the reason it could not be counted

**Scoped to a run by default, with a start and end date available.** Opening
it after a run shows that run, which is what close-out wants and needs no
input. A date range answers what a single run cannot — what a month sold, or
how two weeks compare.

The two are the same computation, not two code paths: §5.1 attributes each
period to the run of its closing visit, so a run is simply the range covering
that run's date. Only the selector differs.

Stock on hand is the exception, and the page must not pretend otherwise: it is
a **current** figure, read from the latest count of each machine and the
storeroom balance. It does not vary with the selected range and is labelled
"now" rather than as belonging to the period.

### 7.3 The stock matrix — on screen, made to be screenshotted

`docs/superpowers/specs/2026-08-27-stock-sheet-report-notes.md` describes the
paper sheet this reproduces: one row per item, a column per machine `L2`–`L16`,
then `GF` and `Total`, with `Order` blank for hand-writing. It was parked until
the logger could fill it. **Phase 2 is what unblocks it.**

Two of its three recorded gaps are now closed:

| Gap in the notes | State |
| --- | --- |
| `Item` has no size field for the `Qty` column | Closed — `size?` was added during the catalogue seed |
| `GF` and `Total` need the storeroom | Closed by this phase's ledger (§6) |
| `Order` is Phase 3 | Open — shown blank, per the paper |

That half-answers the notes' own open question: `GF` and `Total` fill
themselves once this phase lands, so only `Order` waits for Phase 3.

**Rendered on screen, not exported.** The PDF is held (§2): a screenshot does
the job, and the export is the only part of this phase that would add a
dependency. The consequence is a design constraint rather than a smaller
feature — **the matrix has to be legible in a screenshot**, which a 17-column
grid on a phone is not.

Three things make it so:

- **Machine columns toggle on and off.** Narrow to the machines you care about
  and the remaining columns get the width they need. This is what makes a
  screenshot usable, so it is not optional polish.
- **It scrolls horizontally**, for when all fifteen are wanted on a larger
  screen. A screenshot then captures only what is on screen, which is exactly
  why the toggles exist.
- **Landscape is supported.** The manifest sets `display: 'standalone'` with no
  `orientation` key, so rotation already follows the device — nothing to
  unlock. What does need doing is the app shell: `App.tsx` wraps everything in
  `mx-auto max-w-lg`, a 512px column that would throw away every pixel landscape
  buys. The matrix must escape that constraint without disturbing the other
  screens, which are correct as a phone-width column.

The notes' remaining decision stands and is not revisited: a mixed slot is two
rows (`52-1 Sunkist`, `52-2 Fanta`), never a split cell, because the `Order`
column has to sit beside the thing being ordered. Their no-server decision is
moot for now and applies whenever the export is picked up.

---

## 8. Pack and loose entry

Spec §5.4 requires every quantity entered **at the storeroom** to be boxes +
loose with units computed, while machine screens stay in loose units — "a
vending slot contains no boxes in it."

This is **not a separate deliverable**. It is how the storeroom ledger's
quantity field works, so it is built into that field from the start rather than
retrofitted.

Every item currently has `boxSize: 1`. A boxes+loose control degrades to plain
units on its own at that box size, so it costs almost nothing now and starts
working the day real carton sizes are entered — with no second visit to this
code, and without requiring sixty box sizes to be keyed in first.

---

## 9. Recorded for `known-gaps.md`

**Fill fights a product changeover in a mixed slot.** A slot's preference order
comes from `SlotConfig.accepts`, and anything not already listed falls back to
alphabetical by item name (`src/domain/placement.ts:41-47`). Fill tops up the
highest-preference item, and nothing anywhere reorders preference —
`SlotEditSheet` adds and removes items but passes the existing order straight
through.

So during a **Coke → Coke + Fanta → Fanta** changeover, "Coke" sorts before
"Fanta" and Fill loads the item being drained. The operator must avoid Fill on
that slot and step the numbers by hand until the outgoing line is gone.

Left unfixed by operator decision: changeovers are rare enough to work around,
and the workaround loses no data. Recorded so the behaviour is recognised as a
known cost rather than rediscovered mid-changeover.

---

## 10. Migration

Schema **v3**, additive:

1. New `adjustments` table.
2. `price` on `CountLine`, backfilled from each item's current price — the best
   figure available, and correct for every line recorded before any price moved.

**This is the first migration that runs against real data.** Schema v2 was done
deliberately while the database was empty, which is why its risk was acceptable
at the time. It is not any more: the first real restock run has been recorded.

The implementation plan must therefore treat v3 as a data-bearing migration —
exercised against a database populated through the v2 schema, in the shape an
operator's browser actually holds, with the test written to fail if rows are
lost or left unmigrated. The upgrade-path tests added on 2026-08-27
(`5f6defc`) are the pattern to follow, and the reason they were strengthened.

---

## 11. Testing

Per spec §9, and following what the codebase already does.

- **Domain purity.** `src/domain/sales.ts` and `src/domain/adjustments.ts` take
  plain data and return plain data. `purity.test.ts` keeps failing the build if
  Dexie or React reaches `src/domain/`.
- **The residual is unit-tested against §3.3's own worked cases** — a plain
  period, a write-off, a transfer in, a transfer out — plus each censoring rule
  from §5.2, and the §3.4 changeover proving a drained line yields zero rather
  than phantom sales.
- **Transfers are tested for atomicity**: a failure writes neither side.
- **The v3 upgrade is tested through the v1→v2→v3 path**, with data written
  through the older schema before the new one opens (§10).
- **Revenue is tested across a price change**, proving a past run keeps its
  original figure (§3.6).
- **The range summary is tested to agree with the per-run one**: a range
  covering exactly one run's date must produce that run's figures, since
  §5.1 makes them the same computation. And a machine skipped in a run must
  contribute to the run it was next counted in, not the one it was skipped in.
- **The matrix is tested for the shape the paper needs**: a mixed slot
  producing two rows (`52-1`, `52-2`) rather than one, `Total` agreeing with
  the machine columns plus `GF`, and a hidden machine's column leaving the
  totals unchanged — hiding a column must not quietly change the arithmetic.

---

## 12. Questions settled after the first draft

Both of this document's open questions were answered by the operator on
2026-08-27, and a requirement was added. Recorded here so the reasoning is not
lost behind the sections they changed.

1. **The period boundary for adjustments** — settled by `occurredAt` being the
   moment of logging rather than an entered date (§4.1). An adjustment logged
   at a machine during a count therefore belongs to the period that count is
   closing, with no rule to remember. The cost is that nothing can be
   backdated, which §4.1 states plainly.
2. **Per-run or per-period** — the summary is scoped to a **run** (§7.2).
   §5.1 makes this well-defined by attributing each period to the run of its
   closing visit, so a machine skipped in a run contributes nothing to it
   rather than a double-length period.
3. **Added: a start and end date** (§7.2). It falls out of the same
   attribution rule, so it is a selector rather than a second implementation —
   but it is what makes the sales data answerable across runs, and it is the
   reason §5.1 exists as a stated rule instead of an assumption.
4. **Added: the date range and the stock sheet share one report page, inside
   History** (§7.2, §7.3). Phase 2 is what unblocks the stock sheet, by filling
   its `GF` and `Total` columns.
5. **The PDF export is held** (§2). A screenshot does the job and the export is
   the only part of this phase that would add a dependency. This is a
   constraint, not a subtraction: the matrix now has to be legible in a
   screenshot, which is why toggleable machine columns and landscape are
   specified rather than left to taste (§7.3).

No open questions remain in this document. One remains in the stock sheet
notes and is now narrowed: `Order` ships blank for hand-writing until Phase 3
fills it, since `GF` and `Total` no longer have to wait.
