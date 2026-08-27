import { listItems, saveItem } from './items'
import { saveMachine } from './machines'
import { setPlacement } from './placements'
import { STARTER_ITEMS, STARTER_MACHINE_LEVELS } from '../starterCatalogue'

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
 * screen only ever shows the button when there is nothing to lose, and this
 * function double-checks the same thing so that it stays safe even if
 * something outside that gate calls it twice: a non-empty catalogue makes it
 * a no-op, and returns `false` to say so. */
export async function seedStarterCatalogue(): Promise<boolean> {
  if ((await listItems()).length > 0) return false

  const items = await Promise.all(
    STARTER_ITEMS.map((entry) =>
      saveItem({
        name: entry.name,
        price: entry.price,
        basePar: 5,
        boxSize: 1,
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
}
