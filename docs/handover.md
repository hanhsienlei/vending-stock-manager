# Handover — 2026-08-28, night before the run

Supersedes the handover from the evening of 2026-08-27. Tonight's work is the
interface refinement plan — the run screen, the machines list, the machine map
and the shell were redone. Nothing else was touched.

**Branch:** `interface-refinement`, clean. 470 tests passing, `tsc --noEmit`
clean, `vite build` clean, schema unchanged at version 3.

---

## 1. Before you count tomorrow

**Open the app and refresh once.** That is the only thing you have to do. The
service worker otherwise keeps serving tonight's old bundle until it updates on
its own.

**Do NOT clear the app's data.** An older handover told you to clear before
counting — that advice has been wrong since schema v3, and it is still wrong
tonight. The schema did not move: verified directly, zero files touched under
`src/data` or `src/domain` in this whole round of work. No migration runs, and
nothing gets rewritten. Clearing would throw away run 1's history — which is
what makes tomorrow's counts seed themselves, see below — your machine map
corrections, and the catalogue. If you remember the old advice, ignore it.

---

## 2. Counts should seed themselves tomorrow — with one condition

`finalize()` writes a count line for every slot in a machine, and history only
looks at visits marked finalized. So each slot should open tomorrow at whatever
you left it at during the last visit — you shouldn't have to re-enter a starting
number from memory.

The condition: **a machine that is still sitting as a draft contributes
nothing** and opens at 0 tomorrow, same as if it had never been visited. You can
check this yourself — **History → Receipts** marks each machine finalized or
not.

If you find a stale draft and finish it to fix this, **be careful what you
finalize**: finishing a draft writes whatever numbers are currently sitting in
it as the after-counts, and those become tomorrow's opening. A draft full of
zeros, finalized now, is worse than an unseeded machine tomorrow — it plants a
wrong number where an honest gap would have been obvious.

---

## 3. What changed on the run screen

In your terms, not the code's:

- **Both count columns are typable now.** Tap a figure and it selects — typing
  replaces the number rather than appending to it. This is the one you asked
  for.
- **The row no longer overflows.** Long item names truncate instead of pushing
  the row wider than the screen.
- **RAN DRY and OVER CAPACITY are quieter.** They used to be red boxes of text.
  Now a red edge on the left of the row means it ran dry, and a red figure means
  it's over capacity — same information, less shouting.
- **The header says where you are.** Which machine, and how far through it you
  are. Every level looked the same before; this was the thing that most needed
  fixing.

---

## 4. Fill moved — this is the change most likely to feel worse

Fill used to be a button on every row. It is not, any more.

There is now a **`Fill tray to par`** button in the footer, which fills the
whole visible tray in one tap. Per-slot Fill still exists, but it moved into
the `⋯` sheet on each slot — one more tap than before.

Say plainly: **this is the change most likely to feel worse in the field, and
nothing in a test suite can catch that.** It reads fine on a screen; whether it
still feels fast with fifteen machines and a trolley is only known tomorrow. If
your habit turns out to be fill-then-glance at the row and the extra tap breaks
your rhythm, there's already a fallback direction designed for this — a
"stacked ledger" layout, written up in the design spec under "Directions not
taken." It has not been built. If Fill's new location is the thing you flag
tomorrow, that's where the fix would start.

---

## 5. Miscount is gone from the `⋯` sheet at a machine slot

It used to be there and did nothing — it was stored and read by nothing,
never entered any calculation, never showed back anywhere. It has been
removed from that sheet. If a count is wrong, correct it in place: tap the
figure and type the right number. The Storeroom screen already worked this
way; the slot sheet now matches it.

---

## 6. What still looks old — on purpose

The **storeroom, history, report and items screens**, and the **interior of
the slot editor sheet** (the one that opens when you edit what's in a slot,
not the `⋯` menu) — all of these keep their current styling. Only the run
screen, the machines list, the machine map and the surrounding shell were
redone tonight. If one of those screens looks out of step with the rest, that
is not a bug — it is scoped for later, recorded in the design spec as steps 4
through 12 not yet done.

---

## 7. Rollback is safe

Because nothing in the schema changed, tonight's bundle and tomorrow's data
are interchangeable either direction — today's app can read tomorrow's data,
and if you roll back, tomorrow's app can read today's. If the typed-number run
screen turns out worse at the machines than the old stepper screen, reverting
the deploy costs nothing and loses nothing.

---

## 8. What to do tomorrow

**Write design problems down as they hit you, ideally with a screenshot.**
That is how the last round worked: thirteen annotated screenshots became a fix
plan, and two of the bugs in that plan were never caught by any test — only by
looking at a real screen in your hand. The same is almost certainly true of
whatever's wrong tomorrow. A note that says "this felt off at machine 7" is
useful; a screenshot of the exact moment is much more useful.

---

## Where things are

| What | Where |
|---|---|
| Interface refinement spec | `docs/design/2026-08-28-interface-refinement.md` |
| Design tokens | `docs/design/tokens.md` |
| Design spec (original authority) | `docs/superpowers/specs/2026-08-26-vending-stock-manager-design.md` |
| Phase 2 design | `docs/superpowers/specs/2026-08-27-phase-2-understand-design.md` |
| Known gaps | `docs/known-gaps.md` |
| Decisions and reasoning | `docs/decisions.md` |
| Execution ledger for tonight's work | `.superpowers/sdd/2026-08-28-interface-refinement-steps-1-3/progress.md` |
| Device-test fix plan (last round) | `docs/fix-plan-2026-08-27.md` |
| Device-test screenshots (last round) | `devs/debug/` |
