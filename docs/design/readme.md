# docs/design

Interface design for the app, produced 2026-08-28 from the Phase 2 build. Drop
this folder into the repository at `docs/design/`.

| File | What it is |
|---|---|
| `2026-08-28-interface-refinement.md` | The authority. Per-screen layout specs, the decisions behind them, and which source file each one changes. |
| `tokens.md` | Colours, type, spacing and rules as a Tailwind v4 `@theme` block, plus the mapping from the values used today. |

## Status

Direction chosen: **the paper sheet** — one line per slot, fixed columns, counts
typed rather than stepped. Two other directions were drawn and rejected; both are
recorded in the spec under "Directions not taken", because the reasons for
rejecting them are the reasons the chosen one is shaped the way it is.

Nothing here is built. The spec is written so a task can be cut per screen.

## What was actually asked for

Three defects reported after the first real run, in the operator's words:

1. *"in the run view, the counter is only plus and minus. I want to type in the value faster."*
2. *"in the run view, the content breaks the container."*
3. *"the navigation bar is in the button, very weird."*

Plus two picked from a list: RAN DRY / OVER CAPACITY read as noise, and typing
beats tapping. Everything in this spec traces to one of those five or to a
naming decision recorded in §2.

The scope is **layout and labelling**. No flow changes, no new features, no
Phase 3 work.
