# Design tokens

The app has no tokens today: `src/index.css` is `@import "tailwindcss";` and
every value is a Tailwind default picked per element. That is why the same
concept renders three ways — grey is `gray-400`, `gray-500` and `gray-600`
depending on the file, and a "finished" state is `green-100/green-700` on the
machine list and `emerald-700` on a stepper.

This file gives the design one set of names. Tailwind v4 reads a `@theme` block
straight out of the stylesheet, so this replaces the contents of
`src/index.css`.

## src/index.css

```css
@import "tailwindcss";

@theme {
  /* Ground and ink */
  --color-ground: #f3f2f2;   /* page background */
  --color-surface: #eae9e9;  /* section bars, legends, inset cells */
  --color-paper: #ffffff;    /* every data row */
  --color-ink: #201e1d;      /* text, strong rules, filled headers */

  /* The one accent. Used for: the primary action, the active tab underline,
     the ran-dry edge mark, the report's sold field. Nothing else. */
  --color-accent: #ec3013;
  --color-accent-100: #fff2ef;
  --color-accent-200: #ffe0d9;
  --color-accent-600: #dd2b0f;  /* hover */
  --color-accent-700: #ae1800;  /* pressed; accent text at body size */
  --color-accent-800: #7c1405;  /* text on an accent-200 fill */

  /* Neutral ramp — replaces every ad-hoc gray-* */
  --color-neutral-100: #f8f4f4;  /* alternating / disabled row */
  --color-neutral-400: #bab6b6;  /* carried-forward figure, ⋯ glyph */
  --color-neutral-500: #9b9797;  /* "not counted" */
  --color-neutral-600: #7d7979;  /* inactive tab, helper text */
  --color-neutral-700: #605d5d;  /* metadata, column headers on ground */

  /* Rules. Two weights only. */
  --color-rule-strong: rgb(32 30 29 / 0.4);   /* 2px, between sections */
  --color-rule-light: rgb(32 30 29 / 0.18);   /* 1px, between rows */

  --font-heading: "Archivo", system-ui, sans-serif;
  --font-body: "Archivo", system-ui, sans-serif;

  --radius-none: 0px;
}

/* Archivo, weights 400/500/600/700/800 */
@import url("https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap");

:focus { outline: none; }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
::selection { background: rgb(236 48 19 / 0.3); }
```

## Radius

Zero, everywhere. Every `rounded-lg` and `rounded-full` in `src/ui/` comes out.
There are 61 of them; they are the single largest visual difference between the
current build and this design.

## Type

Archivo throughout. Sizes, and where each is used:

| Role | Size / weight | Used on |
|---|---|---|
| Screen title | 27px / 800, tracking −0.02em | `Machines`, `Storeroom`, `L7 Lift lobby` |
| Sheet title | 19px / 800 | Slot editor, adjustment sheet |
| Figure, large | 24px / 800, tabular | Capacity, adjustment units, item-edit fields |
| Figure, row | 19px / 800, tabular | The two count cells on a slot row |
| Figure, small | 15px / 800, tabular | Slot number, matrix cell, receipt count |
| Row title | 13–14.5px / 600 | Item name |
| Metadata | 11–12px / 500, neutral-700 | Size, capacity, verified-at |
| Column header | 9.5px / 700, tracking 0.10–0.14em, uppercase | Every table head |
| Eyebrow | 10.5px / 600, tracking 0.12em, uppercase | `RUN · THU 27 AUG` |
| Button label | 12.5px / 800, tracking 0.04em | Footer actions |

Every figure carries `font-variant-numeric: tabular-nums`. Columns of numbers
that do not align are the reason a paper sheet beats a screen, and it is one
declaration.

## Spacing

Row padding `10–11px 16px`. Section bars `7–9px 16px`. Footer buttons
`15px 16px`. Gaps inside a row grid: `8px`. Nothing else is needed — the rules
do the separating, not the whitespace.

## Rules, not borders

The current build draws a 1px box around every row (`border rounded-lg`). This
design draws one 1px line *under* every row and one 2px line between sections.
A row has no left or right edge; the screen edge is the row edge.

| Weight | Colour | Where |
|---|---|---|
| 2px | `rule-strong` | Under the tab bar, above a footer, between a form block and the next |
| 1px | `rule-light` | Between rows in a list, between cells in a form grid |
| 4px, left inset | `accent` | Ran dry, in progress, never verified — the only edge mark in the app |

The 4px inset is `box-shadow: inset 4px 0 0 var(--color-accent)`, not a border,
so it does not shift the row's contents by 4px.

## Flush left

Every label, heading and button label starts at the left padding edge. The
current build centres button text (`<button>` default) and centres the four nav
labels; both change. A footer button that spans half the screen still starts its
label at the left.

## States

| State | Treatment |
|---|---|
| Hover | Accent fill goes to `accent-600`; ghost/outlined gets a 7% ink tint |
| Pressed | Accent fill goes to `accent-700`; ghost gets 14% |
| Focus | 2px accent outline, 2px offset — never the browser default |
| Disabled | 45% opacity |
| Carried forward | Figure in `neutral-400` — the existing `dimmed` prop, retinted |

## Colour budget

Per screen: ink on ground, plus **one** accent element. The run screen spends it
on `Finish machine`; the machines list on `Continue L4`; the report on the sold
field. Where a screen has two things that want to be red — a destructive action
and a primary one — the destructive one takes `accent-700` as text only.

Green, blue and amber are gone. The mapping:

| Today | Becomes |
|---|---|
| `blue-600` fill (primary buttons, active tab, selected slot) | `accent` fill, or ink fill for a selected state |
| `blue-600` text (Map, Adjust, Back) | `neutral-700` text, uppercase 10.5px |
| `green-100/green-700` Finished pill | filled ink 20px square with a tick |
| `green-600` Fill button | moves off the row; see the spec, §3 |
| `emerald-700` after-count | ink-filled cell |
| `red-500` ran-dry border | 4px accent left inset |
| `amber-600` over capacity | `accent-700` text, no fill |
| `amber-100/amber-700` in-progress pill | `accent-700` metadata text |
| `gray-200` stepper buttons | `ground` fill inside a 2px ink field |
