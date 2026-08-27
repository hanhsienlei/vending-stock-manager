# Known gaps

Things deliberately not built or not fixed, with the reasoning. Recorded so they
are recognised as decisions rather than rediscovered as surprises.

Carried out of the Phase 1 execution ledger before its workspace was deleted.

---

## Deferred features

**A mixed slot's fill split is shown but not editable.** Half fixed. `after` now
renders on every slot row including each sub-row of a mixed slot (`1dfd1be`), so
Fill is no longer invisible. The remaining half of spec §5.1 — "each sub-row
remains editable, so an operator loading a different mix can correct it" — is
still missing. Fill always tops up the highest-preference item, so an operator
who actually loaded 2 Fanta and 3 Sunkist can see what the app assumed but cannot
correct it. A new UI surface, deferred.

**No error surface for a rejected write.** `CountScreen` swallows rejections with
an empty catch. After a rollback the displayed number reverts with no
explanation, and a genuine finalize failure navigates away as if it had
succeeded, leaving the visit a draft. No data is lost — the batch is atomic and
`finalizeVisit` is never reached — but the failure is invisible.

---

## Smaller items

- **Editing an item's `basePar` silently moves the derived capacity** of every
  unpinned slot where that item sorts first. Slot capacity is pinned when
  placements change, but not on a par-only save.
- **`pinSlotCapacities` reads outside the transaction it writes in.** A create-only
  write means no duplicate row can result; the exposure needs a second tab.
- **Fill is a no-op for any slot at or over capacity**, including any slot whose
  item has `basePar: 0`. Such slots are countable but not fillable.
- **The "add item to this slot" affordance only appears when a machine's map is
  completely empty.** Adding a slot number that appears in no map is unreachable
  once the machine has at least one mapped slot.
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

## Open design question

**Should an untouched slot's `CountLine` be distinguishable from a counted one?**
Every slot is now recorded at finalize, and untouched rows carry `touched: false`
with `before === after`. Phase 2 must read that flag to tell "confirmed unchanged"
from "carried forward unseen" — the sales residual in spec §3.3 will otherwise
treat them identically.
