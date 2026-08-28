# Interface refinement — 2026-08-28

Authority for the interface. Supersedes nothing: the design spec at
`docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md` still owns
behaviour and data. This owns layout and labelling only.

Tokens are in `tokens.md` and are assumed throughout. Read that first; this file
does not repeat hex values it can name.

---

## 1. What this fixes, and what it does not

Reported after the first real run:

| # | Reported | Fixed in |
|---|---|---|
| 1 | The counter is only plus and minus; typing would be faster | §3 |
| 2 | In the run view, the content breaks the container | §3 |
| 3 | The navigation bar is weird | §2 |
| 4 | RAN DRY / OVER CAPACITY read as noise | §3 |
| 5 | (from the source, not reported) no screen says which machine you are in | §3 |

Out of scope, deliberately: every flow, every write path, Phase 3, the landscape
stock matrix's structure (it works — §8), and the two open questions in
`known-gaps.md` about `miscount` and `touched`. This is a re-layout. If a task
here needs a repository change, the task is wrong.

## 2. The shell — `src/ui/App.tsx`

Today: four equal-width centred `<button>`s in a fixed top bar, no active state,
no title. Nothing on any screen says where you are or what day the app thinks
it is except the machine list's run header.

**Replace with two stacked rows.**

Row one, the context header, `padding: 10px 16px 12px` on ground:

- Eyebrow, accent, uppercase 10.5px: the run context. `RUN · THU 27 AUG` on the
  machines screen, `CATALOGUE · 60 ITEMS` on items, `LEDGER · 12 OF 60 VERIFIED`
  on the storeroom, `14 RUNS RECORDED` on history.
- Title, 27px/800, flush left: the screen name. On a machine it is
  `L7` at 27px with the distinct label beside it at 16px/500 in `neutral-700`.
- Right-aligned on the title's baseline: the one figure that screen is about —
  `3 / 15`, `2,203`, `22 / 54`. Tabular.

Row two, the tab bar, `padding: 0 16px`, `border-bottom: 2px rule-strong`:

- Four labels in a `flex` with `gap: 20px`, flush left, **not** stretched.
- Active: 13px/800 ink with `box-shadow: inset 0 -3px 0 accent`.
- Inactive: 13px/500 `neutral-600`.

The header scrolls; the tab bar stays. Both keep the existing `max-w-lg`
centring and the `lg:max-w-none` exception for History.

Nested screens (machine map, visit receipt, count) replace the eyebrow with a
back affordance — `← MACHINES` in 11px/600 uppercase `neutral-600` — rather than
adding a third row. The count screen additionally carries a state word on the
right of that line: `COUNTING`, accent.

## 3. The run screen — `src/ui/run/CountScreen.tsx`, `SlotRow.tsx`

### 3.1 Why the container breaks

`SlotRow` puts, on one flex line: a 32px slot number, a `flex-1` name block, two
`Stepper`s, a Fill button and a `⋯`. Each stepper is 36 + 8 + 32 + 8 + 36 =
120px. Two steppers, Fill (~45px), `⋯` (~20px) and four 8px gaps come to
**317px** of fixed content. At 393pt with 16px of padding there are 361px
available, leaving 44px for a slot number and an item name — so the name wraps to
three lines and the trailing controls push past the row's own rounded border.

It is not a styling bug and cannot be fixed by tightening padding. Two steppers
do not fit on a line with a name.

### 3.2 The chosen layout: one line per slot, four columns

```
grid-template-columns: 30px 1fr 60px 60px 34px;
gap: 8px;  padding: 0 14px;
```

| Column | Content |
|---|---|
| 30px | Slot number, 15px/800, tabular |
| 1fr | Item name, 13px/600, `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` |
| 60px | **Counted** — the before-count. 19px/800 tabular, centred, 46px tall, ruled left and right with 1px `rule-light` |
| 60px | **Refilled to** — the after-count. Same figure, on a `surface` fill |
| 34px | `⋯` |

Above the list, a header row with the same grid, ink fill, labels at 9.5px/700
uppercase: `SL`, `ITEM`, `COUNTED`, `REFILLED<br>TO`. It is sticky under the tab
bar.

**Eleven slots fit one screen instead of five.** A tray is 5 or 10 slots, so a
tray becomes one screen and the operator stops scrolling mid-tray.

The cost, stated: item names truncate. This is accepted because the slot number
is the identifier at the machine — it is what the paper sheet keys on and what
the physical channel is labelled with — and the full name is one tap away in the
slot sheet. Do not "fix" it by shrinking the count columns.

### 3.3 Typing

Both count cells are `<input type="number" inputMode="numeric">` styled as a
cell, not as a field: no border of their own (the grid's rules are the border),
`text-align: center`, `onFocus={(e) => e.currentTarget.select()}` so the first
keystroke replaces rather than appends.

The `±` buttons are **removed from the row**. `Stepper` stays in the codebase —
the storeroom and the adjustment sheet still want a ±-free numeric field, and
direction 2b (§7) uses steppers if this proves wrong — but the run screen does
not render it.

`min = 0`. No `max`: the printed map is ~90% accurate and a channel can hold more
than its recorded capacity, so clamping would force an under-record and book
phantom sales through the residual. Over-capacity is flagged, never prevented —
this is unchanged from today and must stay unchanged.

### 3.4 Mixed slots

The parent row shows the slot number and `2 items`, with both count cells empty
at 34px tall. Each item follows as its own row: slot column blank, name indented
10px at 12.5px/500 `neutral-700`, both count cells present at 42px.

The visual grouping is by indent and by the parent's empty cells, not by a
coloured border. `border-blue-500` on a mixed slot comes out.

### 3.5 Flags

`RAN DRY` as a full-width red box on every zero row is the noise. Replace with:

- **Ran dry**: `box-shadow: inset 4px 0 0 accent` on the row. Nothing else. No
  text, no border colour change.
- **Over capacity**: the Counted figure renders in `accent-700`. No label.

Both keep their existing suppression logic — a slot with no prior recorded level
is not "ran dry" (fix-plan item 4), and that must not regress. An edge mark on
54 rows is as wrong as a red box on 54 rows; the fix is the logic, already done.

The legend under the table names the two columns:

> **Counted** is what you found in the slot. **Refilled to** is what you leave
> behind — next visit opens from it.

### 3.6 Fill

`Fill` leaves the row. It becomes a footer action, **Fill tray to par**, which
sets every slot in the active tray to capacity. Per-slot Fill moves into the
`⋯` sheet.

Reasoning: Fill's per-row button cost 45px of the width that caused defect #2,
and once `Refilled to` is a typable cell, Fill is a convenience rather than the
only way to express a refill. The toggle semantics are unchanged — it sets a
default, typing over it switches it off, tapping again returns to filling to
capacity.

The two-item Fill problem (Fill tops up whichever item sorts first, which during
a changeover is the one being drained) is not solved here. It is stated on the
slot sheet where the operator will hit it — see §6.

### 3.7 Header and progress

The header (§2) carries `L7` and `22 / 54`. Directly under it, a 3px progress
rule on a `rule-light` track, filled accent to the proportion of slots counted.

Tray tabs become the same flush-left underline pattern as the main tabs, with a
tick after a completed tray's number: `1 ✓  2 ✓  Tray 3  4  5  6`. The active
one is spelled out; the rest are bare numerals. Horizontally scrollable, though
six fit at 393pt.

### 3.8 Footer

Two buttons, no gap, `border-top: 2px rule-strong`, both flush left:

| | |
|---|---|
| `Fill tray to par` | ground, ink text |
| `Finish machine` | accent fill, ground text |

`Finish machine` keeps its current behaviour exactly: it re-runs the whole-machine
batch, re-stamps `updatedAt`/`finalizedAt` even on an already-finished visit, and
is not a lock (spec §7 as amended).

## 4. Machines — `src/ui/machines/MachineListScreen.tsx`

The level becomes the row rather than a chip inside it.

```
grid-template-columns: 46px 1fr auto;
padding: 14px 16px;
```

- 46px: `L7`, 22px/800, tabular.
- 1fr: state, 14px/600. `Counted 08:14 · 54 slots` / `In progress · 22 of 54` /
  `Not counted` in `neutral-500` / `Lift lobby · not counted` where a distinct
  label exists.
- auto: a 20px filled-ink square with a tick when finished; `RESUME` in accent
  10.5px uppercase when in progress; `MAP` in `neutral-600` otherwise.

An in-progress machine carries the 4px accent inset.

The run header from today is absorbed into the screen header (§2): the date is
the eyebrow, `3 / 15` is the title-row figure. `Start run` becomes the footer
button when no run exists, `Continue L4 →` when one is in progress — accent
fill, flush left. Tapping a machine still starts the run; `getOrCreateRun` is
idempotent, so both entry points are unchanged.

Times like `08:14` require `visit.updatedAt`, which is already recorded. If it is
easier to ship without them, `Counted · 54 slots` is acceptable.

## 5. Machine map — `src/ui/machines/MachineMapScreen.tsx`

Same grid as the run screen with the count columns replaced by one:

```
grid-template-columns: 30px 1fr 44px 34px;
```

Ink header row: `SL`, `HOLDS`, `CAP`. Tray headings become `surface` bars
carrying the slot range — `TRAY 1 · SLOTS 10–14` — because the range is what is
being matched against the physical machine.

A mixed slot lists both items stacked in the name cell, second line at 12px/500
`neutral-700` — not joined with `/`, which is unreadable at two long names.

An empty slot renders as `Not stocked` in `neutral-500` with `—` for capacity, on
a `neutral-100` row. Today those slots are absent, so a hole in the map is
invisible.

Footer legend:

> The printed map is about 90% right. Tap ⋯ on any slot to correct what it holds
> or how deep it is — for this machine only.

## 6. Slot editor — `src/ui/run/SlotEditSheet.tsx`

Three blocks under an ink title bar (`Slot 31` 19px/800, `L7 · Tray 3` at 13px
70% opacity, `CLOSE` right).

**Capacity.** Label `CAPACITY · THIS MACHINE ONLY`, figure at 24px/800 on a 2px
ink underline, `SAVE` as a 2px outlined button beside it. Helper: *Overrides the
item's par level here. Leave it if the whole estate is the same depth.* The
`< 1` rejection is unchanged.

**In this slot.** One row per item: name at 13.5px/600, then `ADJUST` in
`neutral-700` and `REMOVE` in `accent-700`, both 10.5px/700 uppercase.

This is the fix for the repeated-name labels. The source renders the accessible
name as the visible label — `Adjust Red Rock Deli Chips Honey Soy Chicken` — so
a two-item slot produces four buttons all beginning with the same forty
characters. The row is the subject; the button is the verb. Keep the full string
as `aria-label`.

When two items are present, a helper line states the changeover problem where it
will be met:

> Two items means a changeover. Fill tops up whichever sorts first
> alphabetically, so step the outgoing line down by hand until it is gone.

**Add an item.** A search field, then rows: name in `neutral-700` with
`· usually 34` — the item's base slot — in `neutral-500`, and `ADD` in
`accent-700`. The usual slot is the fastest way to catch that you are about to
place something in the wrong channel. The list keeps its `max-h-48` scroll.

## 7. Adjustment sheet — `src/ui/adjustments/AdjustmentSheet.tsx`

Reason moves to the **top**, as five tiles in a two-column grid (the fifth spans
both). Selected tile is an accent fill with ground text.

The labels are `ADJUSTMENT_REASONS[].label` from `src/domain/adjustments.ts`,
verbatim and in that file's display order. Do not reword them here — the table
is the single source and adding a reason is a row:

| Order | `reason` | Label | `totalStock` | `entersResidual` |
|---|---|---|---|---|
| 1 | `transfer` | Move to another machine or the storeroom | unchanged | true |
| 2 | `expired` | Expired | decrease | true |
| 3 | `damaged` | Damaged or broken | decrease | true |
| 4 | `missing` | Missing or taken | decrease | true |
| 5 | `delivery` | Delivery arrived | increase | true |
| 6 | `miscount` | Miscount correction | unchanged | false |

`transfer` is the long one, so it takes the spanning cell rather than the first
position — display order is preserved by reading the grid as four then one, not
by reordering the table.

Which tiles appear stays derived, never hard-coded. The storeroom screen already
passes `ADJUSTMENT_REASONS.filter(r => r.entersResidual)`, which today excludes
`miscount` and nothing else, so the storeroom shows rows 1–5. At a machine slot
the sheet takes the full table — see the withholding note at the end of this
section.

Reason governs which fields exist and whether the number is added or subtracted.
A `<select>` hides that: today the destination and direction fields appear below
a control the operator has already scrolled past.

Below it, a two-column form grid on 1px rules:

- `UNITS` — 24px/800 tabular. Always a positive magnitude; the sign comes from
  the reason. Unchanged. `delivery` is the only `increase`; `miscount` is the
  only reason with no inherent sign, which is why it alone renders the
  correction-direction control (`totalStock === 'unchanged' && reason !==
  'transfer'`). A transfer's sign comes from source and destination, not from
  the operator.
- `TO MACHINE` — only for a move.
- `INTO SLOT` — only when the destination is a machine. `isSlotNumber`
  validation unchanged.
- `RESULT` — a read-only `neutral-100` cell stating both sides in plain terms:
  `L7·31 down 3` / `L9·31 up 3`. New. A transfer is the one place the sheet can
  silently do the wrong thing, and it writes both sides atomically, so both
  sides should be visible before the commit.

The commit button names the reason: `Record move`, `Record delivery`. Not
`Record`. Accent fill, flush left, with `Cancel` beside it in `neutral-700` on
ground.

**Both `known-gaps.md` warnings go on screen, at the point of the mistake.**

On a move, in an `accent-200` band above the footer:

> Only for stock moved between visits. If you moved it during this run, the two
> refilled-to counts already record it — logging it here as well subtracts it
> twice.

On the storeroom variant, where `miscount` is already withheld, in a `surface`
band:

> Miscount is not offered here. To correct the storeroom figure, type it into
> **your count** on the storeroom row instead — that resets the estimate to the
> truth.

The `miscount` tile is also withheld at a machine slot, matching the storeroom.
`known-gaps.md` records that a slot miscount is stored and read by nothing; until
that has a consumer, offering it is offering a control that does nothing. This is
the one place this spec removes something. If the decision goes the other way,
the tile returns and the `needsDirection` control returns with it.

## 8. Storeroom — `src/ui/storeroom/StoreroomScreen.tsx`

The two numbers on the right of a row are the ledger estimate and the field you
type into, with nothing saying which is which. Name them as columns:

```
grid-template-columns: 1fr 62px 88px;
```

Ink header: `ITEM`, `APP<br>ESTIMATE`, `YOUR<br>COUNT`.

- Name at 14px/600; below it, 11px/500: size, how long ago it was verified, and
  `Adjust` in `accent-700`. `Never verified` renders the whole line in
  `accent-700`, and the row carries the 4px accent inset.
- `App estimate`: 18px/800 tabular, read-only. `neutral-500` when zero and never
  verified.
- `Your count`: the input, right-aligned, in a 2px ink box — the only bordered
  field in a row, because it is the only editable thing.

Legend:

> **App estimate** is your last count plus every delivery and adjustment since.
> Typing **your count** overrides it and the running total starts again from
> there.

The boxes + loose split is unchanged and degrades to one field at `boxSize: 1`,
as today. At a real carton size the cell becomes `[9] ×24 + [0]` with both
figures at 17px/800.

## 9. History — `src/ui/history/HistoryScreen.tsx`, `VisitReceipt.tsx`

**Runs.** One row per run: date at 16px/800, then `Complete · 318 units ·
$1,583.50` or `In progress · 3 of 15 counted` in accent-700, and `15/15` at
19px/800 tabular on the right. An in-progress run carries the accent inset.

The Receipts / Report toggle becomes two half-width segments with an ink fill on
the active one, directly under the tab bar, `border-bottom: 2px rule-strong`.

**Receipt.** The same four columns as the run screen —
`30px 1fr 60px 60px` — with the same `COUNTED` / `REFILLED TO` heads, so the
receipt reads as the table that was typed into.

The `FILLED` pill comes out: two named columns where `refilled to` exceeds
`counted` already say it. Ran dry keeps the 4px inset. Header carries
`READ ONLY` in 10.5px uppercase `neutral-700` where the count screen says
`COUNTING`.

Legend:

> **Counted** is what was in the slot on arrival; **refilled to** is what was
> left behind. A red edge marks a slot that had reached zero.

## 10. Report — `src/ui/report/ReportScreen.tsx`

Portrait carries the period figures.

**From / To** become two cells of a 1px-ruled grid, each a 15px/700 tabular
figure on a 2px ink underline. No boxes.

**The sold total is the one poster moment in the app**: a full-bleed accent
field, `padding: 18px 16px 20px`, ground text.

- Eyebrow `SOLD · RUN OF WED 20 AUG`, 10px/700 uppercase, full opacity — do not
  tint it, the accent-to-ground pair is only 4.2:1 at full strength.
- `318` at 50px/800 tabular with `units` at 15px/600 on its baseline.
- `$1,583.50` at 27px/800 tabular below.

Directly beneath it, on an `accent-200` band in `accent-800`, the censored-lines
warning. It currently renders as amber small print inside the totals card, which
is the one thing on the screen that must not read as decoration:

> 7 lines not counted — no figure exists for them, so they are not in the totals
> above.

**Stock on hand** becomes three equal cells on 1px rules: `IN MACHINES`,
`STOREROOM`, `ON HAND NOW` at 21px/800 tabular, the third on a `surface` fill.
This stays a current figure read from latest recorded levels, never a sum over
the range — unchanged.

**Sales lines** become a table, ink header:

```
grid-template-columns: 30px 26px 1fr 40px 62px;   /* LV SL ITEM SOLD REVENUE */
```

A censored line drops the two figure columns and spans them with the reason in
`accent-800` on a `neutral-100` row: `Not counted — left the slot holding stock`.
The three `CENSORED_REASONS` strings are unchanged.

A ran-dry line keeps the 4px inset and a small `DRY` in `accent-700` after the
name. `Edited late` keeps its label, restyled to the same treatment.

Footer strip: `Stock matrix — 60 items × 15 machines` with `TURN PHONE ⟳` in
`accent-700`. The matrix's landscape requirement is currently discoverable only
by rotating.

## 11. Stock matrix — `src/ui/report/StockMatrix.tsx`

Structure unchanged — it works, and a screenshot of it is the deliverable.
Restyle only:

- Header row: ink fill, ground text, 9.5px/700 uppercase.
- Machine toggles: filled ink when shown; `surface` with `line-through` when
  hidden. Not accent — fifteen accent chips would spend the colour budget on a
  control.
- `border-left: 2px` on the GF column, so the machine columns read as one block
  and GF / Total / Order as the summary.
- **Order gets an accent header and an `accent-100` fill.** It is the only
  column that is the operator's rather than the app's, and it must be obviously
  blank in a screenshot. Phase 3 fills it; until then the tint says whose column
  it is.
- A zero in a machine cell renders `accent-700`.
- Rows alternate `paper` / `neutral-100`. At 60 rows × 12 columns, banding is
  what keeps a screenshot readable.

Footer legend:

> Order stays blank for your pen until Phase 3 fills it — the red header marks it
> as the column that is yours, not the app's. A red figure is a machine at zero.

## 12. Items — `src/ui/items/ItemListScreen.tsx`, `ItemEditScreen.tsx`

**List.** `34px 1fr auto`: base slot, then name at 14.5px/600 with
`27g · box of 1` beneath, then price at 15px/800 tabular with `par 5` under it.
Price and par become figures instead of running together in one grey caption.

Tray group headings become `surface` bars with a category word where the
catalogue has one: `TRAY 1 · CHIPS`, `TRAY 3 · CHOCOLATE`, `TRAY 4 · DRINKS`.

A `remark` becomes a short `accent-200` tag — `SIZE UNVERIFIED` — not three lines
of italic amber that outweigh the item name. The full remark shows on the edit
screen.

**Edit.** The four numeric fields become a 2×2 grid of figures at 21px/800 on 2px
underlines: `PRICE`, `PAR LEVEL · REQUIRED`, `BOX SIZE`, `PACK SIZE`. Par's
underline and label are accent — it is the only required one and already says so.
Name is the screen title, edited in place. Remark is a full-width field below the
grid.

**The slot picker spans the full width in a 10-column grid**, one row per tray,
tray number in a 16px gutter. Today it is a `flex-wrap` of 36px buttons inside a
row that already spends 56px on a tray label, so tray rows overflow at 393pt. At
`repeat(10, 1fr)` a cell is ~31px and the whole machine reads as a shape.
Selected cells are accent fill. Multiple selection is unchanged — three items
legitimately occupy two slots each.

Delete keeps its two-tap confirm and sits in the footer beside Save, as
`accent-700` text on ground against Save's accent fill.

---

## Directions not taken

Two other run-screen layouts were drawn. Recorded because the reasons against
them are the reasons the chosen one is shaped as it is.

**Stacked ledger.** Slot number and name on line one, the two count fields on
line two with `±` retained on each. Fits five slots per screen — the same density
as today — and keeps the steppers, so a one-unit correction is one tap and no
keyboard opens. Rejected because a tray no longer fits a screen, which is the
scrolling complaint, and because retaining `±` retains the width pressure that
caused the container break in the first place. This is the fallback if typing
proves worse in the field than it sounds.

**One slot, one keypad.** One slot filling the screen — slot number at 54px, a
3×4 numeric keypad in the bottom two-thirds, `Fill to 5` and `Next slot →`. Best
of the three for one-handed use and for typing, and it cannot scroll or lose your
place. Rejected for this round because the operator cannot see the tray as a
whole, which makes a jump-to-slot control and a tray overview mandatory rather
than optional — more new surface than a re-layout should introduce. Worth
revisiting as a mode rather than a replacement.

## Suggested task order

1. Tokens and the shell (§2, `tokens.md`) — everything else reads from these.
2. The run screen (§3). The reported defects are all here.
3. Machines (§4) and machine map (§5) — same grid, small diffs.
4. Storeroom (§8) and the two sheets (§6, §7).
5. History and receipt (§9).
6. Report and matrix (§10, §11).

Steps 2 and 3 clear every reported defect. The rest is consistency and can be
cut if the next run is close.

## Things a reviewer should push back on

- §7 withholds `miscount` at a machine slot. That is a behaviour change dressed
  as a layout one, and it depends on an open decision in `known-gaps.md`.
- §3.6 moves Fill off the row. If the operator's habit is Fill-then-glance, a
  footer action is worse, and no test will catch that.
- §3.2 truncates item names. Accepted on the argument that the slot number is the
  identifier at the machine — but that is an argument, not evidence.
- §4 shows a count time, which requires reading `visit.updatedAt` on the machine
  list. If that costs a query per machine, drop it.
