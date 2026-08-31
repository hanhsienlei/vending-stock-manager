# Handover — 2026-08-31

Supersedes the handover of 2026-08-28. That one covered the run screen, the
machines list and the machine map. This round did the eight screens that one
deliberately left alone: the slot editor, the adjustment sheet, the storeroom,
history and its receipt, the report, the stock matrix, and the two item
screens.

**On `main`, merged.** 528 tests passing, `tsc` clean, `vite build` clean with
zero warnings, schema unchanged at version 3.

---

## 1. Before you use it

**Open the app and refresh once.** That is the only thing you have to do. The
service worker otherwise keeps serving the old bundle until it updates on its
own.

**Do NOT clear the app's data.** Same as last time, and for the same reason:
the schema did not move. Zero files under `src/data` or `src/domain` changed in
this entire round — that is verified, not assumed. Clearing would throw away
your history, your machine map corrections and the catalogue for nothing.

---

## 2. What did NOT change

**The run screen is exactly as you left it.** Counting, typing, Fill, the tray
tabs, the ran-dry edge — none of it was touched. If the typed count cells or
Fill's new location in the `⋯` sheet felt wrong on the 29th, that is still
open and still the thing worth telling me about.

**The over-eager red edge is still there.** The 2026-08-28 handover said it was
"the first thing being fixed after this run" — it has not been fixed, because
you chose this round's work instead, and that was a reasonable trade. To
restate it: after `Fill tray to par`, saving anything from a slot's `⋯` sheet
can put the red ran-dry edge on slots that are simply empty and were never
counted. **No count is wrong.** It is a display flag being too eager.

---

## 3. What changed, screen by screen

**The slot editor** (the sheet behind `⋯` on a slot). It now says which machine
and tray you are in at the top — `Slot 31 · L7 · Tray 3`. The buttons on each
item used to read `Adjust Red Rock Deli Chips Honey Soy Chicken`, four buttons
all starting with the same forty characters; now the item name is the row and
the button just says `ADJUST` or `REMOVE`. Adding an item has a search box, and
each item shows the slot it normally lives in — `· usually 34` — which is the
fastest way to catch that you are about to put something in the wrong channel.
A two-item slot now warns you about the changeover problem where you will meet
it.

**The adjustment sheet.** The reason was a dropdown, and that was the defect:
the reason decides which fields appear below it, so the destination and
direction controls sat underneath a control you had already scrolled past.
Reason is now tiles at the top. There is a new **Result** cell that states both
sides in plain terms before you commit — `L7·31 down 3` / `L9·31 up 3` — because
a transfer writes both sides at once and is the one place this sheet can
silently do the wrong thing. The commit button names the reason now: `Record
move`, `Record delivery`. Both warnings from the known-gaps list are on screen
at the point of the mistake.

**The storeroom.** The two numbers on the right of each row are now named as
columns — `APP ESTIMATE` and `YOUR COUNT` — because nothing said which was
which. The "verified" line is relative now (`Verified 3 days ago`) instead of a
full timestamp. A never-verified row carries the red edge.

**History.** A run row says `Complete` or `In progress · 3 of 15 counted`, with
`3 / 15` on the right, and an in-progress run carries the red edge. **The
receipt now reads as the same table you typed into** — same four columns, same
`COUNTED` / `REFILLED TO` heads as the counting screen — with `READ ONLY` in
the header where counting says `COUNTING`. The `FILLED` pill is gone: two named
columns already say it.

One consequence worth knowing: a slot that was topped up while already at
capacity — where counted and refilled-to are the same number — no longer shows
any mark. That is the cost of dropping the pill, and it is deliberate.

**The report.** The period's sold total is now the poster it should be: a
full-bleed red field with the units figure large. The "lines not counted"
warning has moved out of the totals card onto its own band directly beneath,
because it is the one thing on that screen that must not read as decoration —
a censored line has no figure, so the totals quietly count it as zero, and a
range covering a machine's first visit reads "0 units · $0.00" exactly like a
period that genuinely sold nothing. Sales lines are a proper table now.

**The stock matrix.** Restyled only — same rows, same columns, same order. The
machine toggles are black when shown and struck through when hidden. **The
`Order` column now has a red header and a pink tint**, because it is the only
column that is yours rather than the app's and it has to be obviously blank in
a screenshot. Rows alternate shading so a 60-row screenshot stays readable.

**The item screens.** The list shows the base slot, and price and par as
separate figures instead of one grey caption. Tray headings name the category —
`TRAY 1 · CHIPS`. A remark is a short tag now instead of three lines of italic
amber outweighing the item name; the full text is still on the edit screen.
On the edit screen the name is edited in place as the title, the four value
fields are a 2×2 grid with par marked red as the only required one, and **the
slot picker is a full-width ten-column grid** — one row per tray, so the whole
machine reads as a shape. That last one was a real bug: the old picker
overflowed the screen on your phone.

---

## 4. What I could not check

Two screens never got looked at in a real browser at phone width, because the
data on hand could not reach them: the **stock matrix** (needs a run where
machines were finished twice) and the **counting screen** (needs a run in
progress). Both are covered by tests and both were reviewed, but neither has
been seen at 393 pixels.

The stock matrix is the one that matters, because a screenshot of it is what
you actually carry. **Open the report in landscape once and look at it before
you rely on it.**

Everything else was checked in a real browser at phone width: no screen runs
off the side, and the ten-column slot picker measures 361px inside a 393px
screen.

---

## 5. Rollback is safe

Nothing in the schema changed, so this build and your data are interchangeable
in either direction. If any of this reads worse in your hand than what it
replaced, reverting costs nothing and loses nothing.

---

## 6. What to do next

Same as last time, and it worked: **write problems down as they hit you, with a
screenshot.** Thirteen annotated screenshots became a fix plan last round, and
two of those bugs were invisible to every test — only looking at a real screen
caught them.

The two things most worth your judgement this time: whether the **adjustment
sheet's reason tiles** are faster than the dropdown was, and whether the
**receipt reading as the count table** actually helps you check a machine.

---

## Where things are

| What | Where |
|---|---|
| This round's plan | `docs/superpowers/plans/2026-08-31-interface-refinement-steps-4-12.md` |
| Interface refinement spec (§6–§12 are this round) | `docs/design/2026-08-28-interface-refinement.md` |
| Design tokens | `docs/design/tokens.md` |
| Design spec (original authority) | `docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md` |
| Known gaps | `docs/known-gaps.md` |
| Decisions and reasoning | `docs/decisions.md` |
| Last round's execution log | `docs/interface-refinement-execution-log.md` |

## For whoever picks this up next

Three things were deliberately left, and are not oversights:

1. **The over-eager ran-dry edge** (`useCounting.ts`, the mid-count re-seed
   marks tray-filled slots `touched`). Still the top follow-up.
2. **`src/ui/components/Stepper.tsx` is unused and still in the old palette.**
   Kept on purpose — the spec's "stacked ledger" fallback keeps the ± steppers,
   and it is the named fallback if typed cells fail in the field. The file now
   carries a comment saying so.
3. **`tokens.md` says "Every figure carries `tabular-nums`."** Taken literally
   that would mean every numeral in every sentence, including dates and
   `box of 24`. What it means, and what the code does, is every figure in a
   column that has to align. Worth one line of clarification in that file.
