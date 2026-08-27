# Handover — 2026-08-27

Written at the end of the day before the first real restock run.

**Live:** https://vending-stock-manager.pages.dev
**Branch:** `main`, clean. 281 tests passing, build clean, schema at version 2.

---

## Do these before counting tomorrow

**1. Clear the app's data and re-seed.** Tonight's testing left finalized visits
holding a recorded `0` on every empty slot. Tomorrow those machines will flag
`RAN DRY` on rows nobody really counted, and they will seed tomorrow's
before-counts from test numbers.

Browser settings → clear site data for the domain → reopen → **Items → Load
starter catalogue**. One tap restores all 60 items and 15 machines.

You will lose the tweaks made while testing — the par of 10 on slot 28, and
`test-items`. Both want redoing anyway.

**2. If you would rather not clear**, at minimum delete `test-items`. It is a
*base* placement on slot 50, so it is a phantom mixed slot on all fifteen
machines and it competes for Fill's preferred-item position on every one.

**3. Refresh once before you start.** The service worker may serve last night's
bundle until it updates.

---

## What it can do

- **Catalogue** — 60 items with slot, price, size, par, box size, remark. All
  editable. Grouped by tray with a search box.
- **Machines** — L2 to L16, created by the seed. Machines finished in today's run
  are marked. No add, no delete: the roster is fixed.
- **Counting** — one screen per machine, six tray tabs. Every slot opens at what
  you left it at last visit; touch only what changed. Fill tops a slot to
  capacity and now **shows the after-count** beside the before-count. Empty slots
  flag `RAN DRY`. Correct the map in place with `⋯`, including per-slot capacity.
- **Storeroom** — manual count of every item in plain units, with search and a
  last-verified stamp.

Everything persists on every tap. There is no Save button anywhere; that is
deliberate.

---

## What will look odd during the run

None of these lose data. Listed so they do not surprise you on level 7.

- **A mixed slot's fill split is shown but not editable.** If you load 2 Fanta
  and 3 Sunkist, the app assumes its own split and you cannot correct it.
- **A failed write is silent.** The number snaps back with no message. Rare, but
  if a number will not stick, that is why.
- **`boxSize` is 1 for everything**, so the storeroom counts in plain units. Set
  real carton sizes when you know them and pack entry becomes worth adding.
- **The bottom nav sits under your scrolling thumb.** Hitting it mid-count loses
  nothing — the screen restores from the draft — but it is jarring.
- **Deleting a machine is impossible by design**, so a mis-seeded machine needs a
  data clear. Deleting items still works.

Full list with reasoning: `docs/known-gaps.md`.

---

## What today changed

Started with Phase 1 merged and no data. Ended deployed, seeded and device-tested.

- Catalogue seeded from the paper stock sheets — 60 items, prices from the
  laminated map, mixed slots recorded. Transcription in
  `docs/catalogue-transcription.md`; all 60 rows were verified against it
  byte-for-byte.
- Schema v2: `filled` stored rather than inferred, `visits.machineId` indexed,
  `storeroomBalances` added. Done deliberately while there was no data to migrate.
- Storeroom counting built — Phase 2 arriving early because tomorrow needs it.
- Deployed to Cloudflare Pages. **HTTPS is a hard requirement**, not a nicety:
  `crypto.randomUUID()` only works in a secure context, so over plain HTTP the
  first save would throw and a whole machine's count would vanish.
- Thirteen screenshots from your device test turned into
  `docs/fix-plan-2026-08-27.md` and then into fixes.
- Spec §7 amended: finishing a machine is a marker, not a lock.

### The two worth remembering

**Fill recorded a number the screen never showed.** `after` was computed and
persisted correctly but rendered nowhere, so tapping Fill only changed a button
colour — on every slot, not just mixed ones. You would have left a machine with
5 packets in slot 11 and the screen insisting there was 1.

**The run date was computed in UTC.** At `+0930`, any run started before 09:30
local resolved to the *previous* day. Tomorrow at 08:00 that would have returned
today's run and today's finalized visits. Until yesterday that failed loudly —
but the §7 amendment removed the very guards that made it fail, so tomorrow's
counts would have been silently written over tonight's test data under the wrong
date. Two individually reasonable changes, dangerous only in combination, and
only a whole-diff review caught it.

---

## Next

**Order agreed:** clear the known gaps, then Phase 2 properly.

Phase 2 is the storeroom ledger (trolley loads, deliveries, adjustments with
reason codes), the sales residual, demand rates and the pick list. The manual
storeroom count built today is the first slice of it, built early and out of
process because of the deadline — the rest goes through spec, plan, then
implementation.

**Parked, with notes already written:**

- **The PDF stock sheet report** — `docs/superpowers/specs/2026-08-27-stock-sheet-report-notes.md`.
  Decided: generated on the phone, no server; one row per item with the slot as
  locator (`52-1 Sunkist`, `52-2 Fanta`). Open: whether to ship with `Order` and
  `GF` blank for hand-writing, or wait for Phase 2 to fill them.
- **Tier 3 of the fix plan** — nav position, slot picker, editable machine map.
- **The open design question** in `docs/known-gaps.md`: whether Phase 2 should
  distinguish an untouched slot's `CountLine` from a counted one. It has to read
  `touched` to tell "confirmed unchanged" from "carried forward unseen".

**Worth doing early next session:** two tests give false confidence. The
`machineId` index test writes its data *after* the upgrade, so it would pass even
if the backfill silently failed — and if that ever did fail, every slot would
seed at 0 and finalize would overwrite your carried-forward levels. The code is
right; only the tests are weak. Details in `docs/pre-run-fixes-report.md`.

---

## Where things are

| What | Where |
|---|---|
| Design spec (authority) | `docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md` |
| Decisions and reasoning | `docs/decisions.md` |
| Known gaps | `docs/known-gaps.md` |
| Catalogue transcription | `docs/catalogue-transcription.md` |
| Device-test fix plan | `docs/fix-plan-2026-08-27.md` |
| Device-test screenshots | `devs/debug/` |
| Report feature notes | `docs/superpowers/specs/2026-08-27-stock-sheet-report-notes.md` |
| Implementation reports | `docs/*-report.md` |

---

## One process note

Two implementation agents were run concurrently in the same working tree tonight.
Their git operations collided twice. Nothing was lost — verified against the
reflog and blob hashes rather than the agents' own accounts — but it was avoidable
and cost time to prove. Implementers get one working tree each, or run one at a
time.
