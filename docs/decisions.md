# Decisions

A running record of choices made during development and why, so they read as
decisions rather than accidents. Newest last.

Phase 1's own decisions are in its spec and plan; the gaps it deliberately left
are in `docs/known-gaps.md`. This file picks up after Phase 1 merged.

---

## Catalogue seeding

**Seeding is setup, not Phase 2.** Phase 2 is the storeroom, adjustments and the
sales residual. Loading the catalogue is groundwork that makes the app testable
against real data.

**The seed lives in the app, not in a script.** Data is in IndexedDB on the
operator's phone, so nothing run from a developer machine can reach it. The seed
is a button that only appears when the catalogue is empty — the gate is the
safety mechanism, and there is deliberately no confirm dialog, because making the
state unreachable beats asking "are you sure".

**`boxSize` is 1 for every seeded item.** The paper sheets carry no carton sizes.
An obviously-wrong placeholder that gets corrected beats a plausible invention
that never gets checked.

**Product names go in as transcribed, placeholders included.** Mother, Prancing
Pony XPA, Fanta, Ginger Beer (new), Vodka Cruiser Lime and Tequila are unverified.
The operator renames them at the machine on the next run; every item name is
editable for exactly that reason.

**Sizes are recorded as written, including the wrong ones.** Slots 44 and 45 read
`600ml` and `500ml`, which is wrong for Red Bull and is a colleague's error on the
paper sheet. Recorded verbatim with a `remark` saying the size is unverified — the
job is to reflect the sheet, not to silently correct it.

**Slot 44 is not pre-seeded with the no-sugar variants.** Both 44 and 45 sometimes
get filled with no-sugar when the original is out. Listing four accepted items on
slot 44 would render four sub-rows on the counting screen, mostly zero, on every
run. The operator adds the substitute at the machine when it actually happens and
it persists from then on. Revisit if it turns out to be most weeks — the fix would
be hiding zero-count sub-rows rather than shortening the accepted list.

**`Item.size` was added rather than discarding the sheet's `Qty` column.** The
data was in hand during seeding; adding the field later would mean re-keying 60
sizes. See `docs/known-gaps.md` for why `remark` and `size` are not the spec's
`Note` entity.

## Schema version 2

**Three additive changes in one migration**, done before any real run exists to
migrate: store `filled` on `CountLine` instead of inferring it from
`after > before`; index `visits.machineId`; add the `storeroomBalances` table.

**`ItemPlacement.scope` was deliberately left alone**, reversing an earlier
intention to fix it in the same pass. It is recorded in `known-gaps.md` as the
likeliest painful migration, but changing it rewrites the placement-resolution
path — the most heavily reviewed code in the project — and doing that the night
before a real run is the wrong risk. With roughly 70 placement rows, rewriting
them later is cheap. The trigger for revisiting is a sync partition or a
scope-filtered query, neither of which is close.

**The migration derives `filled` for existing rows as `after > before`** — the
same inference it replaces — so a database already seeded and poked at in a
browser sees no behaviour change.

## Storeroom

**Only the manual count is being built.** Spec §6.5 describes the storeroom as a
ledger maintained by trolley loads and deliveries, with a manual count that
resets the estimate to truth. The trolley, deliveries, pick list and ordering are
the rest of Phase 2 and are not built.

**Plain unit entry, not boxes-plus-loose.** Spec §5.4 wants pack entry at the
storeroom, and it should exist eventually. But every seeded `boxSize` is 1, so a
boxes field would read "2 boxes" and mean two cans. Pack entry lands once real
carton sizes are known.

**Built without the full architectural process, knowingly.** The storeroom is a
new subsystem with a spec section behind it, so by the project's own rules it
wanted a design pass and a spec amendment before implementation. It was dispatched
directly because the operator counts the ground floor tomorrow. A defensible trade
against a real deadline, and not a precedent — the rest of Phase 2 goes through
the normal process.

## Deployment

**Cloudflare Pages.** Static build, free tier, HTTPS by default.

**HTTPS is a hard requirement, not a nicety.** `newId()` uses
`crypto.randomUUID()`, which only exists in a secure context. Served over plain
HTTP to a phone on the hotel wifi, the first save would throw — and there is no
error surface yet, so a whole machine's count would vanish with no explanation. A
PWA will not install over HTTP either.

## Sequencing

**Known gaps get cleared before Phase 2 proper starts.** Reversed from an earlier
"after Phase 2" — most of the gaps are in code Phase 2 builds on, and the
schema-touching ones are free only while no real run exists.
