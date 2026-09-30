# Known gaps

Things deliberately not built or not fixed, with the reasoning. Recorded so they
are recognised as decisions rather than rediscovered as surprises.

Carried out of the Phase 1 execution ledger before its workspace was deleted.

---

## Deferred features

**No error surface for a rejected write.** `CountScreen` swallows rejections with
an empty catch. After a rollback the displayed number reverts with no
explanation, and a genuine finalize failure navigates away as if it had
succeeded, leaving the visit a draft. No data is lost — the batch is atomic and
`finalizeVisit` is never reached — but the failure is invisible.

---

## Smaller items

- **Fill fights a product changeover in a mixed slot.** A slot's preference
  order comes from `SlotConfig.accepts`, and anything not already listed falls
  back to alphabetical by item name (`src/domain/placement.ts:41-47`). Fill tops
  up the highest-preference item, and nothing reorders preference —
  `SlotEditSheet` adds and removes items but passes the existing order straight
  through. So during a **Coke → Coke + Fanta → Fanta** changeover, "Coke" sorts
  before "Fanta" and Fill loads the item being drained. The workaround is to
  avoid Fill on that slot and step the numbers by hand until the outgoing line
  is gone; no data is lost either way. Found while designing Phase 2, where
  mixed slots matter because the sales residual pairs on `(slot, item)`.
  **Fixed 2026-09-07 by `MAKE FIRST`** on the slot sheet (Phase 3 task 19,
  D10): the preference order is now the operator's to set, so Fill loads the
  incoming line as soon as they say so. It stopped being optional when the
  order forecast started attributing a slot's whole demand to `accepts[0]` —
  the same root cause was then costing two things, and reordering is the only
  correction for either.
- **Editing an item's `basePar` silently moves the derived capacity** of every
  unpinned slot where that item sorts first. Slot capacity is pinned when
  placements change, but not on a par-only save.
- **`pinSlotCapacities` reads outside the transaction it writes in.** A create-only
  write means no duplicate row can result; the exposure needs a second tab.
- **Fill is a no-op for any slot at or over capacity**, including any slot whose
  item has `basePar: 0`. Such slots are countable but not fillable.
- **The "add item to this slot" affordance only appears when a machine's map is
  completely empty.** Adding a slot number that appears in no map is unreachable
  once the machine has at least one mapped slot. **Not fixed by fix-plan item
  14**, despite appearances: the map screen now opens the slot-edit sheet from
  any row, but it only lists slots that are already mapped, so an unmapped slot
  has no row to tap. The counting screen's "Open slot" field is still the only
  way in, and it still only shows on a completely empty machine.
- **The counting screen still never says which machine you are in.** Fix-plan
  item 5 asked for the level in the header of both the map and the count
  screens; only the map screen got one (`de949e0`). The count screen has no
  header at all — it opens straight onto the tray tabs. Fifteen near-identical
  maps, so this is the same disorientation the map screen had.
- **`ItemPlacement.scope` is a nested object**, so it cannot be indexed and
  `listPlacements()` full-scans on every map resolution. Any future scope-filtered
  query or sync partition will want a denormalised column plus a data-rewriting
  migration. The likeliest painful migration in the current schema.
- **~~No ESLint configuration.~~** Added 2026-09-07 (`eslint.config.js`, flat
  config, run in CI). It lands clean at 0 errors but **9 warnings**, and those
  warnings are the real entry now. Four are
  `react-hooks/set-state-in-effect` against the load-on-mount pattern
  (`ItemListScreen`, `MachineListScreen`, `useReport`, `useMachineMap`): each
  is `useEffect(() => { void reload() })` where `reload` is async, so its
  `setState` calls run after an `await` and not synchronously in the effect
  body. The rule cannot see through that boundary, so no current report is a
  live defect. The pattern is still the one React is steering away from, and
  the migration (an external store, or `useSyncExternalStore`) touches every
  screen's loading path, so it is deliberately not being done in the same pass
  that introduced the linter. The remaining warnings are
  `react-refresh/only-export-components` on three files that export a helper
  alongside a component, which costs a full reload in dev and nothing in
  production, and one `exhaustive-deps` in `useCounting` where the omitted
  dependencies are deliberate.
- **`Item.remark` and `Item.size` are additions beyond spec §4.1**, which
  lists an `Item` as name, price, photo, box size, base par — no remark, no
  size. Both were added later (catalogue seed work) the same way: optional,
  free text, display-only, no schema migration. `remark` is specifically
  **not** the spec's unbuilt `Note` entity (§4.1: a time-stamped
  observation with optional photo/video, attachable to a machine or a
  machine+item pair) — it is a plain property of the catalogue entry, like
  name or price, with no timestamp and no attachment target of its own.
  Flagging this so a future `Note` implementation doesn't treat `remark` as
  a partial version of it, or vice versa.
- **`Adjustment` has no edit or delete path.** A mistaken adjustment — wrong
  quantity, wrong reason, logged against the wrong slot — is corrected by
  logging its opposite, not by fixing the original row. This keeps the ledger
  an append-only log rather than something that can be quietly rewritten, but
  it means a bad entry stays visible in the history alongside its correction
  rather than disappearing. No decision to build editing has been made either
  way; this is simply what shipped in Phase 2.
- **A redistribution can be double-counted.** Spec §3.2 says moving stock
  between machines during a run is self-recording: the source machine's
  after-count drops, the destination's rises, and the two counts carry the
  move on their own. But the same slot row's `⋯` also offers a `transfer`
  adjustment, and an operator who does both — moves the stock, adjusts the
  after-counts, then logs the transfer for tidiness — subtracts the move
  twice. The source's residual clamps at zero, losing genuine sales along
  with it, and the destination's inflates by the same amount. Nothing warns
  about it, and after the fact the two records are indistinguishable from a
  real transfer that happened between visits. The fix is a design decision,
  not an edit: either the sheet withholds `transfer` at a slot during a run
  it is counting, or the residual learns to recognise a transfer whose units
  are already inside two after-counts.
  **Picked 2026-09-07 (Phase 3 task 18, D9): the sheet withholds it.**
  `transfer` is no longer offered at a machine slot whose visit is `draft` in
  today's run, which is exactly when doing both would double-count. A transfer
  between visits, after Finish machine, or from the map screen still works —
  those are real movements the counts cannot carry on their own. The residual
  was left alone deliberately: teaching it to recognise units already inside
  two after-counts means inferring intent from figures, and withholding the
  trap is cheaper and legible. **Rows written before this date can still carry
  the double count**, and nothing can separate them after the fact.
- **`setAfter` does not add its key to `touched`.** By the field's literal
  definition — "true once the operator alters `before`" (`domain/types.ts`) —
  that is correct: typing an after-count says nothing about the before-count.
  But it contradicts the rationale §3.3 rests on, where an untouched row means
  *seen and unchanged* rather than *not looked at*: an operator who typed a
  hand-entered after-count for a slot has unmistakably looked at it. Phase 3
  reads `touched`, and rows written now cannot be reconstructed later —
  nothing else on the line distinguishes "after typed by hand, before left
  alone" from "never looked at". Left as it is because changing it changes
  what `touched` means, which is the resolved design question at the bottom
  of this file and not something to settle in a fix round.
  **Finalised 2026-09-07.** Phase 3 does NOT read `touched` — the forecast
  reads levels, and `src/domain/purity.test.ts` now fails the build if any
  forecast file so much as mentions the field. So the contradiction above
  costs nothing today, and this bullet is a boundary rather than a debt. It
  becomes live again the moment something outside `src/ui/run/` reads the
  flag; see the entry below on why it cannot be trusted before 2026-09-04.
- **The resume heuristic cannot recognise a hand-entered after-count that
  equals its before-count.** Resuming a draft rebuilds `afterTouched` from
  the stored lines as "after differs from before, and Fill is off"
  (`useCounting.ts`). A slot the operator counted and deliberately typed the
  same number into is indistinguishable from one carried forward untouched,
  so leaving the screen and coming back lets the next before-count edit
  re-derive it. No stored field carries the distinction, so fixing it means
  adding one — a per-line `afterTouched`, which is a schema change and a
  migration for a case whose only symptom is a number reverting to the value
  it already had.
- **`DatabaseClosedError` appears intermittently in component test files** —
  first seen in `src/ui/App.e2e.test.tsx`, and since also in
  `src/ui/report/ReportScreen.test.tsx` (once in three isolated runs of that
  file on 2026-09-04, with all 19 tests passing each time). Not confined to
  one file, so read the rest of this bullet as being about the harness, not
  about `App.e2e`.
  Rare and predates this phase: it surfaced once in fourteen full-suite runs
  during the final fix round, and that run still reported all tests passing —
  it prints as a serialized stderr error rather than failing anything, which
  is why a "no warnings" gate on the suite output can trip on a run that is
  otherwise green. It is a teardown race in the test harness — `db.delete()`/`db.open()`
  between tests against an in-flight read from a component that has not
  unmounted yet — not a product defect: nothing in the app closes the database
  under itself. Recorded so it is recognised as a known flake rather than
  investigated as a data-loss bug the next time it appears in CI.
- **The storeroom ledger carries no trolley movements until Phase 3.** Its
  balance is `last verified count + adjustments and deliveries since`
  (design §6), but the trolley — the ledger's largest movement source once
  built — waits for Phase 3's allocation and pick-list work (spec §6). Until
  then the ledger under-represents genuine stock movement between the
  storeroom and the machines whenever it happens via the trolley rather than
  a logged transfer. Expected, not a gap: recorded in the Phase 2 design
  (§2) as explicitly out of scope, and repeated here so it reads as a known
  boundary rather than a rediscovered omission.
  **Closed 2026-09-07** (Phase 3 tasks 11 and 13): a trolley load writes
  `trolleyLines` and `storeroomMovements` folds them into the balance, so the
  ledger finally carries its largest movement source. The report and the
  storeroom screen read the same function, so they cannot print different
  figures for one shelf. Balances written before this date still under-
  represent trolley movement and no back-fill is possible.
- **`CountLine.touched` cannot be trusted on any visit finalized on or before
  2026-09-04, and has no consumer outside `src/ui/run/`.** A bug fixed that day
  (`4cad94e`) persisted `touched: true` for slots nobody counted, wherever
  `Fill tray to par` was used — always before 2026-08-28, and after that
  whenever a `⋯`-sheet save triggered a reload. Falsely-touched rows cannot be
  separated from genuine ones on disk, because a real per-slot Fill tap writes
  the same two flags. No figure was ever wrong: `before`, `after`, the sales
  residual and the carried-forward levels are all sound. The flag is the only
  casualty, and Phase 3's forecast deliberately reads it nowhere — enforced by
  a guard in `src/domain/purity.test.ts`. Anything that starts reading it must
  either exclude that window or accept that "counted and found empty" is
  sometimes "nobody looked".
- **Schema v4 is a one-way door for the app bundle, as v2 and v3 were — and it
  fails quietly, not loudly.** The data is safe in both directions. The bundle
  is not, and the reason was recorded wrongly twice before being checked: raw
  IndexedDB does refuse to open a database stored above the requested version,
  **but Dexie does not surface that**. It catches the `VersionError`, retries
  with no version at all, finds the installed schema is not the one declared,
  and patches its missing tables and indexes into the newer database in place
  (`dexie.js:4599`, Dexie 4.4.5). So a reverted build does not fail — it comes
  up looking healthy on top of newer stores, with nothing announcing it. That
  is worse than a refusal. It is why `src/backup/import.ts` deletes the
  database rather than clearing its tables, and it is pinned by a test:
  `src/backup/import.test.ts`, "is needed because reopening the newer database
  silently patches it instead". **The export and import halves are both built
  and shipped** — the Phase 3 plan's task 20 says import is not, which was
  true when the plan was written and is not now.
- **The order suggestion does not know what has already been ordered.** Nothing
  records that an order was placed, so nothing subtracts stock on order from
  the next suggestion. Run the report twice before a delivery lands and it will
  ask for the same cartons twice. Recorded in `src/domain/order.ts` beside the
  arithmetic, and out of scope by design (§2): supplier records and purchase
  orders are a document lifecycle this app does not have.
- **The order forecast attributes a mixed slot's whole demand to `accepts[0]`.**
  Spec §6.4's `Σ over slots accepting this item` double-counts every mixed
  slot, so `slotRatesByItem` credits each slot to its first-choice item only
  and the rates partition. The cost, through a **Coke → Coke + Fanta → Fanta**
  changeover: the outgoing item is forecast demand it will never take and the
  incoming one gets none, until the order is changed. `MAKE FIRST` is the
  correction and the reason it is no longer optional. Proportional splitting
  was rejected as more accurate but unexplainable — the operator would see a
  fractional slot contribution with no way to check it (spec §6.1).
- **A new build is not reliably delivered by a refresh.** The service worker
  serves its cache; on 2026-09-07 a deployed change did not appear after a
  normal reload and was nearly reported as broken, with the bundle hash on the
  server confirming the deploy had landed. Every handover so far has said
  "open the app and refresh once", which is weaker than it sounds. Nothing in
  the app tells the operator a new build is waiting, and `registerSW` is
  generated with no update prompt. This is the gap most likely to make a fix
  look like it never shipped.
- **The trolley watch was built and removed the same week** (spec §6.3,
  removed 2026-09-07, operator decision). Design §12.3 specified one line
  naming the level an item runs out at; the implementation looped a line per
  short item, and an unloaded trolley makes every item short, so it covered
  the count table with twenty-eight lines of "runs out at L2 · 0 left". Two
  faults: the missing cap, and that a trolley never loaded reads as a total
  shortage rather than as no information. `runsOutAt` and `trolleyRemaining`
  remain in `src/domain/trolley.ts`, pure and tested, with a tombstone comment
  on the count screen. Both faults must be answered before it returns.
- **The pick list is empty whenever the storeroom ledger is.** Needs are
  resolved only to items the storeroom is known to hold (spec §6.2), so on an
  estate whose balances are all zero the load screen reads "Nothing to take.
  Every machine is projected to be full enough, or the storeroom is out of what
  they want." That is correct and it names both causes, but the two are far
  apart in likelihood, and a first-time user will hit the second while reading
  it as the first.
- **An order override never expires except when horizon or safety changes.**
  `useOrderOverrides` clears the whole set the moment either day count is
  edited (`ReportScreen`'s `changeHorizon`/`changeSafety`), because that
  recomputes every suggestion and an old override would be answering a
  question that no longer exists — but nothing else ever clears one. An
  override typed in yesterday, or last week, and never revisited is still
  there today, and it prints looking exactly like a current suggestion:
  nothing on the sheet — no date, no mark — distinguishes an operator's
  figure from the app's own arithmetic. The `Yours` / `app said …` framing
  only appears back on the report screen that typed it; the printed sheet
  just shows the figure.
- **The print flow depends on iOS actually handing `?print=1` to Safari**,
  rather than keeping it inside the installed app's own webview. `ReportScreen`
  opens the sheet with `window.open('?print=1', '_blank')` specifically to
  escape the installed PWA's standalone mode, where `window.print()` is
  unreliable — but whether that hand-off happens is iOS's call, not this
  app's, and it is a platform behaviour, not a setting this codebase can flip.
  If it does not hand off, the operator is on a nav-less, chrome-less screen
  (`PrintSheet.tsx` renders no `NavContext`, no tab bar) with a `Close` link
  as the only planned way out.

---

## Fixed since this list was written

- **The over-eager ran-dry edge is fixed** (2026-09-04). After `Fill tray to
  par`, saving anything from a slot's `⋯` sheet put the red ran-dry edge on
  slots that were simply empty and had never been counted. The cause was the
  third of Fill's write sites: the seeding effect's mid-count capacity
  recompute (`useCounting.ts`), written in `1bc556e` when both `toggleFill`
  and `fillTray` added their keys to `touched`, so asserting `touched: true`
  for every line it rewrote was consistent then. The 2026-08-28 review's
  Fix 1 changed `fillTray` to never claim observation, and never reached
  this site — so every `reload()`, which a `⋯`-sheet save performs, re-marked
  the whole filled tray touched and restored exactly the behaviour Fix 1 had
  removed. The recompute now carries whatever `touched` already holds, the
  way `fillTray` does: a correction to a slot's capacity says nothing about
  whether anyone looked inside it. No count was ever wrong — but the false
  `touched: true` was also persisted, so the same bug was writing "counted
  and found empty" for slots nobody counted, which Phase 3's demand model
  would have read as genuine zero demand. This was the top follow-up in the
  2026-08-31 handover.

- **An item's slots are picked, not typed** (`85a7660`). The free-text field
  is a toggle per physical slot, grouped by tray, several selectable — so Nu
  Pure Water 48/49, Coke No Sugar 56/57 and Coke 58/59 still work. An invalid
  slot number is now unreachable rather than rejected after the fact, so the
  error message is gone with it. Fix-plan item 13.
- **A slot can be edited from the machine map** (`d35a8b2`, `94cf425`), through
  the same `SlotEditSheet` the counting screen opens — in addition to spec
  §5.1's in-place correction, never instead of it. The sheet floats over the
  map rather than rendering below it. Fix-plan item 14.
- **The global nav is no longer under the scrolling thumb** (`2299b6f`) — it
  moved from the bottom edge to the top. Fix-plan item 11.
- **A mixed slot that ran dry shows red, not blue** (`f31eedb`). It used to
  emit both border colours and let Tailwind's utility order pick the winner.
- **The v1→v2 upgrade path is actually tested** (`5f6defc`). The `machineId`
  index and `storeroomBalances` tests both opened a *fresh* v2 database and
  wrote their data afterwards, so neither ran the upgrade it was named for.
- **A mixed slot's fill split is shown but not editable.** `after` had already
  started rendering on every slot row, including each sub-row of a mixed slot
  (`1dfd1be`), so Fill was no longer invisible — but it stayed a read-only span
  with exactly two reachable values, before or capacity, so an operator who
  actually loaded 2 Fanta and 3 Sunkist could see what the app assumed but
  could not correct it, and stock redistributed between machines could not be
  recorded at all. Now fully fixed (`d37c7c7`, task 4b, 2026-08-27): the after-count is an
  editable `Stepper` on every row, wired through `useCounting`'s new
  `setAfter`, floored at zero and free to land above or below the
  before-count. A hand-entered figure turns Fill off and is not re-derived by
  a later before-count edit; tapping Fill clears it and resumes the derived
  behaviour. Spec §3.2 amended; spec §5.1's "each sub-row remains editable" is
  now fully met, not half.

- **A machine already finished today now shows as finished on the machine
  list** (`8559eb3`). Previously the list never looked at visits, so a
  finished machine was indistinguishable from an untouched one — this was
  the top item in this list. Re-entering a finished machine still opens it
  for editing; the badge is a status indicator, never a gate (spec §7,
  amended 2026-08-27: finalizedAt is a marker, not a lock).
- **`filled` is now stored on `CountLine`** rather than inferred from
  `after > before` (schema v2, `cc43208`). The at-capacity misclassification is
  gone.
- **`visits.machineId` is indexed** and `historyForMachine` queries through it
  (schema v2, `cc43208`), so it no longer scans the whole table.
- **Items can be deleted** (`366c53e`), cascading atomically. An item's
  historical `CountLine` rows are left untouched — past counts are not rewritten.
- **Machine delete was built and then removed again** (`366c53e`, reverted in
  `13f1532`) — an operator decision after the first device test. The whole
  machine row is the "start count" button, delete sat at its right edge, and on
  confirm the row re-laid out so Confirm landed roughly where Delete had been. A
  fast double-tap could delete a machine and cascade its draft count. The roster
  is fixed at fifteen and created by the seed, so nothing needs it. Removed from
  the repository as well as the UI, with a tombstone comment in
  `src/data/repositories/machines.ts` recording why.
- **PWA icons exist** (`7b8783f`) — placeholder set, installable, trivially
  replaceable.
- **Sales are now derived, and stock is now visible.** Phase 2 added
  `Adjustment` (schema v3, `492d36a`), the sales residual (`4775e46`), period
  pairing and a date range (`d7b7b4d`), the adjustment sheet reachable from a
  slot and from the storeroom (`3c1b897`, `a605685`), a storeroom ledger
  anchored to the last manual count (`615d69a`), and a report page with a
  stock matrix inside History (`03a329c`, `108d604`). This was the gap this
  list was written to hold: "the app records what was in every slot but
  cannot yet answer what sold or where the stock is." See
  `docs/phase-2-report.md` for the decisions, their costs, and the bugs caught
  during implementation.
- **`miscount` is withheld at a machine slot** (2026-08-28, design §7,
  operator decision). The slot row's `⋯` sheet offered a correction that
  entered no residual, touched no `CountLine`, and had no screen to read it
  back from — offering it did nothing, which is worse than not offering it.
  Withheld there now, using the same `entersResidual` filter the storeroom
  already applied (`AdjustmentSheet.tsx`'s `SLOT_ADJUSTMENT_REASONS`), not a
  second hard-coded list. The underlying question this bullet was recorded
  against — what a slot miscount should *mean* — is not answered by this fix
  and is still open for Phase 3. If that question resolves the other way and
  the tile returns, the `needsDirection` correction-direction control returns
  with it: `miscount` is the only reason it applies to today, so withholding
  the reason is what made the control unreachable at a slot, not a separate
  change.

---

## Resolved design question

**Should an untouched slot's `CountLine` be distinguishable from a counted one?**
Every slot is recorded at finalize, and untouched rows carry `touched: false`
with `before === after`, so "confirmed unchanged" and "carried forward unseen"
look identical to the sales residual in spec §3.3.

**Resolved 2026-08-27, in the Phase 2 design (§3.3): an untouched slot reports
zero sold, like any other slot** — on the operator's judgement that an untouched
row means *seen and unchanged*, not *not looked at*.

The cost stays live, so it is recorded here rather than closed. That judgement
only holds if every slot really is eyeballed: the counting screen carries last
visit's level forward and greys untouched rows, so a whole tray can be passed
without a tap, and it would then report genuine zero demand for Phase 3's
forecast to learn from. `touched` is still stored on every line, so Phase 3 can
revisit this without a migration if the assumption stops holding.
