import { db } from '../db'
import { listItems, saveItem } from './items'
import { listMachines, saveMachine } from './machines'
import { setPlacement } from './placements'
import { STARTER_ITEMS, STARTER_MACHINE_LEVELS } from '../starterCatalogue'
import { PACKAGE_SIZES, UNSET_BOX_SIZE } from '../packageSizes'

/** One-tap seed for a brand-new install: the 60-item catalogue, fifteen
 * machines (L2 through L16), and each item's base slot placement — all from
 * the operator-reviewed transcription in docs/catalogue-transcription.md.
 *
 * Every item gets par 5 (the operator's instruction) and box size 1 (no
 * carton sizes are on the transcription, so 1 is a deliberate placeholder
 * for the operator to correct, not an invented default). With every par at
 * 5, every slot's capacity resolves to 5 with no SlotConfig, so nothing here
 * pins capacity.
 *
 * Guarded by an empty catalogue rather than a confirm dialog — the ItemList
 * screen only ever shows the button when there is nothing to lose. That
 * guard is worthless on its own, though, unless the check and every write
 * it protects are atomic:
 *
 * - The emptiness check and all ~135 writes (items, machines, placements)
 *   run inside one `db.transaction`, covering `items`, `machines` and
 *   `placements`. Two overlapping calls — a double-tap on a button that
 *   stays enabled through the whole batch — cannot both observe an empty
 *   catalogue: IndexedDB serializes two `readwrite` transactions over the
 *   same object stores, so the second one only starts once the first has
 *   committed (or aborted), and by then the catalogue is no longer empty.
 * - The check covers `machines` as well as `items`. `App.tsx` opens on the
 *   Machines screen, which invites adding one by hand before Items is ever
 *   visited — that machine existing is reason enough to refuse, even with
 *   zero items, rather than mint a duplicate level.
 * - Because it is one transaction, a failure partway (crash, closed tab,
 *   quota) rolls every write in the batch back — no half-seeded catalogue,
 *   and the gate is not left stuck: `listItems`/`listMachines` read empty
 *   again afterwards, so a retry can succeed cleanly.
 *
 * The repository calls below (`saveItem`, `saveMachine`, `setPlacement`)
 * join this transaction automatically — Dexie reuses the active transaction
 * for any table operation performed inside its scope, including
 * `setPlacement`'s own nested `db.transaction('rw', db.placements, …)`,
 * because `placements` is already part of this outer transaction's table
 * set. Verified directly: `seed.test.ts`'s rollback test forces a write to
 * fail on the 30th `placements.put` and asserts every item and machine
 * written before it is gone too. */
export async function seedStarterCatalogue(): Promise<boolean> {
  return db.transaction('rw', db.items, db.machines, db.placements, async () => {
    const [existingItems, existingMachines] = await Promise.all([listItems(), listMachines()])
    if (existingItems.length > 0 || existingMachines.length > 0) return false

    const items = await Promise.all(
      STARTER_ITEMS.map((entry) =>
        saveItem({
          name: entry.name,
          price: entry.price,
          basePar: 5,
          // The supplier carton, off the operator's paper stocktake sheets.
          // Falls back to the placeholder for the fourteen items those sheets
          // do not cover — see `packageSizes.ts` for which and why.
          boxSize: PACKAGE_SIZES[entry.name] ?? UNSET_BOX_SIZE,
          ...(entry.size ? { size: entry.size } : {}),
          ...(entry.remark ? { remark: entry.remark } : {}),
        }),
      ),
    )

    await Promise.all(
      STARTER_MACHINE_LEVELS.map((level) => saveMachine({ level, label: `Level ${level}` })),
    )

    await Promise.all(
      items.map((item, i) => setPlacement(item.id, { kind: 'base' }, STARTER_ITEMS[i].slots)),
    )

    return true
  })
}
