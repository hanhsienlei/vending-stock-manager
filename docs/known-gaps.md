# Known gaps

Things deliberately not built or not fixed, with the reasoning. Recorded so they
are recognised as decisions rather than rediscovered as surprises.

Carried out of the Phase 1 execution ledger before its workspace was deleted.

---

## Deferred features

**Mixed-slot fill split is not shown or editable.** Spec §5.1 says that when a
mixed slot is filled, "the resulting split is shown and each sub-row remains
editable, so an operator loading a different mix can correct it." The arithmetic
is correct — `after` is computed properly for mixed slots — but it is never
rendered. Tapping Fill on slot 52 turns the button green and shows nothing else.
An operator who actually loaded 2 Fanta and 3 Sunkist has no control that records
that. Deferred because it is a new UI surface rather than a correctness bug.

**No PWA icons, so the app will not install to a home screen.** The manifest
declares none, and Chrome/Android needs 192px and 512px icons before offering
installation. Until then it runs in browser chrome with a network cold start —
the two things spec §8.1 exists to remove. Needs an actual app icon, which is a
design decision for the operator rather than something to generate.

**No error surface for a rejected write.** `CountScreen` swallows rejections with
an empty catch. After a rollback the displayed number reverts with no
explanation, and a genuine finalize failure navigates away as if it had
succeeded, leaving the visit a draft. No data is lost — the batch is atomic and
`finalizeVisit` is never reached — but the failure is invisible.

**A machine already finished today looks normal but ignores taps.** The machine
list gives no sign that a machine is done, so it can be re-entered; the button
still reads "Finish machine" and the steppers reject every tap. Not harmful —
the record was written completely by the first finalize, so nothing is lost or
corrupted, and taps visibly bounce via the rollback — but the operator gets no
explanation. The honest fix is showing which machines are done. **This is the
first follow-up to pick up.**

---

## Smaller items

- **`filled` is reconstructed from `after > before`, not stored.** A slot filled
  while already at capacity comes back un-toggled after a remount. Recorded
  `after` is unaffected, but correcting the count afterwards then writes
  `after = before` instead of the fill target. Operator-recoverable by re-tapping
  Fill. Storing the flag needs a schema change.
- **`historyForMachine` scans the whole `visits` table** on every screen entry
  and filters in JS; there is no `machineId` index. The count-line reads are
  bounded to four visits, but the visit scan is not. An index-only migration.
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

---

## Open design question

**Should an untouched slot's `CountLine` be distinguishable from a counted one?**
Every slot is now recorded at finalize, and untouched rows carry `touched: false`
with `before === after`. Phase 2 must read that flag to tell "confirmed unchanged"
from "carried forward unseen" — the sales residual in spec §3.3 will otherwise
treat them identically.
