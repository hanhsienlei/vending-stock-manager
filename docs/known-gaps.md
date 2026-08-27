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
  is gone; no data is lost either way. Left unfixed by operator decision —
  changeovers are rare enough to work around. Found while designing Phase 2,
  where mixed slots matter because the sales residual pairs on `(slot, item)`.
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
- **No ESLint configuration.**
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

---

## Fixed since this list was written

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
  recorded at all. Now fully fixed (task 4b, 2026-08-27): the after-count is an
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
