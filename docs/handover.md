# Handover — 2026-09-07

Supersedes the handover of 2026-08-31. That one covered eight screens of
interface work. This round built **Phase 3 — Decide**: the demand rate, the
pick list, the trolley, allocation and the order suggestion. It also moved the
schema for the first time since Phase 2.

**On `main`, merged and deployed.** 825 tests passing at the close of the
round, `tsc` clean, `vite build` clean.

---

## 1. Correcting what the last two handovers told you

Both said **rollback is safe**. That was true of those rounds, because they did
not move the schema. It is not a general property, and the reason it fails is
not the one I first gave you.

Here is what actually happens. Your data is never lost or rewritten — a v4
database holds exactly the rows a v3 build wrote, plus one table it does not
know about. But if you ever go **back** to an older build, it does not refuse
to open your database and it does not warn you. It opens it, quietly adds the
tables it expects, and carries on **looking completely normal while running on
the newer build's data**. Nothing tells you. That is worse than an error
message, because an error you would notice.

So the rule is now:

> **Export a backup before you install a new build.** One tap at the foot of
> the storeroom screen. If a build ever goes wrong, `Confirm restore` on that
> same screen puts your data back — it wipes and rebuilds the database rather
> than writing on top of it, which is the only way a restore is really a
> restore.

You did this on 5 September before the schema moved: 3,194 count lines, 53
visits, 6 runs. Keep that file. Take a new one before the next build.

---

## 2. Getting a new build is not as simple as refreshing

The app keeps serving its cached copy. On 7 September a change I had deployed
did not appear after a normal refresh, and I nearly reported a working feature
as broken — the file was on the server the whole time.

**If something I said I fixed is not there, this is the likely reason, not a
failed deploy.** Close the app or the tab completely and reopen it, rather than
pulling to refresh. This is worth fixing properly — the app could simply tell
you when a new build is waiting — and it is not built yet.

---

## 3. What is new

**Load the trolley.** The machines screen's bottom button now follows the run:
`Start run`, then `Load trolley`, then `Continue L7` while a machine is open,
then `Return leftovers` at the end. The load screen lists what each item needs,
with `Taken` defaulting to whole boxes where a carton size is known, and a
`None left in G` toggle for an empty shelf. If what you took will not cover
everything, a band appears naming which machines go short and where the line
falls. It writes nothing until you commit it.

**The `Order` column fills itself.** It has been blank since Phase 2, waiting
for this. `1 × 21` means one box of twenty-one. A toggle blanks it again for a
run where you would rather write. Where it comes from:

1. Each slot's rate — units a day, averaged over the last 4 periods, throwing
   out any period where the slot hit zero (sales while empty understate demand).
2. Added up per item, counting each slot only for the item it is set to first.
3. Multiplied by 10 days (7 to cover, 3 spare — both editable on the report).
4. Minus what the storeroom ledger says is on the shelf.
5. Divided by the carton size, rounded up.

**Machine stock is deliberately not subtracted.** A slot showing 73 units still
asks for a box, because the machines drain over those ten days and are refilled
*from the storeroom* — the storeroom has to cover the whole period regardless.

**Expect it to look thin for a run or two.** A slot needs two clean periods
before it has a rate, and six runs across fifteen machines is not many. An item
with no rate shows **blank, not zero** — zero would read as "order none", which
is the wrong instruction for a slot that simply lacks history.

**`MAKE FIRST`.** On a slot's `⋯`, you can now set which item that slot prefers.
This matters more than it looks: the order forecast credits a slot's whole
demand to its first item, so during a changeover the outgoing product gets
ordered and the incoming one does not, until you change it. It also fixes Fill
loading the line you are trying to drain.

**Lists sort by slot number**, and tray sections fold away — on Items, the
storeroom, the report and a run's receipt. A folded tray says how many rows are
hidden, so it never reads as empty.

**Two reasons changed.** `Miscount correction` is gone from the adjustment
sheet: it wrote a row nothing ever read. A wrong count is fixed by re-opening
the machine and typing the right number, and a wrong shelf figure by a manual
count. And `Transfer` is no longer offered at a slot while you are counting
that machine today — moving stock during a run is already recorded by the two
counts, and logging it as well subtracted it twice.

---

## 4. What to watch on the next run

Nothing here has met a machine. Everything was checked by tests and in a
browser, and the two faults you found this week — the clipped `Order` header
and the wall of red — were both invisible to 800-odd tests and obvious in a
photograph.

Most worth your judgement:

- **The load screen**, against how you actually load. It assumes one load
  covering all fifteen machines. If you routinely go back down to G, that
  assumption is wrong and the allocation matters much less than the watch would
  have.
- **Whether `Return leftovers` earns its keep.** Counting what comes back turns
  the return into a free check on the machine counts. If it is a nuisance, the
  alternative is one button that trusts the derived figure.
- **Whether the order figures are believable** on items you know well.

Write problems down with a screenshot, as before. It has worked every time.

---

## 5. One thing that was built and taken out again

The trolley watch — a line telling you which level an item runs out at — was
built, shipped, and removed on 7 September after you photographed it. It was
supposed to be one line; it printed one per short item, and because your
trolley had nothing on it, every item qualified. Twenty-eight lines covering
the count table.

The arithmetic behind it is kept and still tested. It needs two decisions
before it comes back: how many lines it may ever show, and what it should say
when the trolley was never loaded. Say if you want it.

---

## 6. Known limits worth carrying

- **`touched` is unreliable on visits finalized on or before 4 September** — a
  bug fixed that day recorded "counted" for slots nobody counted. No figure was
  affected; the forecast deliberately reads this flag nowhere.
- **The order suggestion does not know what you have already ordered.** Two
  reports before a delivery will ask for the same cartons twice.
- **The pick list is empty while the storeroom ledger is.** It only offers
  items the storeroom is recorded as holding, so a shelf figure of zero reads
  as "nothing to take".

The full list, with reasoning, is `docs/known-gaps.md`.

---

## Where things are

| What | Where |
|---|---|
| This round's report | `docs/phase-3-report.md` |
| Phase 3 design (13 decisions in §0, spec defects in §16) | `docs/superpowers/specs/2026-09-04-phase-3-decide-design.md` |
| Phase 3 plan | `docs/superpowers/plans/2026-09-04-phase-3-decide.md` |
| Design spec (original authority) | `docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md` |
| Design tokens | `docs/design/tokens.md` |
| Known gaps | `docs/known-gaps.md` |
| Decisions and reasoning | `docs/decisions.md` |

## For whoever picks this up next

1. **Nothing in Phase 3 has been used on a real run.** That is the top item.
2. **The app cannot tell the operator a new build is waiting.** Until it can,
   "refresh once" is unreliable advice and a shipped fix can look like it never
   landed.
3. **jsdom does not lay out.** Both defects the operator found this week were
   width and volume problems that every test passed. Anything that changes what
   a column holds needs looking at, not just asserting.
