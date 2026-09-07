# Phase 3 — Decide

Design, 2026-09-04. Subordinate to
`docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md`, which stays
the authority. Where this document and the main spec disagree, that is a bug in
this one — **except** where §16 records a place the main spec is wrong against
the code as it actually exists, which is stated there rather than fixed
silently.

Spec §10 scopes Phase 3 as *"demand rate with censoring, forecast pick list,
allocation, trolley watch, order suggestion. Outcome: the trolley gets loaded
once."*

Phase 2's design (`2026-08-27-phase-2-understand-design.md`) is the format and
the standard this follows.

---

## 0. Decisions needed from the operator

Thirteen questions this document cannot settle on its own, collected here so
they can be answered in one pass. Each carries a recommendation and the reason
for it; answering "your recommendation" to all thirteen is a valid answer and
the plan is written against that assumption.

Nothing below is guessed silently. Where the plan proceeds on a recommendation,
the section that depends on it says so.

| # | Question | Recommendation |
| --- | --- | --- |
| **D1** | **Build the backup export before the schema moves to v4?** There is no export today (spec §8.5 describes one; `src/backup/` does not exist). Schema v4 is a one-way door for the *app bundle* — see §14. | **Yes, first task.** One file, no new dependency, and it is what makes every future migration recoverable. Roughly half a day. |
| **D2** | **Horizon and safety days for this route.** Spec §6.4 defaults to 7 and 2. Runs are Tuesday and Friday, so the gaps are 3 and 4 days. | **Horizon 7, safety 3.** Seven covers a full week (both runs); three covers the longer Fri→Tue gap, so a missed run does not empty a machine. Two would be tight against a 4-day gap. |
| **D3** | **Rate window — 4 periods?** At Tue/Fri that is about two weeks of history. | **Keep 4** (spec §6.1). Long enough to smooth a quiet week, short enough to follow a real change in trade. |
| **D4** | **Is the trolley loaded once for the whole run, or reloaded partway?** The whole allocation design assumes one load covering all fifteen machines. If you routinely go back down to G mid-run, allocation matters much less and the trolley watch matters much more. | **Assume one load.** It is what spec §1 says the app is for — "load the trolley once". Tell me if it is wrong; it changes §8 and §9's weighting, not the data model. |
| **D5** | **Is allocation its own screen or part of the load screen?** | **Part of the load screen**, revealed only when something is short. It exists to surface a trade-off at G; a screen you have to go and find does not do that, and the nav stays at four items. |
| **D6** | **When you bring the trolley back down, do you count what is left on it?** | **Yes, count it.** The trolley's own arithmetic already predicts what should be left, so counting it turns the return into a free reconciliation — a difference is shrinkage or a miscount, and it is the only check on the machine counts that does not need a second walk. If it is a nuisance, the alternative is a single "put the rest back" button that trusts the derived figure. |
| **D7** | **Does the stock matrix's `Order` column fill automatically, or stay blank for your pen?** | **Fill it, with a toggle to blank it.** The column has shipped blank since Phase 2 precisely so this phase could fill it. The toggle keeps the paper behaviour one tap away for a run where you would rather write. |
| **D8** | **Retire `miscount` as an operator-facing reason entirely?** It is currently offered nowhere — withheld at a slot (design 2026-08-28 §7) and excluded at the storeroom by the `entersResidual` filter. | **Yes, retire it.** See §4.1. The enum value stays (old rows must keep being excluded from the residual); the tile and the correction-direction control go. |
| **D9** | **Withhold `transfer` at a slot while that machine's visit is open in today's run?** This is the redistribution double-count in `known-gaps.md`. | **Yes.** See §4.2. It removes the trap at exactly the moment it exists and leaves between-visit transfers working. |
| **D10** | **Make `SlotConfig.accepts` reorderable?** Today the preference order can only be changed by removing and re-adding items. | **Yes, small control on the slot sheet.** It is the single fix for two separate known costs — Fill loading the outgoing line during a changeover, and §10's order forecast attributing a slot to the wrong item. Not strictly Phase 3, but it is Phase 3 that makes it expensive. |
| **D11** | **Is `None left in G` available anywhere other than the load screen?** | **Load screen only, for now.** That is the moment you are looking at the shelf. The storeroom screen already has a manual count, which does the same job. |
| **D12** | **Do you pull whole boxes off the shelf?** If so, the `Taken` field should default to the need rounded *up* to a whole box. | **Default to whole boxes where a carton size is known, editable to any number.** Forty-six of sixty items now carry a real carton size (`packageSizes.ts`); the other fourteen are loose sundries and stay in units. |
| **D13** | **Does the pick list always cover all fifteen machines?** | **Yes, every machine with a map.** A partial run is then just a run where some machines were not counted, which the period pairing already handles. |

---

## 1. What this phase is for

Phase 1 replaced the paper. Phase 2 made the numbers add up. Neither of them
answers the question the operator actually walks into the storeroom with:
**what do I put on the trolley.**

Everything the answer needs is already recorded. `CountLine` holds every level
ever observed; `salesForPeriod` already turns consecutive visits into units
sold and already knows which periods it cannot vouch for. What is missing is
arithmetic on top of it — a rate, a projection, a need — and one thing the app
has never recorded at all: **what was actually loaded onto the trolley.**

So this phase is one new table and a lot of pure functions. That is the same
shape as Phase 2, and for the same reason (§3.9).

---

## 2. Scope

**In:**

- **Demand rate per slot** (spec §6.1), with censoring driven by the signals
  `SalesLine` already carries.
- **Projection and need** per slot (spec §6.2), and the pick list that
  aggregates needs into items.
- **The trolley**: one new entity recording what was needed, what was taken,
  whether the shelf was emptied, and what came back.
- **Allocation** when the trolley cannot carry what is needed (spec §6.2),
  with a visible cut line.
- **Trolley watch** during the run (spec §6.3).
- **Order suggestion** (spec §6.4), and with it the stock matrix's `Order`
  column, blank since Phase 2 by design.
- **The storeroom ledger gains the trolley** (spec §6.5) — the movement source
  `known-gaps.md` records as deliberately absent until now.
- **A backup export** (spec §8.5), because the schema moves and there is
  currently no way to get the data out. See §14 and D1.

**Out:**

- **Import.** The export half is what makes a migration recoverable *by hand*
  — the JSON is readable and the data is small. A tested import path is a
  second, larger job with its own failure modes, and it is not what the v4
  migration needs to be safe.
- **The snapshot upload** (spec §8.1's "durability, not speed" background job).
  Unrelated to this phase, still unbuilt, still fine.
- **Supplier records, purchase orders, order history.** The order suggestion
  is a figure on a screen, not a document with a lifecycle. Nothing records
  that an order was placed, and nothing subtracts stock-on-order from the next
  suggestion. That is a real limitation and it is stated in §10.
- **Expiry warnings and dated batches.** Ruled out in the original brainstorm
  and unchanged.
- **The `Note` entity** (spec §4.1). Still not required by any outcome.
- **The PDF export.** Still held by operator decision (Phase 2 §2). The matrix
  is still made to be screenshotted, and now the `Order` column has something
  in it to screenshot.

---

## 3. Decisions, and what each one cost

Recorded because each was decided against a plausible alternative. Several
carry a cost that must not be rediscovered as a surprise.

### 3.1 The forecast never reads `touched`

**This is the most important decision in the document, and it is forced by a
data defect discovered today.**

A bug fixed this morning (`4cad94e`) meant that wherever `Fill tray to par` was
used, `CountLine.touched` was persisted `true` for slots nobody counted —
always before 2026-08-28, and after that date whenever a `⋯`-sheet save
triggered a reload. No figure was corrupted: `before`, `after`, the sales
residual and the carried-forward levels are all sound, because none of them
reads the flag. But **falsely-touched rows cannot be separated from genuine
ones on disk**, because a real per-slot Fill tap sets `touched: true` alongside
`filled: true` exactly the same way.

The flag is unreliable in the other direction too, and that predates the bug:
`setAfter` does not add its key to `touched` (`known-gaps.md`), so a slot whose
after-count was typed by hand — an unmistakable observation — reads as
untouched.

So `touched` has three eras on disk, two of which over-report and one of which
under-reports, and no stored field distinguishes them.

**Decision: no function in `src/domain/` written for this phase takes `touched`
as an input, and no Phase 3 repository reads the field.** The demand rate,
censoring, the projection, allocation and the order suggestion are computed
entirely from levels, dates and adjustments — all of which are sound.

This is not a workaround; it is the better design regardless. The signal Phase
3 needs is *"did this slot reach zero"*, and that is `closing === 0`, an
observed level, not a claim about operator attention. `SalesLine.ranDry`
already computes it that way (`src/domain/sales.ts:149`) and does not read
`touched`. The corrupt flag is therefore already firewalled from the forecast
by Phase 2's own design; this decision states the firewall as a rule so nobody
breaches it later.

**Cost.** The one thing `touched` could have bought is the ability to tell
*"counted and found unchanged"* from *"scrolled past"*. Without it, a tray that
is genuinely never looked at reports zero sales, gets a rate of zero, and asks
for nothing on the pick list. §4.4 says what is done about that instead.

**If a later phase wants the flag**, it may read it only for visits finalized
**after 2026-09-04**. That boundary is recorded here and in `known-gaps.md`
rather than as a constant in code, because writing an unused constant into
`src/domain/` invites something to start reading it.

**Enforcement.** `src/domain/purity.test.ts` already fails the build on
forbidden imports. This phase adds a sibling assertion: no file created by this
phase in `src/domain/` may contain the identifier `touched`. It is a grep, it
costs nothing, and it is the only mechanical guard against a rule that is
otherwise a matter of memory.

### 3.2 Demand is measured on the slot total, not on the `(slot, item)` line

Spec §3.4 is emphatic: *"demand is measured and forecast per slot"*. The sales
residual, however, pairs on `(slotNumber, itemId)` — it has to, because opening
and closing levels are per item and a mixed slot holds two of them.

So Phase 3 needs an aggregation step the spec never names: **for each period,
sum `sold` across every item in the slot, and treat the result as the slot's
demand.**

This matters for censoring. `SalesLine.ranDry` is `closing === 0` for one
`(slot, item)` line. In a mixed slot holding 0 Coke and 4 Fanta, the Coke line
is "dry" while the channel is still dispensing perfectly well. Censoring on the
line would throw away a period that is entirely usable, and — worse — a
changeover would censor the incoming item's every early period.

**Decision: a period is censored for rate purposes when the slot's *total*
closing level is zero**, which is spec §6.1's own wording ("the slot's total
count reached 0"), and is what the physical channel actually did.

**Cost:** none that has been found. The per-line `ranDry` flag is still what
the report displays and still what the lost-sales list is built from; it is
only the rate that aggregates.

### 3.3 The rate is pooled units over pooled days, not a mean of per-period rates

Spec §6.1 writes `rate = mean(units sold per day) over the last 4 non-censored
periods`. Read literally that is the mean of four quotients. Periods are not
equal length — Tue→Fri is 3 days, Fri→Tue is 4 — so a mean of quotients weights
a short period more heavily per unit sold than a long one.

**Decision: `rate = Σ units sold / Σ days`, over the same four periods.**

Two reasons, and the second is the deciding one:

1. It is the arithmetically correct answer to "how many a day does this slot
   sell", which is what the sentence means.
2. **It is the number the operator can check by hand.** "42 sold over 14 days
   = 3.0 a day" is one division on one line. A mean of quotients is four
   divisions and an average, and the screen would have to show all five figures
   to be traceable. Spec §6.1's own justification for choosing a mean over
   anything cleverer — *"an explainable forecast that is slightly worse beats an
   opaque one that is slightly better"* — argues for the pooled form, not
   against it.

At a Tue/Fri cadence the two differ by a few percent. The deviation from the
spec's literal wording is recorded in §16.

### 3.4 A period is censored by its own numbers, never by a new flag

`SalesLine` already carries `ranDry` and `censoredReason`, and Phase 2 was
explicit that the flag "rides on the derived result — not a stored row — for
Phase 3's demand censoring". Phase 3 reuses both and invents no parallel
notion.

A period is excluded from the rate for exactly one of these reasons, and the
reason is displayed:

| Exclusion | Source | Why |
| --- | --- | --- |
| `no-previous-visit` | `SalesLine.censoredReason` | The first-ever visit has no opening. Already computed. |
| `left-slot-with-stock` | `SalesLine.censoredReason` | An item left a slot holding stock — sale or pull-out, unknowable. Already computed. |
| `visit-not-finalized` | `SalesLine.censoredReason` | A draft visit has closed nothing. Already computed. |
| `ran-dry` | slot-total `closing === 0` (§3.2) | Spec §6.1. Observed sales are a lower bound; including them teaches the forecast to under-order and guarantees the slot runs dry again. |
| `residual-clamped` | **new, derived** | The residual clamped at zero — `opening − closing + movements < 0`. Stock arrived without being recorded. See below. |

**`residual-clamped` is the one addition, and it earns its place.**
`salesForPeriod` clamps a negative residual to zero (`sales.ts:139`) because a
negative sale is not a thing. But a clamp is a signal: the numbers for that
period did not reconcile, so something was unrecorded or double-recorded — and
`known-gaps.md`'s redistribution double-count produces exactly this at the
source machine, where "the source's residual clamps at zero, losing genuine
sales along with it".

A clamped period is therefore not a zero-sales period; it is a period whose
figure is not trustworthy. Feeding it to the forecast as a genuine zero teaches
the slot to ask for nothing. Excluding it is cheap and honest.

This needs one new **derived** field on `SalesLine` — `clamped: boolean` — and
no schema change, because `SalesLine` is computed at read time and stored
nowhere (Phase 2 §3.1).

**Cost:** a slot whose counts routinely fail to reconcile will accumulate
exclusions and eventually fall below two usable periods, dropping to the
no-rate fallback. That is the correct outcome — the app should not forecast
from numbers it cannot balance — but it is silent unless the exclusions are
shown, which is why §7 puts them on the screen.

### 3.5 The trolley is a table of its own, not a pair of adjustments

Spec §6.5 requires the storeroom balance to be decremented by trolley loads and
incremented by returns. Two ways to do that:

- **(a) Write `Adjustment` rows** with new reason codes (`trolley-out`,
  `trolley-in`). The ledger then works completely unchanged.
- **(b) A `TrolleyLine` table**, with the ledger reading two movement sources.

**Decision: (b), the table — with one function owning the balance.**

(a) is tempting because `ADJUSTMENT_REASONS` is deliberately built so that
"adding a reason is a row". But the reason table is also what the adjustment
sheet renders its tiles from, by design (interface refinement §7: "which tiles
appear stays derived, never hard-coded"). Two reasons the operator must never
tap would then have to be filtered out by a *second* mechanism sitting beside
`entersResidual` — and a second filter concept over the same table is precisely
the kind of thing that drifts. Spec §4.1 also names `TrolleyLine` as an entity
in its own right, carrying `needed` and the none-left flag, neither of which an
`Adjustment` has anywhere to put.

**The Phase 2 lesson is honoured differently.** That lesson was not "one table"
— it was **one owner of an invariant**: `ledgerBalance` summed every movement
while `sales.ts` excluded miscounts, and the storeroom figure went the wrong
way. So the balance keeps exactly one implementation. `src/domain/storeroom.ts`
gains a normalising step:

```text
storeroomMovements(adjustments, trolleyLines) → { units, at }[]
ledgerBalance(anchor, movements)              → number     // arithmetic unchanged
```

The arithmetic stays where it is and keeps its single owner; the trolley
becomes another producer of movements rather than another formula.

**Cost:** `ledgerBalance`'s callers all change shape once, and any future
movement source must be added to `storeroomMovements` rather than to the
balance. That is the point.

### 3.6 `None left in G` is a manual count of zero

Spec §6.2 makes the flag "the primary mechanism keeping storeroom figures
honest without ever counting shelves", and §6.5 says it pins the balance to
zero.

The app already has a mechanism that pins a balance to a figure and records
when it was observed: `setStoreroomBalance(itemId, units)`, which writes
`units` and stamps `verifiedAt` to now. A manual count of zero *is* the flag.

**Decision: toggling `None left in G` writes `StoreroomBalance { units: 0,
verifiedAt: now }` for that item**, exactly as typing 0 into the storeroom
screen would, and additionally sets `TrolleyLine.noneLeftInG` so the run's own
record explains why the balance moved.

This falls out of the existing arithmetic perfectly. `ledgerBalance` filters
movements to `occurredAt > verifiedAt` (`storeroom.ts:24`), so the load's own
`−taken` movement — stamped at the same instant — is excluded, and the balance
reads 0 rather than −6. The storeroom screen's "Verified today" line starts
working for the flag with no new code, and every item flagged this run shows as
freshly verified, which is true.

**The alternative** — a `noneLeftInG` boolean consulted by `ledgerBalance` as a
special case — was rejected because it is a third rule inside the balance
function for something the anchor already expresses.

**Cost:** the flag is destructive of the previous anchor, which is correct
(it *is* a count) but means an accidental tap loses the previous estimate.
Mitigated by the same undo everything else has: type the real figure into the
storeroom screen.

### 3.7 Item resolution consults the storeroom as a yes/no, never as a quantity

Spec §6.2 resolves a slot's need to an item by "walking each slot's `accepts`
list in preference order, skipping items the storeroom is known to be out of".

The temptation is to go further and ration: if the ledger says 8 Coke, give 8
to the highest-ranked slots and send the rest down the `accepts` list.

**Decision: don't.** The storeroom balance is an *estimate* (spec §6.5), and
the whole point of the load screen is that the operator is standing in front of
the actual shelf. A pick list that has already rationed against a wrong
estimate is a pick list that disagrees with what you can see, and the operator
has to undo the app's arithmetic in their head. So:

- `need` is computed with **no reference to storeroom stock at all**, exactly
  as spec §6.2 says.
- Item resolution skips an item only when the ledger balance is **zero** —
  "known to be out", a binary — and falls to the next accepted item.
- The `Taken` figure the operator types is what makes the pick list real, and
  the shortfall arithmetic in §8 runs on *taken*, never on the estimate.

**Cost:** an item the ledger thinks it has 40 of, but which is actually gone,
produces a pick line that cannot be filled. That is exactly the case the
`None left in G` toggle exists to record, and it is recorded at the moment of
discovery rather than guessed beforehand.

### 3.8 The order forecast attributes each slot to exactly one item

Spec §6.4: `forecast = Σ over slots accepting this item of (rate × (horizon +
safety))`.

**Taken literally this over-orders, and by a lot.** A slot whose `accepts` is
`[Coke, Fanta]` contributes its entire rate to Coke's forecast *and* to
Fanta's. Every mixed slot is double-counted, and every slot that has ever had a
second item added — which is how a changeover is recorded — is double-counted
for as long as both items remain listed.

**Decision: each slot's rate is attributed to `accepts[0]`, the item that slot
will actually be filled with.** Slot rates then partition across items, and
each slot appears in exactly one item's forecast.

The alternative considered was splitting a slot's rate across its occupants in
proportion to their current levels. It is more accurate mid-changeover and it
is harder to explain: the operator would see a fractional slot contribution
with no way to check it. `accepts[0]` gives one legible line — *"slot 52 · 1.4
a day · Coke"* — and the operator can see the attribution is wrong and fix it
by reordering the slot (D10).

**Cost, stated plainly:** during a **Coke → Coke + Fanta → Fanta** changeover,
the outgoing item is forecast demand it will never take and the incoming item
gets none — until the outgoing item is removed from the slot. This is the
*same* root cause as `known-gaps.md`'s "Fill fights a product changeover":
`SlotConfig.accepts` cannot be reordered. Phase 3 is what makes that expensive
enough to fix, which is why D10 exists.

### 3.9 Nothing is stored that can be derived

Phase 2 §3.1 refused to store the sales figures, on the grounds that a
finalized visit is editable so a stored figure "would be a cache whose entire
job is to be invalidated". The same rule holds here, and it decides four
questions at once:

- The **demand rate** is not stored. It is recomputed from count lines.
- The **need** and the **pick list** are not stored — except for
  `TrolleyLine.needed`, which is stored *as a snapshot of what was asked for*,
  not as a live figure. It exists so a past run can explain itself.
- The **allocation** is not stored. Spec §6.2 says it is advisory and every
  number is overridable; what actually happened is recorded by the counts.
- **What is left on the trolley** is derived (§9), not decremented in a stored
  field, because the thing that empties the trolley is now the after-count, not
  a Fill tap (§16).

The only genuinely new stored facts are the three the app cannot otherwise
know: **what was needed, what was taken, and whether the shelf was empty.**

---

## 4. The open questions this phase inherits

`known-gaps.md` holds four questions explicitly deferred to Phase 3, plus a
resolved-but-costly design decision. Phase 3's forecast is the first consumer
that makes any of them matter, so each gets an answer here.

### 4.1 What a slot `miscount` should mean

**State today:** `miscount` is offered nowhere. The storeroom filters reasons to
`entersResidual`, which excludes it; the slot sheet withholds it too (interface
refinement §7). The `needsDirection` correction-direction control — added
because a miscount was always being signed negative — is therefore unreachable,
because `miscount` is the only reason it applies to.

**Recommendation: retire it as an operator-facing reason.** (D8)

The reasoning is that a slot miscount has no coherent meaning left. Spec §3.3
and §5.3 both class it as "a data fix, not a stock movement", so it must never
enter the residual. But the residual reads `CountLine`, and an `Adjustment`
cannot alter a `CountLine`. A miscount adjustment at a slot can therefore
change nothing that anything reads — it is a row that is written and then
ignored by every consumer, which is worse than absent because it looks like it
worked.

And the correct fix already exists and is better: **spec §7 as amended makes a
finalized visit editable** — `finalizedAt` is a marker, not a lock. A wrong
count is fixed by opening the machine and typing the right number, which
corrects the figure the residual actually reads, in the place the operator
already knows. At the storeroom the equivalent is the manual count, which
re-anchors the ledger and is already what the on-screen legend tells the
operator to do.

**What changes:** the enum value `'miscount'` stays in `AdjustmentReason` and
keeps `entersResidual: false`, because rows may exist on disk and must keep
being excluded. `ADJUSTMENT_REASONS` gains a flag or the row is removed from
the display list — the plan uses `offered: false` rather than deleting the row,
so `reasonSpec('miscount')` keeps working for historical rows. The
`needsDirection` control and its tests are removed with it, and
`known-gaps.md`'s bullet is closed rather than left open.

**If the answer is the other way** and `miscount` returns, the direction control
returns with it — that pairing is already recorded and this design does not
disturb it.

### 4.2 The redistribution double-count

**The gap:** stock moved between machines during a run is self-recording — the
source's lower after-count and the destination's higher one carry it (spec
§3.2). But the slot's `⋯` sheet also offers a `transfer` adjustment, and an
operator who does both subtracts the move twice. The source's residual clamps
at zero, losing genuine sales; the destination's inflates.

**Why Phase 3 makes it matter more:** the residual is no longer just a number on
a report. It is the input to the demand rate, so a double-counted move does not
just misreport one period — it teaches the source slot to order less and the
destination slot to order more, for four periods.

**Recommendation, in two parts:**

1. **Withhold `transfer` at a machine slot while that machine has a `draft`
   visit in today's run.** (D9) That is exactly the window in which the
   after-counts are being written, and it is the only window in which the
   double-count is possible. Outside it — a transfer logged between visits, a
   transfer logged after the machine was finished — `transfer` stays available,
   because that is the case it exists for. The existing on-screen warning
   (interface refinement §7: *"Only for stock moved between visits…"*) stays for
   the finished-machine case, where the operator can still get it wrong and no
   rule can tell.

2. **Exclude a clamped period from the rate** (§3.4). This is the safety net
   for every double-count that already happened, and for the ones a rule
   cannot prevent. It cannot un-lose the sales, but it stops the bad period
   teaching the forecast.

**Rejected:** teaching the residual to recognise a transfer whose units are
already inside two after-counts. `known-gaps.md` is right that it cannot be
done — after the fact the two records are indistinguishable from a genuine
between-visits transfer, and guessing wrong corrupts a real one.

**Cost:** an operator who moves stock between two machines mid-run *and* wants a
ledger entry for it cannot have one at the source until the machine is
finished. That is the case that needs no entry.

### 4.3 `setAfter` does not add its key to `touched`

**Recommendation: leave it exactly as it is.**

By the field's literal definition — "true once the operator alters `before`" —
the current behaviour is correct, and `known-gaps.md` says so. The argument for
changing it was that Phase 3 would read the flag. **Phase 3 does not read the
flag** (§3.1), so the argument is gone.

Changing it now would make things worse, not better. The flag already has two
incompatible meanings on disk from the 2026-09-04 bug; adding a third era —
"and after this date it also means a typed after-count" — makes it *less*
interpretable by any future consumer, not more, in exchange for a benefit
nothing collects.

**What changes:** `known-gaps.md`'s bullet is updated from "Phase 3 reads
`touched`" to "nothing reads `touched` outside `src/ui/run/`", which is now a
statement about the code as it stands (`4cad94e`'s commit message confirms it)
and a rule this phase adopts.

### 4.4 "An untouched slot means seen and unchanged"

**Recommendation: keep the resolution, and stop depending on it.**

Phase 2 §3.3 resolved that an untouched slot reports zero sold, on the
operator's judgement that an untouched row means *seen and unchanged*. The cost
was recorded: if a whole tray is genuinely scrolled past, it reports zero
demand and "Phase 3's forecast will learn from it that nothing sells there".

That cost is now live. But the mitigation the gap file imagined — Phase 3
revisiting the question by reading `touched` — is unavailable (§3.1). So the
mitigation has to come from levels instead, and it can:

**A slot whose level has not moved across four consecutive periods, with zero
sales in all of them, is listed on the pick list under `Nothing expected`** —
with its name, its last level, and how long it has been still. Not an alert,
not a warning: a short list at the bottom of the load screen.

This is strictly better than reading `touched` would have been, for three
reasons. It is computed from levels, which are sound. It catches the genuinely
dead slot (a line nobody buys, waiting to be pulled) as well as the
never-counted one, and both deserve the operator's eye. And it degrades safely:
a dead slot correctly asks for nothing, and the list is how the operator
notices it is on there.

**The residual risk, stated:** a slot that sells but is never counted has a
level that never moves, so both the rate *and* the `capacity − level` fallback
ask for nothing. The operator is standing at the machine and can see it is
empty, and the ran-dry signal catches it the moment it is counted once. The
damage is bounded to one under-picked slot, which is the failure the fallback
was chosen to be conservative about in the first place.

### 4.5 The 2026-09-04 data caveat, stated as a rule

Everything above rests on one boundary, so it is written once, plainly:

> **`CountLine.touched` must not be trusted on any visit finalized on or before
> 2026-09-04.** Wherever `Fill tray to par` was used it was persisted `true` for
> slots nobody counted — always before 2026-08-28, and after that whenever a
> `⋯`-sheet save triggered a reload. Falsely-touched rows are indistinguishable
> from genuine ones, because a real per-slot Fill sets `touched: true` too.
> **No figure is affected:** `before`, `after`, the sales residual and the
> carried-forward levels are all sound, and none of them reads the flag.

Phase 3's response is §3.1: read levels, never the flag. The boundary date is
recorded so that if a later phase ever does want the flag, it knows where the
trustworthy data starts.

---

## 5. Domain model

### 5.1 `TrolleyLine` — the one new entity

Spec §4.1 defines it as *"per item: needed, taken, and whether the storeroom was
emptied"*. It needs three things the spec's one-line description omits: a run
key, timestamps, and the return.

```text
TrolleyLine {
  id             Id
  runId          Id
  itemId         Id
  needed         number      // the computed need at load time, SNAPSHOTTED
  taken          number      // units actually loaded, entered as boxes + loose
  noneLeftInG    boolean     // the shelf was empty after taking `taken`
  loadedAt       number      // when the load was recorded — the ledger's timestamp
  returned?      number      // units brought back; undefined until the run closes
  returnedAt?    number
  updatedAt      number
}
```

Indexes: `id, runId, [runId+itemId], itemId`.

**`needed` is a snapshot, and that is deliberate.** Everything else in this
codebase is derived at read time (§3.9), but a past run's pick list cannot be
recomputed — it depended on the levels and rates as they were before that run
counted anything, and the run itself destroyed them. Storing what was asked for
is what lets a past run explain why the trolley held what it held. It is a
record of a decision, not a cache of a calculation.

**`taken` and `returned` are in units**, always. Boxes + loose is an input
convention (spec §5.4), and `packs.ts` already converts. Nothing stores boxes.

**One row per `(runId, itemId)`**, upserted, matching how `putCountLine` works
on `(visitId, slotNumber, itemId)`. Re-typing the taken figure before leaving G
corrects the row rather than appending — the trolley is a working record of the
current load, not an append-only ledger. (The *ledger* consequence is derived
from the row's current value, so it corrects with it. This is the one place a
correction is an edit rather than an opposing entry, and it differs from
`Adjustment` deliberately: an adjustment records a movement that happened, a
trolley line records a state that is still true.)

### 5.2 `SalesLine` gains one derived field

```text
SalesLine {
  … existing fields …
  clamped   boolean   // the residual went negative and was clamped to zero
}
```

Derived, not stored — `SalesLine` is computed by `salesForPeriod` and written
nowhere (Phase 2 §3.1). It costs one boolean and one comparison, and it is what
§3.4's `residual-clamped` exclusion reads.

### 5.3 `PeriodReport` gains the opening run's date

`salesForRange` returns `PeriodReport` with `runDate` — the *closing* visit's
run date. The rate needs the period's **length**, which needs both ends.

```text
PeriodReport {
  … existing fields …
  previousRunDate   string | null   // the opening visit's run date
}
```

Already available inside `salesForRange` (it builds `previousFor` and has
`runById`); it is simply not returned today. Additive, no schema change.

**Days are calendar days between run dates, not milliseconds between
`finalizedAt` stamps.** Two reasons. The operator knows the run was Tuesday and
the one before was Friday — "3 days" is checkable, "3.19 days" is not. And
`finalizedAt` is re-stamped by a late edit (spec §7 as amended, and
`finalizeVisit` always re-stamps), so a correction made a week later would
silently stretch a period from 3 days to 10 and halve the slot's rate. A run
date cannot move.

`src/domain/date.ts` gains `daysBetween(from, to)`, parsing `yyyy-mm-dd` by
parts into a local `Date` exactly as `formatRunDate` already does — for exactly
the reason that file already documents at length.

---

## 6. The demand rate

`src/domain/rate.ts`. Pure: plain data in, plain data out.

### 6.1 The input

The rate consumes periods that have already been through the residual, one per
`(machine, slot)` per period, aggregated across the slot's items per §3.2:

```text
SlotPeriod {
  machineId      Id
  slotNumber     number
  runDate        string          // the closing run — orders the window
  days           number          // calendar days, ≥ 1
  sold           number | null   // slot total; null when there is no figure
  closingTotal   number          // slot total at the close — 0 means ran dry
  exclusion?     RateExclusion
}

RateExclusion = CensoredReason | 'ran-dry' | 'residual-clamped'
```

`CensoredReason` is imported from `src/domain/sales.ts` unchanged. There is no
second censoring vocabulary (§3.4).

### 6.2 The calculation

```text
usable   = periods, newest first, with no exclusion
window   = the first RATE_WINDOW (4) usable periods
rate     = Σ window.sold / Σ window.days        when window.length ≥ 2
         = null                                  otherwise
```

Spec §6.1's "fewer than 2 non-censored periods has no rate" is kept exactly.
`null` is not zero, and the two must never be conflated: zero means "this slot
sells nothing", null means "I don't know yet", and they produce different needs
(§7).

### 6.3 The output is an explanation, not a number

```text
DemandRate {
  rate               number | null
  unitsSold          number       // Σ over the window
  days               number       // Σ over the window
  periodsUsed        number
  excluded           { runDate: string; reason: RateExclusion }[]
}
```

Every field on that record exists to be shown. Spec §6.1's whole argument for a
mean over anything cleverer is that the operator has to trust the number, and a
number they cannot check is not trusted. The screen renders it as one line:

> `1.4 / day — 21 sold over 15 days, 4 periods. 2 skipped: 22 Aug ran dry, 15 Aug ran dry.`

### 6.4 How far back to look

`HISTORY_LIMIT = 4` in `src/data/repositories/visits.ts` carries a comment
saying four "is the window Phase 3's demand rate needs". **It is off by one, and
by more than one once censoring is counted.** Four visits bound three periods,
and any excluded period pushes the window further back still.

**Decision: the rate's repository reads a bounded search window of visits, not a
fixed count.** Twelve finalized visits per machine — about six weeks at a
Tue/Fri cadence — which yields eleven candidate periods to find four usable
ones in. If a slot cannot find two usable periods in six weeks it has no rate,
which is the honest answer for a slot that has been dry or unreconciled for
that long.

`HISTORY_LIMIT` keeps its current value and its current job (the counting
screen's carry-forward); its comment is corrected. The rate's window is a
separate constant, `RATE_SEARCH_VISITS = 12`, in the repository that uses it.

---

## 7. Projection, need, and the pick list

`src/domain/forecast.ts` and `src/domain/pick.ts`.

### 7.1 Need per slot

Spec §6.2, unchanged in substance:

```text
daysSince = calendar days from THIS MACHINE's last finalized visit to the
            planned run date
projected = rate === null ? lastLevel
                          : max(0, lastLevel − rate × daysSince)
need      = clamp(ceil(capacity − projected), 0, capacity)
```

Three things worth stating:

**`daysSince` is per machine, not per run.** A machine skipped last Friday has
been drawing down for a week while its neighbours have had three days. Spec
§6.2 says "days since last run", which is right for the common case and wrong
for a skipped machine — and skipped machines are exactly the ones most likely
to be empty. The period pairing already works this way (Phase 2 §5.1: "a
machine skipped in one run has a period spanning two"), so this is consistency,
not novelty.

**The no-rate fallback is the same formula, not a branch.** With `rate === null`
the projection is the last level, so `need = capacity − lastLevel` — spec
§6.1's stated fallback, "which assumes nothing sold", falling out of one
expression. One formula is one thing to test and one thing to explain.

**`ceil`, deliberately.** The projected level is fractional and the need must be
an integer. Rounding up over-picks by at most one unit per slot. Spec §6.1 is
explicit about which way to err: "over-picking costs trolley space while
under-picking costs a trip down fifteen floors".

### 7.2 Resolving needs to items

Per spec §6.2, and per §3.7 above:

```text
for each slot with need > 0, in walk order (level, then slot number):
    item = first entry of slot.accepts whose ledger balance > 0
    if none → the need is UNFULFILLABLE and is listed as such
aggregate need per item → the pick list
```

An unfulfillable need is not dropped silently. It is the clearest possible
statement of a lost sale — a slot that wants stock the storeroom does not have
— and it feeds §10's order suggestion directly.

### 7.3 What the pick list shows

One row per item, with its workings on the row:

```text
Coke                                            need 18   [ 0 ][ 18 ]  [NONE]
5 slots · 1.4/day avg · 3 days · 1 box + 6
```

and, per §4.4, a short `Nothing expected` list at the foot: slots with a rate of
zero and no level movement across four periods.

---

## 8. Allocation

`src/domain/allocation.ts`. Runs only when `taken < needed` for some item.

Spec §6.2's ranking, unchanged:

1. Slots that **ran dry in the previous period** first — proven unmet demand.
2. Then by **demand rate**, descending.
3. Fill each slot to capacity in rank order until the trolley is exhausted.
4. **Display the cut line**, so the operator sees which machines go short.

Three details the spec leaves open:

**The tiebreak is walk order** — level ascending, then slot number ascending.
It has to be deterministic for the arithmetic to be testable, and walk order is
the one the operator can read: the cut line becomes "everything from L12 up
goes short", which is a sentence about their afternoon.

**The slot at the cut line gets a partial allocation** — `min(need, remaining)`
— rather than being skipped to preserve the fill-to-capacity rule. Leaving
units on the trolley to honour a rule helps nobody, and the operator is going to
put them in the machine anyway.

**A slot with no rate ranks last** among non-dry slots, not first. `null` is not
a high rate and it is not a zero rate; a slot nobody has data for should not
outrank a slot known to sell four a day. It still gets its fallback need, and
it still gets served if anything is left.

**Allocation is advisory and every number is overridable** (spec §6.2). It
writes nothing (§3.9). Its entire job is to surface the trade-off at G rather
than on level 12.

---

## 9. Trolley watch

`src/domain/trolley.ts`, spec §6.3.

**What is left on the trolley is derived, never decremented in a stored
field:**

```text
remaining(item) = taken − Σ (line.after − line.before)
                  over every count line of this run for that item
```

The sum is signed on purpose. A positive `after − before` is stock that came
off the trolley into the machine; a negative one is stock pulled *out* of a
machine and onto the trolley, which is exactly how spec §3.2 says an intra-run
redistribution records itself. The trolley figure follows both directions for
free.

Spec §6.3 says the balance "decrements with each `Fill`". **That is no longer
true of the app**, and following it literally would give a wrong figure: since
the after-count became editable (spec §3.2 as amended, 2026-08-27), a refill can
be recorded by typing a number with no Fill tap at all, and `Fill tray to par`
sets a whole tray at once. Deriving from `after − before` covers every path,
including ones that do not exist yet.

**Naming the level it runs out at:**

```text
for each machine still uncounted, in level order:
    expected draw = Σ need over that machine's slots resolving to this item
    running total += draw
    if running total > remaining → this machine's level is where it runs out
```

The needs are recomputed against current levels each time the watch renders,
so the estimate sharpens as the run proceeds — a machine that turned out fuller
than projected pushes the run-out level up, correctly, and the watch is quiet
again.

Displayed as one line, only when a shortfall is predicted: `Coke runs out at
L11 · 6 left`. Never a modal, never a block — spec §7 names step 4 the
latency-critical path.

---

## 10. Order suggestion

`src/domain/order.ts`, spec §6.4.

```text
horizon   = 7 days   (default, editable)      — D2
safety    = 3 days   (default, editable)      — D2
rate(item)= Σ rate over slots whose accepts[0] is this item        (§3.8)
forecast  = rate(item) × (horizon + safety)
suggested = max(0, forecast − storeroom on hand)
boxes     = ceil(suggested / boxSize)
```

**Why machine stock is not subtracted**, since the formula looks like it should
be: the machines are full at the start of the horizon and drain over it, and
every unit that drains is replaced from the storeroom. So the storeroom must
supply the whole horizon's sales regardless of what is currently sitting in the
machines. Spec §6.4 has this right; it does not say why, so it is recorded
here before someone "fixes" it.

**Boxes are real now.** Forty-six of the sixty catalogue items carry a
transcribed carton size (`src/data/packageSizes.ts`, backfilled on app start).
The remaining fourteen are loose sundries at `boxSize: 1`, where `packs.ts`
degrades to plain units and the order reads in units. Nothing special-cases
them.

**Highlighting**, per spec §6.4: items whose slots ran dry, and items flagged
`None left in G`, are marked — "these are the ones actively costing sales".
Unfulfillable needs from §7.2 join them, because a slot that wanted stock that
was not there is the same signal arriving one step earlier.

**What this deliberately does not do:** nothing records that an order was
placed, so nothing subtracts stock-on-order from the next suggestion. Two runs
before a delivery arrives will each suggest the same order. This is a real
limitation and it is out of scope (§2) — modelling a purchase order means
modelling its lifecycle, and the operator can see their own outstanding order.
It is stated here so it is a known boundary rather than a surprise.

---

## 11. The storeroom balance gains the trolley

Spec §6.5, and the gap `known-gaps.md` has been holding since Phase 2.

```text
balance(item) = last verified manual count
              + Σ storeroom adjustments occurring after verifiedAt
              + Σ trolley movements occurring after verifiedAt
```

where a trolley line contributes `−taken at loadedAt` and, once returned,
`+returned at returnedAt`. Both go through `storeroomMovements` so
`ledgerBalance` keeps one implementation (§3.5).

**The `None left in G` interaction is load-bearing and is tested explicitly.**
The flag writes an anchor of 0 stamped at `loadedAt`; `ledgerBalance` excludes
movements at exactly `verifiedAt`; so the same instant's `−taken` is correctly
not applied twice, and the balance reads 0. Get the boundary wrong and it reads
`−taken` clamped to 0 — the same answer, by accident, until a delivery arrives
that afternoon and the two diverge.

**The return reconciliation** (D6): the load screen in return mode shows what
the trolley arithmetic predicts is left beside what the operator counted. A
difference is displayed in `accent-700` and offers one action — log it as
`missing` at the storeroom, which is an ordinary adjustment through the
existing sheet. The app never writes it silently: an unexplained difference is
information, and hiding it inside a balance is how a ledger stops being
trusted.

---

## 12. Screens

Tokens are `docs/design/tokens.md` and are assumed: **zero radius, one accent
per screen, rules not borders, flush left, tabular figures in every column that
has to align.** The interface refinement of 2026-08-28 owns the existing
layouts and none of them is redesigned here.

### 12.1 New: Load trolley — `src/ui/trolley/TrolleyScreen.tsx`

A **nested screen under Machines**, not a fifth nav tab. The nav stays at four
(Phase 2 §7.2's rule, and there is no room on a phone for a fifth).

`App.tsx`'s `Screen` union gains `{ name: 'trolley'; runId: Id; mode: 'load' |
'return' }`, with the active tab deriving to `'machines'` exactly as `count`
and `machine-map` already do.

Reached from the Machines footer: `Load trolley` where `Start run` sits today,
before any machine has been counted. Once machines are counted the same footer
slot offers `Return leftovers`.

Header (`ScreenHeader`): back affordance `← MACHINES` at 11px/600 uppercase
`neutral-600`; title `Load trolley`; figure `12 / 46` items with a taken figure.

The list, one row per pick-list item:

```
grid-template-columns: 1fr 56px 96px 44px;   /* ITEM  NEED  TAKEN  NONE */
padding: 10px 16px;  1px rule-light between rows
```

- **Ink header row**, 9.5px/700 uppercase, sticky under the tab bar:
  `ITEM · NEED · TAKEN · NONE`.
- **Item** — name 13.5px/600; beneath it at 11px/500 `neutral-700`, the
  workings: `5 slots · 1.4/day · 3 days · 1 box + 6`. This line is the whole
  explainability requirement in one place: every figure on the row is derived
  from something printed beside it.
- **Need** — 19px/800 tabular.
- **Taken** — the boxes + loose control, lifted out of `StoreroomScreen.tsx`
  into `src/ui/components/QuantityField.tsx` so both screens share one
  implementation. It already degrades to a single units field at `boxSize: 1`.
- **None** — a toggle, ink fill when on (a selected state is ink, not accent —
  interface refinement §7's ruling). A row with `None left in G` set carries the
  4px accent inset, the app's one edge mark, which already means "ran dry,
  in progress, never verified" and now also means "the shelf is empty".
- **`Nothing expected`** (§4.4) as a `surface` section bar at the foot, with its
  slots listed at 12.5px/500 `neutral-700`.

Footer, `border-top: 2px rule-strong`, both flush left:
`Take the trolley up` (accent fill, ground text — the screen's one accent) and
`Back` (ground, `neutral-700`).

### 12.2 New, inside the same screen: allocation

Shown only when some item's `taken` is short of its `needed`. An `accent-200`
band above the footer, `accent-800` text:

> 3 items short — 11 slots go without. **See who.**

Tapping expands a section below the list, separated by a 2px `rule-strong`:

```
grid-template-columns: 30px 26px 1fr 44px;   /* LV  SL  ITEM  UNITS */
```

Served slots in rank order, then a `surface` bar carrying the cut line at
9.5px/700 uppercase — `CUT LINE · NOTHING BELOW IS COVERED` — then the unserved
slots on a `neutral-100` fill with `0` in the units column. Not greyed out:
disabled opacity is for controls, and these rows are information.

### 12.3 Changed: the count screen — trolley watch

One line, `surface` fill, `accent-700` text at 11px/500, directly beneath the
sticky column header, rendered only when a shortfall is predicted:

> `Coke runs out at L11 · 6 left`

Deliberately **not** an accent fill: the count screen's colour budget is spent
on `Finish machine`, and a red band above a 54-row table is the noise the
interface refinement removed once already (§3.5 of that document). Nothing else
on the counting path changes — no new taps, no new fields, no new queries
during the walk.

### 12.4 Changed: the report — the `Order` column and a new section

`StockMatrix` gains one optional prop, `orderByItem?: Map<Id, string>`. Absent,
it renders the blank tinted cell exactly as today; present, it prints the
figure. The accent header and `accent-100` fill stay — the column is still
visually the operator's, and D7's toggle blanks it for a run where they would
rather write.

Below the sales lines, a new `Order` section on the report page:

- **Horizon** and **Safety** as two figure cells on 2px ink underlines, the
  same pattern the `From` / `To` dates already use — 15px/700 tabular, no
  boxes.
- A table, ink header:
  `grid-template-columns: 1fr 44px 44px 54px;  /* ITEM  /DAY  ON HAND  ORDER */`
- `ORDER` reads `2 × 24` where a carton size is known, plain units otherwise.
- A row for an item that ran dry, was flagged `None left in G`, or had an
  unfulfillable need carries the 4px accent inset.

### 12.5 Changed: the storeroom

No structural change. One addition to the metadata line beneath each item name,
while a run's trolley is loaded and not yet returned: `On the trolley · 6`, at
11px/500 `neutral-700`. The `App estimate` column now includes trolley
movements, which is the whole point of §11 and needs no new column to say so.

### 12.6 Changed: the machines list

The footer's third state. Today: `Start run` when no run exists, `Continue L4 →`
when one is in progress. Now: `Load trolley` when a run exists but no machine
has been counted, and `Return leftovers` when every machine that is going to be
counted has been. The eyebrow gains the trolley state where there is room —
`RUN · FRI 4 SEP · TROLLEY LOADED`.

---

## 13. Migration — schema v4

**One new table. Nothing existing is altered, and no row is rewritten.**

```text
db.version(4).stores({
  … every v3 table, redeclared verbatim …
  trolleyLines: 'id, runId, [runId+itemId], itemId',
})
```

No `.upgrade()` function at all. There is no field to backfill and no
derivation to run, because before v4 there were no trolley loads to record —
unlike v3, which had to backfill `price` onto every existing count line.

| Change | Kind |
| --- | --- |
| `trolleyLines` table | Additive |
| Every other table's indexes | **Unchanged**, redeclared because Dexie requires the full index list per version |
| Existing rows | **Untouched.** Zero rows read, zero written by the upgrade |
| `StoreroomBalance` rows written by `None left in G` | Ordinary writes through the existing repository, not a migration |

**This is the least dangerous migration of the three.** v2 rewrote every count
line to derive `filled`; v3 rewrote every count line to backfill `price` and was
the first to run against real data. v4 rewrites nothing.

### 13.1 Rollback — say it loudly

**The data stays safe. The bundle does not.**

Because the migration touches no existing row, a database that has been through
v4 holds exactly the rows a v3 build wrote, plus one new table a v3 build does
not know about. Nothing is lost, and nothing is reinterpreted.

**But reverting the bundle is not safe, and this section first said why
incorrectly. Corrected 2026-09-07, against the installed source.**

The original claim was that a v3 build "cannot open a v4 database at all,"
because IndexedDB refuses to open a database stored above the requested
version and Dexie surfaces that as a `VersionError`. The first half is true of
raw IndexedDB. The second half is false: **Dexie does not surface it.** It
catches the `VersionError`, retries with no version at all, finds the installed
schema is not the one it declares, and patches its missing tables and indexes
into the newer database in place (`node_modules/dexie/dist/dexie.js:4599`,
Dexie 4.4.5).

So reverting does not fail loudly. The old build comes up **looking healthy,
running on the newer build's stores**, with nothing announcing it — which is
worse than a refusal, because a refusal is legible and this is not. It is also
why `src/backup/import.ts` deletes the database rather than clearing its
tables: clearing would run through that patched hybrid connection and restore
into it, leaving the newer stores underneath. Pinned by a test —
`src/backup/import.test.ts`, "is needed because reopening the newer database
silently patches it instead".

This is not new to Phase 3 — it was equally true of v2 and v3 — but it has
never been stated, and the 2026-08-31 handover's "rollback is safe" was true
only because that round did not move the schema. It must not be read as a
general property.

**Two consequences for the plan:**

1. **The backup export lands before the migration** (D1, §14). It is the only
   thing that makes the door two-way: with a JSON bundle on the phone, a
   revert costs a re-import, and without one it costs the operator's history.
2. **The handover must say this in the operator's words**, in place of the
   "rollback is safe" line the last two handovers carried.

---

## 14. Data safety — the export that does not exist

Spec §8.5 lists four data-safety measures. Three are built. The fourth —
*"Export/import bundle (JSON plus photos) available manually at any time"* — is
not, and `src/backup/` does not exist. Spec §8.3 reserves the directory for it.

That has been acceptable while the schema stood still. It stops being
acceptable the moment it moves, so this phase builds the export half (§2 states
why the import half is not in scope).

**What it is:** one function that reads every table into a plain object and
hands the browser a downloadable JSON file, plus a button on the storeroom
screen (the app's existing "desk work at G" screen). One file, no new
dependency, no new schema.

```text
src/backup/export.ts
  exportBundle(): Promise<Bundle>       // every table, plus schemaVersion and exportedAt
```

`schemaVersion` is stamped into the bundle, because a JSON file that does not
say which schema wrote it is a puzzle rather than a backup.

**The operator instruction that goes with it**, in the handover: *export once
before you open the new build.* That single step converts §13.1's one-way door
into an inconvenience.

---

## 15. Testing

Per spec §9, and following what the codebase already does.

**Domain purity, extended.** `src/domain/purity.test.ts` keeps failing the build
on Dexie/React imports. This phase adds the §3.1 guard: **no file created by
this phase under `src/domain/` may contain the identifier `touched`.** A grep
in a test, asserting an empty list of offenders, exactly like the import check
beside it.

**The demand rate** is unit-tested against every rule in spec §6.1:

- Four clean periods produce `Σ sold / Σ days`, and the figure is checkable by
  hand from the test's own numbers.
- A period whose slot total closed at zero is excluded, **and a mixed slot with
  one item at zero and stock in the other is not** (§3.2).
- A period whose residual clamped is excluded (§3.4), with the reason reported.
- Fewer than two usable periods yields `null`, not zero — and the two produce
  measurably different needs downstream.
- Exclusions are reported with their reasons, because the screen renders them.
- **A period is not stretched by a late edit**: re-finalizing a visit a week
  later must not change the period's length (§5.3).

**Need and projection:**

- The no-rate fallback equals `capacity − lastLevel` exactly, through the same
  formula as the rate path.
- `daysSince` runs from **this machine's** last visit, so a machine skipped one
  run projects a longer drawdown than its neighbours (§7.1).
- `need` never exceeds capacity and never goes negative, including when the
  last recorded level is above capacity — which is reachable, because the count
  cells deliberately do not clamp.

**Allocation** (spec §9 names this): ran-dry beating a higher rate; the walk-
order tiebreak; the partial allocation at the cut line; a no-rate slot ranking
below a rated one; and the total allocated never exceeding what was taken.

**Order quantity**: rounding to box size, at a real carton size and at
`boxSize: 1`; a negative suggestion floored at zero; and — the §3.8 case —
**a slot accepting two items contributing its rate to exactly one of them**,
which is the test that would have caught the spec's formula.

**The trolley:**

- `remaining` follows a negative `after − before` (stock pulled onto the
  trolley), not just refills.
- The run-out level is named correctly, and is silent when nothing runs short.
- `None left in G` leaves the balance at **0**, not at `−taken` clamped to zero,
  and a delivery logged that afternoon takes it to the delivered figure rather
  than to `delivered − taken` (§11).
- The ledger with trolley movements agrees with the ledger without them when no
  trolley line exists — the Phase 2 behaviour must be unchanged for every
  historical run.

**The v4 upgrade is tested through the full v1→v2→v3→v4 path**, with data
written through the older schema *first* and the newer one opened *second*.
This is the pattern `5f6defc` established and Phase 2 §10 insisted on, and the
assertion here is specifically that **every pre-upgrade row survives byte for
byte** — v4 rewrites nothing, so a test that finds anything changed has found a
real defect.

**The export** is tested to round-trip every table's row count and to carry the
schema version, and to survive an empty database.

**End-to-end, one happy path** (spec §9's, now finally buildable): start a run,
load a trolley short on one item, count and fill three machines, finalize, and
assert the sales figures *and the order suggestion*.

---

## 16. What spec §6 gets wrong

Recorded because the spec is the authority, and a reader who finds this document
disagreeing with it deserves to know it was deliberate. Each of these is a place
§6 was written before the code existed and is wrong against the code as it
actually is.

1. **§6.4's forecast double-counts shared slots.** `Σ over slots accepting this
   item` counts a two-item slot in both items' forecasts. Corrected in §3.8 by
   attributing each slot to `accepts[0]`.

2. **§6.1 measures the rate per slot but the residual is per `(slot, item)`.**
   The spec never names the aggregation step. §3.2 specifies it, and specifies
   that censoring is on the slot total — which is §6.1's own wording, but not
   what `SalesLine.ranDry` reports.

3. **§6.2's "days since last run" should be days since *this machine's* last
   visit.** A skipped machine has been drawing down longer than the run
   interval, and skipped machines are the ones most likely to be empty. §7.1.

4. **§6.1's four-period window needs a search, not a fixed history depth.** Four
   visits bound three periods, and every exclusion pushes the window further
   back. `HISTORY_LIMIT = 4`'s comment claiming it is the window Phase 3 needs
   is wrong; §6.4 specifies a bounded search instead.

5. **§6.3's "the trolley balance decrements with each `Fill`" is obsolete.**
   Since spec §3.2 was amended on 2026-08-27 the after-count is typed directly
   and `Fill tray to par` fills a whole tray, so Fill is no longer the only path
   — or even the common one — by which stock leaves the trolley. §9 derives the
   balance from `after − before`, which covers every path.

6. **§4.1's `TrolleyLine` has no run key and no timestamps.** It cannot be
   attributed to a run or placed in the ledger's anchor arithmetic without them.
   §5.1 adds `runId`, `loadedAt`, `returned`, `returnedAt`.

7. **§6.5 does not say what "known to be out" means** when the balance it reads
   is an estimate. §3.7 defines it as a ledger balance of zero, and refuses to
   ration against the estimate beyond that binary.

8. **§8.5's export/import bundle does not exist**, and §8.3's `backup/`
   directory has never been created. Not a §6 error, but it is the one place
   the spec describes a safety net that is not there — and this is the phase
   that needs it (§14).

None of these changes what the app is for, and none of them is a licence to
depart from §6 elsewhere.

---

## 17. Recorded for `known-gaps.md`

To be added or updated when this phase lands:

- **`touched` is untrustworthy on visits finalized on or before 2026-09-04**,
  and nothing outside `src/ui/run/` reads it. The trust boundary is recorded so
  a later consumer knows where sound data starts (§4.5).
- **`miscount` is retired as an operator-facing reason** (§4.1), closing the
  bullet that has been open since 2026-08-28. The enum value and its
  `entersResidual: false` remain for historical rows.
- **`transfer` is withheld at a slot while that machine's visit is open**
  (§4.2), closing the redistribution double-count bullet for the case a rule
  can prevent, and leaving the on-screen warning for the case it cannot.
- **`setAfter` still does not add to `touched`, and that is now final** (§4.3) —
  the flag has no consumer to serve.
- **Schema v4 is a one-way door for the bundle** (§13.1), as v2 and v3 were.
  The export (§14) is the mitigation, and the note replaces the "rollback is
  safe" line the last two handovers carried.
- **The order suggestion does not know what has already been ordered** (§10).
  Two runs before a delivery lands will suggest the same order twice.
- **`SlotConfig.accepts` cannot be reordered**, which now costs two things
  rather than one: Fill loads the outgoing line during a changeover, and the
  order forecast attributes the slot to it (§3.8). D10 proposes the fix.
- **Import is not built** (§2). The export bundle is readable JSON and a
  recovery is a hand operation.

---

## 18. Open questions

None in this document beyond the thirteen in §0, which are the operator's to
settle and are collected there rather than scattered through the sections that
depend on them.
