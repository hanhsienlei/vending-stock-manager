# Editable order figures, and a printable stock sheet — design

2026-09-30. Two features, requested together because they serve one act: deciding
an order and taking it away on paper.

Neither moves the schema. Both are additions to `src/ui/report/`, plus one print
stylesheet and one entry point.

---

## 0. Decisions already taken

Settled in brainstorming, recorded here so they are not re-opened by accident.

| # | Question | Decision |
| --- | --- | --- |
| D1 | Is an edited order figure a preference or a record? | **A correction before it is written down.** Not an order record, not dated, nothing subtracts it later. No new entity, no schema v5. |
| D2 | What is the PDF for? | **The stock sheet, to print and carry** — the wide matrix, not an order form. |
| D3 | Produced from where? | **The phone.** This is what rules out a print-only, desktop-shaped solution. |
| D4 | How is the PDF produced? | **A printable route opened in a browser tab, plus a print stylesheet.** No PDF library. |
| D5 | How does an edit present? | **Edit in place** on the order row, not a permanent second column. |
| D6 | What reference figures does the row carry? | **Sells per week, and how far under full.** Absolute stock dropped. |

---

## 1. Why an edit is not a record

The tempting version of this feature stores what was ordered, and closes the gap
`known-gaps.md` records: *"the order suggestion does not know what has already
been ordered — two reports before a delivery will ask for the same cartons
twice."*

That is a real gap and this is not the fix for it. Closing it needs an order
entity with a date, a notion of "on order" that decays when stock arrives, and a
rule for what happens when a delivery is partial. That is the purchase-order
lifecycle the Phase 3 design put out of scope (§92), and it is a larger piece of
work than either feature here.

**So the gap stays open, and this feature must not look like it closed it.** An
edited figure is the operator's correction to a suggestion, visible while they
write the order down, and gone the moment its basis changes. Nothing labels it
"ordered".

---

## 2. Where an override lives, and why `localStorage`

Overrides sit in `localStorage`, beside horizon, safety and the fill toggle,
written through the existing `useOrderPreferences` pattern in
`src/ui/report/OrderSection.tsx`. They are preferences, not records, and Dexie
holds records.

**This is forced, not chosen.** D4's printable route opens in a *separate browser
tab* — that is the whole point, since it escapes the installed app's standalone
mode where `window.print()` is unreliable on iOS. A separate tab shares the
origin but not React state, so anything the printed sheet must show has to be
readable from storage. Had the print view been in-app, in-memory state would have
been the better choice.

**Shape.** One key, `vsm.order.overrides`, holding a JSON object of
`itemId → number`. One key rather than one per item so the whole set can be
cleared in a single write, and so a malformed value costs one parse rather than
sixty. Every read and write is wrapped in try/catch, as the existing preferences
are — the test environment's `localStorage` has no methods on Node 25, and a
browser can refuse storage outright.

**What the number means.** The count in the unit the column already prints:
**boxes** where a carton size is known, **units** where `boxSize` is 1. This
matches `orderCell`'s existing two forms (`3 × 21`, or a bare `14`) so the
override needs no separate formatting rule.

**What is typed is the count alone.** The field holds `2`; the `× 50` is
rendered beside it from the item's carton size and is not editable. The carton
is a property of the product, not a thing the operator decides per order, and a
free-text `2 × 50` would have to be parsed and could be entered inconsistently.
Where `boxSize` is 1 there is no suffix and the field is plain units.

**When it clears.** Changing horizon or safety clears every override. Those
recompute every suggestion, so an override made against the old figures answers a
question that no longer exists; leaving it would put a stale number on the sheet
looking exactly like a current one. An individual override is cleared by its own
`Undo`.

**When it does not clear.** Not on reload, not on leaving the report. The
operator may write an order over an afternoon, and the printable tab must be able
to read it.

---

## 3. The row

Edit in place (D5). A row is exactly as it is today until touched.

```
Smith's Salt & Vinegar Chips                    3 × 21
sells 10/wk      under full 17
```

Touched, it becomes:

```
Mars                                          [ 2 × 50 ]
YOURS   app said 1 × 50                            Undo
sells 7/wk       under full 0
```

**The two reference figures** (D6):

- **`sells N/wk`** — the slot-aggregated demand rate × 7. The same number the
  forecast runs on, in the unit the operator thinks in. A week is the natural
  unit of a Tuesday/Friday route.
- **`under full N`** — the matrix's `Balance`, sign-flipped so a shortfall reads
  positive. *"under full 17"* is faster to read than *"−17"*, and the accent is
  spent only when the figure is non-zero.

**`OrderRow` does not carry either figure today.** It extends `OrderLine` with
`itemName`, `boxSize`, `ratedSlots` and `slotCount` — no `full`, no `balance`.
Both must be **plumbed from the matrix rows already built in `useReport`**, keyed
by item id, rather than recomputed in the order section. `buildStockMatrix` is
the one place that knows an item's slot count, its par and its storeroom
balance; a second computation would be a second answer to the same question, and
the report has already been bitten once by two places deriving one figure (the
storeroom ledger, Phase 3 task 11).

**Absolute stock was dropped.** It and `under full` are two views of one gap, and
the row is better for carrying one. The matrix above still shows `Total`.

**An item with no rate** shows `—` rather than a figure, and stays editable: the
operator can order something the app cannot forecast. It keeps its existing
explanation (*"no rate yet — 0 of 15 slots have two clean periods"*), since that
is the row's most likely state for the first few runs.

**An overridden row** is tinted `accent-100`, carries a `YOURS` tag, shows the
figure it replaced, and offers `Undo`. The original must stay visible: a figure
the operator cannot trace back is exactly what spec §6.1 refuses — *"an
explainable forecast that is slightly worse beats an opaque one that is slightly
better"*.

**The matrix's `Order` column** reflects the override, through the one shared
`orderCell` formatter both already use. The column and the section cannot
disagree; that property is already tested and must stay.

---

## 4. The printable sheet

**Entry.** A `Print sheet` action on the report beside the existing landscape
hint, opening `?print=1` in a new tab. The app has no router — three runtime
dependencies, and a tab-state `App.tsx` — so a query parameter read at mount is
the whole mechanism. The service worker's navigation fallback must serve
`index.html` for that URL; see §6.

**Content.** The stock matrix and nothing else:
`Slot · Item · Size · Box · L2–L16 · GF · Total · Full · Balance · Order`, with
overrides applied. A4 landscape is 1123px at 96dpi and the sheet's columns sum to
868px, so it prints at natural size with no shrinking — the figures stay the size
they were designed at.

Above the table, one line of provenance: the date, the machine count, and the
horizon the order figures were built on. A sheet that leaves the building needs
to say when it was true.

**Pagination.** `<thead>` repeats per page, which a real `<table>` gets from the
browser for free — one of the reasons the matrix is a table and not a grid. Rows
do not split (`break-inside: avoid`). Tray sections stay whole where a page
allows.

**Folded trays print folded.** What is on screen is what comes out. A fold is the
operator saying they are not doing that tray.

**Excluded:** the order section, the date pickers, the sales lines, the
`TURN PHONE` hint, and the fold controls. Screen furniture.

**The save itself is Apple's.** Share → Print → Share → Save to Files. Three
taps, not a button in the app. That is the price of D4 and it was accepted
knowingly: the alternative doubled the bundle.

---

## 5. What was rejected

**A PDF library (jsPDF or similar).** Would give a real `Download` button and
work identically everywhere. Rejected on size: jsPDF with table support is
roughly the weight of the entire current bundle (384KB), and the service worker
precaches it for offline use, so a weekly feature would double what the operator
downloads. Revisit only if the print flow proves unusable in the field.

**A permanent second column** (`Suggested` beside `Order`). Rejected in the
sketch: it spends ~90px of a 393px screen on every row, including the majority
where the two figures are identical, and pays for it by dropping figures from the
working line. Edit-in-place keeps the working and shows the original only where
there is something to compare.

**Desktop-only printing.** Cheapest of all, and refused by D3.

**Persisting overrides as records.** §1.

---

## 6. Risks

- **The service worker and `?print=1`.** `generateSW` must fall back to
  `index.html` for a query-string navigation, or the print tab 404s offline. To
  be verified in a real browser, not assumed — and it is the most likely thing to
  break, because it fails only when offline or freshly installed.
- **Print CSS is unassertable in jsdom**, which does not lay out and does not
  paginate. Orientation, page breaks and the repeating header need one look at a
  real print preview. Every visual defect in this app so far was found by
  photograph, not by test.
- **`localStorage` is inert on Node 25**, where `globalThis.localStorage` shadows
  jsdom's with a method-less object. Override persistence is therefore exercised
  only in CI, on Node 20. A green local run does not prove this feature works.
- **Opening a new tab from a standalone PWA** is how the print view escapes to
  Safari, and it is platform behaviour rather than a guarantee. If iOS ever keeps
  the tab inside the app shell, the print flow degrades to where it is today.

---

## 7. Testing

- **Domain:** none. No arithmetic is added — `orderSuggestion` is unchanged, and
  an override replaces its output rather than feeding it.
- **The row:** an override renders in place of the suggestion; the original stays
  visible; `Undo` restores it; changing horizon or safety clears every override;
  a no-rate row is still editable.
- **Consistency:** the matrix's `Order` column shows the override, via the shared
  formatter (extends the existing test rather than adding a parallel one).
- **The print route:** `?print=1` renders the matrix and none of the excluded
  furniture; it reads overrides written by the app; the provenance line carries
  the date and horizon.
- **Structural print checks:** the print container declares landscape and the
  table repeats its header. Followed by one look at a real print preview, which
  is the only thing that actually proves it.
