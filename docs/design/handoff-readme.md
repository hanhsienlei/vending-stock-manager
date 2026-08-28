# Handoff: interface refinement (Phase 2 → production)

## Overview

The vending stock manager works, but the first real run exposed three interface
defects and two naming problems. This bundle is a re-layout of every screen in
`src/ui/` to fix them, plus the design tokens the app currently does not have.

Scope is **layout and labelling only**. No flow changes, no schema changes, no
new features. If a task derived from this bundle needs a change to `src/domain/`
or `src/data/`, the task has been read wrong — with one flagged exception (§7 of
the spec withholds the `miscount` reason at a machine slot; that one is a
behaviour change and is called out as needing a decision).

## About the design files

`design-board.html` is a **design reference created in HTML** — a static board of
mock screens showing intended look, density and copy. It is not production code
and nothing in it should be copied into the app. It exists so you can see what
the spec describes.

The work is to implement the specs in `docs/design/` in the app's existing
environment — React 19 + TypeScript + Tailwind v4 + Vite, using the existing
components, hooks and Dexie data layer. Keep the current file structure; these
are edits to existing files, named per section.

## Fidelity

**High fidelity.** Exact colours, type sizes, weights, grid columns, paddings and
copy are specified. Match them. Where a value is not given, it is unchanged from
the current build.

The board's mock screens are drawn at 393px (iPhone 15 width) — the target
device. The landscape stock matrix is drawn at 852px.

## Read in this order

| File | What it is |
|---|---|
| `docs/design/tokens.md` | **Start here.** The full replacement contents of `src/index.css` as a Tailwind v4 `@theme` block, the type scale, the rule weights, and a row-by-row mapping from every colour used today to its replacement. |
| `docs/design/2026-08-28-interface-refinement.md` | The authority. §2–§12, one section per screen: the grid, the columns, the type, the copy, and the reasoning. Each section names the source files it changes. |
| `docs/design/readme.md` | Short status note: what was asked for, in the operator's words. |
| `design-board.html` | The visual board. Open in a browser. |

The spec does not repeat hex values that `tokens.md` names, so tokens must land
first or the rest will not read correctly.

## Screens

Every screen is specified in the spec section shown. The board id is the badge in
`design-board.html` — open the file and use the badge to find the mock.

| Board id | Screen | Source | Spec |
|---|---|---|---|
| `2a` | Shell — context header + tab bar | `src/ui/App.tsx` | §2 |
| `2c` | **Run / count screen (chosen direction)** | `src/ui/run/CountScreen.tsx`, `SlotRow.tsx` | §3 |
| `2b` | Run, rejected direction — stacked ledger | — | Directions not taken |
| `2d` | Run, rejected direction — one slot, one keypad | — | Directions not taken |
| `3a` | Machine map | `src/ui/machines/MachineMapScreen.tsx` | §5 |
| `3b` | Slot editor sheet | `src/ui/run/SlotEditSheet.tsx` | §6 |
| `3c` | Adjustment sheet | `src/ui/adjustments/AdjustmentSheet.tsx` | §7 |
| `2f` | Storeroom | `src/ui/storeroom/StoreroomScreen.tsx` | §8 |
| `2g` | History — runs list, visit receipt | `src/ui/history/HistoryScreen.tsx`, `VisitReceipt.tsx` | §9 |
| `2h` | Report, and stock matrix in landscape | `src/ui/report/ReportScreen.tsx`, `StockMatrix.tsx` | §10, §11 |
| `2e` | Items list, item edit | `src/ui/items/ItemListScreen.tsx`, `ItemEditScreen.tsx` | §12 |
| — | Machines list | `src/ui/machines/MachineListScreen.tsx` | §4 |

The `1a`–`1i` board section is the **current build**, redrawn for comparison. It
is the before, not the after. Do not implement from it.

## Task order

From the spec's own recommendation:

1. Tokens and the shell — §2 + `tokens.md`. Everything else reads from these.
2. The run screen — §3. All three reported defects are here.
3. Machines and machine map — §4, §5. Same grid, small diffs.
4. Storeroom and the two sheets — §8, §6, §7.
5. History and receipt — §9.
6. Report and matrix — §10, §11.
7. Items — §12.

Steps 1–3 clear every reported defect. 4–7 are consistency.

## The five things being fixed

1. The count row only had `+`/`−`. Both count cells become typable numeric
   inputs; the steppers come off the run row (§3.3).
2. The count row overflowed its container. Two steppers plus a name cannot fit
   393px — the arithmetic is in §3.1. Fixed by a five-column grid (§3.2).
3. The nav bar was four unlabelled centred buttons with no active state and no
   title. Replaced by a context header plus a flush-left tab bar (§2).
4. `RAN DRY` / `OVER CAPACITY` red boxes read as noise. Replaced by a 4px accent
   left inset and an accent-coloured figure respectively (§3.5).
5. Nothing said which machine you were in. The header carries it (§2, §3.7).

Plus a naming decision: the unlabelled number pairs are named as columns —
**Counted / Refilled to** on the run screen, receipt and report; **App estimate /
Your count** in the storeroom — each with a one-line legend under the table. The
exact legend strings are in §3.5, §8, §9.

## Design tokens

In `docs/design/tokens.md`, as a paste-ready `@theme` block. Summary:

- Ground `#f3f2f2`, surface `#eae9e9`, paper `#ffffff`, ink `#201e1d`.
- One accent `#ec3013` with steps 100/200/600/700/800. Green, blue and amber all
  come out — `tokens.md` has the full mapping.
- Neutral ramp 100/400/500/600/700 replaces every ad-hoc `gray-*`.
- Two rule weights: 2px `rule-strong` between sections, 1px `rule-light` between
  rows. Plus one 4px accent left inset, used for ran-dry / in-progress /
  never-verified.
- Archivo throughout, weights 400–800, from Google Fonts.
- **Radius is 0 everywhere.** 61 `rounded-*` classes come out; this is the single
  largest visual difference from the current build.
- Every figure gets `font-variant-numeric: tabular-nums`.
- Every label and button label is flush left, including in full-width buttons.

## Behaviour that must not change

The spec is explicit about these because a re-layout is where they get broken:

- No `max` on a count input. Over-capacity is flagged, never prevented (§3.3).
- `Finish machine` re-runs the whole-machine batch and is not a lock (§3.8).
- Ran-dry suppression for slots with no prior recorded level (§3.5).
- `getOrCreateRun` idempotency — both machine-tap and `Start run` entry points
  (§4).
- Adjustment reason labels come from `ADJUSTMENT_REASONS` in
  `src/domain/adjustments.ts`, verbatim and in that file's order. The spec
  reproduces the table for reference only; the file is the source (§7).
- Which reasons appear stays derived from `entersResidual`, never hard-coded (§7).
- Stock-on-hand is a current figure from latest recorded levels, never a sum over
  the range (§10).
- The `CENSORED_REASONS` strings are unchanged (§10).
- Multiple slot selection on item edit is unchanged (§12).

## Open items for the implementer to raise, not silently resolve

Listed at the end of the spec:

- §7 withholds the `miscount` reason at a machine slot. That is a behaviour
  change and depends on an open decision in `known-gaps.md`.
- §3.6 moves per-row `Fill` to a footer action. If the operator's habit is
  fill-then-glance, this is worse and no test will catch it.
- §3.2 truncates item names. Accepted on the argument that the slot number is the
  identifier at the machine.
- §4 shows a count time, which needs `visit.updatedAt` on the machine list. If
  that costs a query per machine, drop the time — `Counted · 54 slots` is fine.

## Assets

None. No images, no icon files. The board and the design use type, rules and one
accent colour only. Where an icon is implied (the `⋯` glyph, the finished tick,
the rotate indicator) it is a character, not an asset — Lucide is available if
you prefer real icons for the `⋯`.

Archivo is the only external dependency, loaded from Google Fonts by the
`@import` in `tokens.md`.
