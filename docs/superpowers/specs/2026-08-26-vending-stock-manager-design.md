# Vending Stock Manager — Design

**Date:** 2026-08-26
**Status:** Approved for planning

---

## 1. Context

One operator manages 15 vending machines in a hotel — one machine on each of levels 2
through 16, with the storeroom on level G. Machines are restocked every Tuesday and
Friday.

Each machine has six trays with slot numbers `10–14`, `20–29`, `30–39`, `40–49`,
`50–59`, `60–69` — roughly 54 slots per machine, 810 across the estate. A laminated
printed map assigns a product and price to each slot. That map is about 90% accurate:
machines diverge through changeovers, temporary substitutions, and items that sit empty
for weeks waiting on a supplier order.

The operator currently has no record of sales, no stock visibility, and no basis for
deciding what to order.

### What the app is for

Two jobs, in priority order:

1. **Load the trolley once.** The storeroom is at the bottom of fifteen floors. A wrong
   pick list costs a full round trip. Everything else is secondary to getting the
   forecast right.
2. **Know what to order.** Turn observed sales into a supplier order that neither
   starves the machines nor ties up cash in the storeroom.

### Success criteria

- A full 15-machine run can be counted and recorded in one pass, without paper.
- The pick list is accurate enough that a second trip to G is rare.
- Sales figures reconcile against machine takings.
- Lost sales from empty slots become visible.

---

## 2. Non-goals for v1

Explicitly out of scope. Each is a deliberate exclusion, not an oversight.

- **Multi-user.** Single operator, single device. The data layer is built so sync can be
  added later without a rewrite, but no accounts, no server, no conflict resolution.
- **Expiry date tracking.** Recording *"3 expired today"* is in scope. Warning *before*
  expiry is not — it requires per-delivery batch dates and turns stock from a number into
  dated lots.
- **Cash / card reconciliation.** Sales are computed so that they *can* be reconciled
  against takings, but the app does not ingest takings data.
- **Machine telemetry.** No integration with the machines themselves.
- **Price history.** A product has one current price. Changing it does not restate past
  revenue.
- **Barcode scanning.**

---

## 3. Core mechanics

Four decisions carry the design. Everything else follows from them.

### 3.1 Baseline is the last recorded level, never par

Every slot on the counting screen opens pre-filled with **what it was left at last
visit**, shown greyed out. Slots that sold nothing — empty slots waiting on an order,
slow movers — need zero taps.

Defaulting to par would be wrong: many slots are never at par, so par would force a tap
on every one of them, every run.

Defaulting to a *forecast* is rejected for a different reason: it produces plausible
wrong numbers that are never caught. "Unchanged since last visit" is a fact that can be
defended; a forecast is a guess wearing the costume of an observation.

### 3.2 The after-count is derived, not counted

There is no second counting pass.

`Fill` is a per-slot toggle. Tap it and the slot's after-count becomes its capacity, and
the trolley decrements. Leave it and the after-count equals the before-count.

A slot left at 1 because the storeroom had none records `after = 1`, correctly, without
being touched.

### 3.3 Sales is a residual, not a subtraction

Stock moves for reasons other than being sold: transfers between machines, expiry,
breakage, staff shrinkage, miscounts. Computing sales as `opening − closing` books
phantom sales for every one of these.

Every stock movement is therefore a logged event carrying a reason, and sales is what
remains unexplained:

```
sales = opening
      − closing
      + fills in
      + transfers in
      − transfers out
      − write-offs      (expired, damaged)
      − shrinkage       (missing, taken)
```

Miscount corrections adjust the recorded level without entering this calculation at all —
they are data fixes, not stock movements.

This is the only formulation whose revenue figure can be reconciled against machine
takings.

### 3.4 Demand belongs to the slot; product is a fulfilment decision

This is the spine of the forecasting design, and it resolves two otherwise separate
problems.

A slot that ran dry on Wednesday sold nothing Thursday and Friday — not from lack of
demand, but from lack of stock. A slot stocked with Fanta all month shows zero Sunkist
sales — again not from lack of demand, but from lack of Sunkist. Forecasting per product
learns the wrong number in both cases.

So **demand is measured and forecast per slot** — *"slot 52 sells 9/week of whatever is
loaded"* — and which product fills that slot is decided at pick time, against what is
actually available in the storeroom.

---

## 4. Domain model

### 4.1 Entities

| Entity | Purpose |
|---|---|
| `Item` | Catalogue entry: name, price, photo, box size, base par. Not tied to a slot. |
| `Machine` | A machine at a location, e.g. `L7 · Lift lobby`. |
| `ItemPlacement` | Which slots an item occupies — base (all machines) or machine-scoped. |
| `SlotConfig` | Per-machine slot capacity and accepted-item preference order. |
| `Run` | One restock round on one date. Contains a trolley and up to 15 visits. |
| `TrolleyLine` | Per item: needed, taken, and whether the storeroom was emptied. |
| `Visit` | One machine within a run: count lines, fills, notes. `finalizedAt` marks it done; see §7 — it is a marker, not a lock. |
| `CountLine` | `slot + item + qty` at count time. The immutable historical record. |
| `Adjustment` | A stock movement with a reason, at a machine slot or the storeroom. |
| `StoreroomBalance` | Per item: estimated units on hand, plus when it was last verified. |
| `Note` | Free text plus optional photo/video, attached to a machine, item, or both. |

### 4.2 Slot occupancy — resolving base and overrides

Two requirements pull in opposite directions: maps must be per-machine (they genuinely
differ), yet slots must be settable once from the item rather than keyed fifteen times.

Resolution: **`ItemPlacement` is the single source of truth, and it is resolved at read
time.** There is no materialized machine map to fall out of date.

```
ItemPlacement {
  itemId
  scope: 'base' | machineId
  slots: number[]        // empty array = "not stocked in this machine"
}
```

A machine-scoped placement fully replaces the base placement for that machine. Editing a
slot while standing at the machine writes a machine-scoped placement — the two editing
directions produce the same data.

`SlotConfig` is separate and per-machine, because capacity is physical:

```
SlotConfig {
  machineId
  slotNumber
  capacity: number       // seeded from the item's base par on first assignment
  accepts: itemId[]      // ordered by preference
}
```

A machine's map is derived by resolving all placements for that machine, grouping by slot
number, and joining `SlotConfig`. At roughly 50 items this is trivial work and is done in
memory.

### 4.3 Slot contents

A slot holds a **list** of `(item, qty)`, not a single item. Slot 52 may hold 3 Sunkist
and 2 Fanta simultaneously.

Capacity is a property of the slot and is shared across everything in it — a channel five
cans deep holds five cans regardless of labels. A mixed slot fills to **5 total**, not 5
of each.

The item's `basePar` is how the operator enters the number and seeds `SlotConfig.capacity`
on first assignment. `SlotConfig.capacity` is authoritative for filling thereafter. For a
single-item slot the two are identical.

### 4.4 Par and capacity are always operator-set

No default value, no auto-learning from observed counts. `basePar` is a required field
when creating an item. Capacity is editable per slot. The app never infers either.

---

## 5. Counting and adjustments

### 5.1 Counting a machine

One screen per machine, one pass, tray tabs across the top matching the physical trays.

Each slot row shows slot number, item name, capacity, last recorded level, and a stepper
pre-filled with that last level (greyed until touched). A mixed slot expands into one
sub-row per item, with a shared capacity readout and an `+ add item` action.

Interactions available on a row:

- Adjust the before-count with `−` / `+`.
- Toggle `Fill` — brings the slot up to capacity and decrements the trolley. On a
  single-item slot this needs no further input. On a **mixed slot**, `Fill` targets the
  slot total and tops up with the highest-preference accepted item still on the trolley;
  the resulting split is shown and each sub-row remains editable, so an operator loading
  a different mix can correct it.
- Correct the slot in place — change which item is there, add a second item, mark the
  slot not stocked. Writes a machine-scoped `ItemPlacement`.
- Attach a note.

**Map correction must be reachable from the counting screen.** With the printed map only
90% accurate, correction that requires a separate admin screen will never happen. Folding
it into the walk lets maps converge on reality over two or three runs.

### 5.2 Ran dry

A before-count of 0 is flagged `RAN DRY` on the row and recorded on the visit. It feeds
two things: the lost-sales report, and allocation priority (§6.2).

### 5.3 Adjustments

Available any time, independent of a run, at either a machine slot or the storeroom.

| Reason | Effect on total stock | Counted as a sale |
|---|---|---|
| Move to another machine / storeroom | none — leaves one location, arrives at another | no |
| Expired | decrease | no — write-off |
| Damaged / broken | decrease | no — write-off |
| Missing / taken | decrease | no — shrinkage |
| Miscount correction | corrects the record | no — not a movement |
| Delivery arrived | increase | no |

A transfer is a single action that updates both locations atomically.

### 5.4 Pack and loose counting

Every quantity entered **at the storeroom** — loading the trolley, returning leftovers,
counting stock, adjusting, receiving a delivery — is entered as **boxes + loose**, with
total units computed. `5 boxes + 17` rather than counting to 137. Box size is a property
of the item.

Pick lists and order suggestions display the same way: *"need 42 = 1 box + 18"*.

**Machine screens use loose units only.** A vending slot contains no boxes.

---

## 6. Forecasting, allocation, ordering

### 6.1 Demand rate

Per slot, in units per day:

```
rate = mean(units sold per day) over the last 4 non-censored periods
```

A period is **censored** — excluded entirely — when the slot's total count reached 0
before the period ended. Observed sales in such a period are a lower bound on demand, and
including them teaches the forecast to under-order, guaranteeing the slot runs dry again.

Because demand is measured on the slot, substituting Fanta for Sunkist does not disturb
the rate.

A slot with fewer than 2 non-censored periods has no rate. Its need falls back to
`capacity − last recorded level`, which assumes nothing sold — deliberately conservative,
since over-picking costs trolley space while under-picking costs a trip down fifteen
floors.

Mean of recent periods is chosen over anything more sophisticated because the operator has
to trust the number. An explainable forecast that is slightly worse beats an opaque one
that is slightly better.

### 6.2 Pick list and allocation

**Need** per slot, computed before leaving G and without reference to storeroom stock.
Nothing has been counted yet at this point, so the projection runs from the level the
slot was left at:

```
projected level = max(0, last recorded level − rate × days since last run)
need            = clamp(capacity − projected level, 0, capacity)
```

Needs are resolved to items by walking each slot's `accepts` list in preference order,
skipping items the storeroom is known to be out of, then aggregated per item for the pick
list.

**Loading the trolley** records what was actually found, per item, as boxes + loose. A
`None left in G` toggle records that the storeroom shelf is now empty for that item — this
is the primary mechanism keeping storeroom figures honest without ever counting shelves.
Unpredictable deliveries stop mattering: if a pallet landed this morning, the operator
takes what is needed and never sets the flag.

**When taken < needed**, the shortfall is allocated across machines:

1. Slots that ran dry in the previous period first — proven unmet demand.
2. Then by demand rate, descending.
3. Fill each slot to capacity in rank order until the trolley is exhausted.
4. Display the cut line, so the operator sees which machines go short.

Allocation is advisory. Every number is overridable. Its purpose is to surface the
trade-off at G rather than on level 12.

### 6.3 Trolley watch

During the run, the trolley balance decrements with each `Fill`. When remaining stock of
an item will not cover the machines still ahead, the app names the level at which it will
run out — while there is still a decision to make.

### 6.4 Order suggestion

Per item, at the end of a run:

```
horizon        = days to cover           (default 7, editable)
safety         = days of buffer          (default 2, editable)
forecast       = Σ over slots accepting this item of (rate × (horizon + safety))
suggested      = forecast − storeroom on hand
order quantity = ceil(suggested / box size) boxes
```

Items whose slots ran dry, and items flagged `None left in G`, are highlighted — these are
the ones actively costing sales.

### 6.5 Storeroom balance

Storeroom stock is an **estimate maintained by a ledger**, not a stocktake. It is
decremented by trolley loads, incremented by returns and deliveries, and pinned to zero by
the `None left in G` flag.

Every balance displays how long ago it was verified. A manual count is available at any
time and resets the estimate to truth, but is never a precondition for a run.

---

## 7. Run lifecycle

```
Level G     1. Start run — pull last recorded levels for all 15 machines
            2. Review forecast pick list (need per item, boxes + loose)
            3. Load trolley — record what was found; flag None left in G

Levels 2–16 4. Per machine: count (defaults to last level), Fill, correct
               the map in place, attach notes and faults
               — trolley decrements; trolley watch warns of shortfalls
               — visit finalized and becomes immutable

Level G     5. Return leftovers to the storeroom
            6. Run summary — units and revenue sold, ran-dry report,
               stock across machines / storeroom / total
            7. Order suggestion for the supplier
```

Steps 1–3 and 5–7 are unhurried desk work at G. Step 4 is the latency-critical path.

A visit is a draft until finalized; every keystroke is persisted immediately, so
abandoning mid-machine loses nothing.

**Finishing a machine is a marker, not a lock** — amended 2026-08-27 after the
first device test. Originally a finalized visit was immutable and corrections
had to become `Adjustment` records. In practice that meant finishing a machine,
noticing a miscount, and finding a screen that silently swallowed every tap.

Immutability protects an audit trail across several people. This is one operator
correcting their own miscount minutes later, and §5.3 already classes a *miscount
correction* as "not a stock movement" — conceding that a wrong count is a data
error rather than history. So `finalizedAt` records that the operator considers
the machine done; it does not prevent editing, and an edit re-stamps `updatedAt`.

The cost, stated so it is not rediscovered: §3.3's sales residual treats a
finalized visit as the closing record for a period, and an editable one makes
that boundary soft. `updatedAt` keeps edits traceable and `touched` still
separates a counted slot from a carried-forward one, so the residual stays
computable — but Phase 2 must decide how late an edit may arrive before the
period it closes is considered settled.

Genuine stock movements after a count are still `Adjustment` records, never
edits. The amendment covers correcting what was observed, not rewriting what
happened.

---

## 8. Architecture

### 8.1 Local-first, no server

The device has connectivity on all floors, so offline capability is not the driver —
**latency is**. An IndexedDB read is sub-millisecond; a network round trip is 50–300 ms.
Across ~800 slots twice a week, that difference is the whole experience. Putting the
network in the interaction path can only make the app slower.

Concretely:

- Nothing awaits the network, ever.
- A run's full working set — 15 machines × ~54 slots, a few hundred KB — loads into memory
  at run start. There are no queries at all during counting.
- Every tap updates the screen immediately and persists behind it. No spinners.
- Installed to the home screen: no browser chrome, no network cold start.

Connectivity is spent on **durability, not speed**: after a run is finalized, a background
job uploads a snapshot. Losing the phone costs at most one run. This is a backup job, not
a sync engine, and it never touches the interaction path.

### 8.2 Stack

- React + TypeScript + Vite
- Dexie over IndexedDB
- `vite-plugin-pwa` for the service worker and installability
- Tailwind CSS
- Vitest, with `fake-indexeddb` for data-layer tests
- Static hosting

### 8.3 Module boundaries

```
domain/     pure TypeScript, zero I/O
            sales residual, demand rate, censoring, need,
            allocation, order suggestion
data/       Dexie schema and repositories (thin)
ui/         React screens — call domain and repositories
backup/     export / import bundle, snapshot upload
```

Everything that can be *wrong* — the sales maths, the forecast, what to buy — lives in
`domain/` as pure functions over plain data. No database, no browser, no mocking. These
numbers decide what money gets spent, so they get tested properly. `data/` and `ui/` stay
deliberately boring.

### 8.4 Built so sync can be added later

- Client-generated UUIDs on every entity; never auto-increment IDs.
- `updatedAt` on every record.
- All persistence behind repository interfaces.

Adding a sync backend later touches the data layer only.

### 8.5 Data safety

- Writes commit per interaction. There is no Save button to forget.
- `navigator.storage.persist()` requested on install, to reduce eviction risk.
- Export/import bundle (JSON plus photos) available manually at any time.
- Backup reminder after each finalized run.

---

## 9. Testing

**`domain/` — unit tests, the bulk of the effort.** Sales residual across every reason
code, including transfers in both directions. Censoring: a period ending at 0 is excluded;
a substituted slot is not. Demand rate with insufficient history. Allocation ranking, with
ran-dry beating a higher rate. Order quantity rounding to box size.

**`data/` — integration tests** over Dexie with `fake-indexeddb`: placement resolution
(base, machine override, not-stocked), visit immutability, adjustment atomicity for
transfers.

**End-to-end — one happy path**, once the screens settle: start a run, load a trolley
short on one item, count and fill three machines, finalize, assert the sales figures and
the order suggestion.

---

## 10. Delivery phases

**Phase 1 — Record.** Items, machines, placements, slot config, run and visit lifecycle,
counting screen with fill toggle, in-place map correction. Outcome: the paper is replaced.

**Phase 2 — Understand.** Adjustments with reason codes, sales residual, ran-dry
reporting, storeroom ledger with pack/loose entry. Outcome: sales and stock become
visible.

**Phase 3 — Decide.** Demand rate with censoring, forecast pick list, allocation, trolley
watch, order suggestion. Outcome: the trolley gets loaded once.

Phase 1 is usable alone. Phase 3 is where the app repays the effort.

---

## 11. Resolved ambiguities

Recorded because each was decided against a plausible alternative.

- **Par vs capacity.** Par is entered on the item and seeds slot capacity. Capacity is
  authoritative for filling, because it is physical and shared across a mixed slot.
- **Base + override is an editing affordance, not runtime indirection.** `ItemPlacement`
  is the single source of truth, resolved at read time. There is no second stored copy of
  a machine's map.
- **Restock policy was considered and removed.** Slots sit low because the storeroom is
  empty, not because of a scheduled hold. Availability already explains the behaviour and
  the shortfall routes itself onto the supplier order.
- **Visits snapshot `slot + item`.** This is what makes placements freely editable —
  re-slotting an item cannot rewrite past sales.
- **Censoring applies to ran-dry only.** Substitution does not censor, because demand is
  measured on the slot rather than the product.
