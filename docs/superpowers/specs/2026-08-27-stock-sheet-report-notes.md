# Stock Sheet Report — brainstorming notes (parked)

**Status — updated 2026-08-27:** no longer parked. Folded into the Phase 2
design as §7.3, on a report page inside History, sequenced after the on-screen
summary. Two of the three gaps below are closed; see "Gaps found against the
current data model" for which. **Implement from
`docs/superpowers/specs/2026-08-27-phase-2-understand-design.md`, not from this
document** — these remain brainstorming notes, kept for the reasoning behind
the decisions the spec carries forward.

**Date:** 2026-08-27
**Reference:** `docs/user-context/stock-sheet-1.heic`, `stock-sheet-2.heic` — the
paper sheets this report reproduces.

---

## What it is

A one-button report that renders the current stock picture as a PDF, in the
layout of the paper sheet the operator uses today.

The paper sheet is a matrix: one row per item, columns for each machine
`L2`–`L16`, then `GF` (the ground-floor storeroom), then `Total`. A blank
`Order` column is filled in by hand while reading it.

## Decisions reached

**Generated on the phone. No server.** A PDF is just bytes, and `pdf-lib` or
similar builds one client-side. This was raised as a Lambda job; it does not
need to be. Keeping generation on-device preserves the local-first property from
spec §8.1 — no stock data leaves the phone, nothing to host, works offline in a
basement. The finished file goes out through the OS share sheet.

Rejected: sending raw stock data to a server to render there. It buys nothing
over rendering locally and is the only option that puts the operator's data on
someone else's machine.

Left open: whether the report ever needs to reach an inbox automatically. If it
does, the smallest addition is an endpoint that accepts a **finished PDF** and
emails it — the server still never sees the underlying data.

**One row per item, slot number as the locator.** A mixed slot becomes two rows:

```
52-1  Sunkist
52-2  Fanta
```

Not a split cell (`1(4)`) as on the paper. The operator's reason: you order
Fanta, not slot 52, so the `Order` column has to sit beside the thing being
ordered. A split cell forces mental arithmetic while standing in the storeroom.

Single-item slots stay unsuffixed (`58 Coke`) — assumed, not confirmed.

**Both conventions render from one dataset.** Counts are stored as
`(slot, item, qty)`, so the same data produces the operator's slot-keyed view or
a colleague's item-keyed view. Worth knowing: the colleague's paper convention
cannot express a mixed slot at all — a new item forces a new row (see rows 70/71
on sheet 2), losing the fact that it shares slot 52. The app can reproduce his
layout but not that ambiguity.

## Gaps found against the current data model

1. ~~**`Item` has no size field.**~~ **Closed.** `size?` was added during the
   catalogue seed and carries exactly this — `375ml`, `27g`, `ea`.
2. ~~**`GF` and `Total` need the storeroom**, which is Phase 2.~~ **Closed by
   the Phase 2 design** — the storeroom ledger and balance are specified in
   its §6, so both columns fill automatically.
3. **`Order` is Phase 3**, where the supplier order suggestion lives. Still
   open; ships blank.

## Open question — now narrowed

Whether to ship the report with `Order` and `GF` blank for hand-writing —
mirroring the paper exactly, which is how it works today — or to wait until
Phase 2 and 3 fill them automatically.

**Half-answered, 2026-08-27.** `GF` and `Total` no longer have to wait: Phase 2
fills them, and the report is being built as part of that phase. Only `Order`
remains, and it ships blank for hand-writing until Phase 3 — which is the paper
sheet's own behaviour, so nothing is lost against how the job works today.
