import { db } from '../db'
import { now } from '../../domain/ids'
import { PACKAGE_SIZES, UNSET_BOX_SIZE } from '../packageSizes'

export interface BackfillResult {
  updated: { name: string; boxSize: number }[]
  /** Items left at the placeholder because the sheets do not cover them —
   * reported so the gap is visible rather than silent. */
  unmatched: string[]
}

/** Carries the paper stocktake sheets' package sizes into a catalogue that
 * already exists (`src/data/packageSizes.ts` explains where the figures come
 * from and which items are deliberately absent).
 *
 * Re-seeding cannot do this job: `seedStarterCatalogue` refuses to run once
 * any item exists, deliberately — that gate is the safety mechanism standing
 * between a tap and a wiped catalogue. The operator's phone has had real
 * data since the first run, so the seed will never execute there again.
 *
 * **Only ever writes to an item still at `UNSET_BOX_SIZE`.** A size the
 * operator has set by hand is their own figure — they have seen the actual
 * carton — and always wins. That rule is also what makes this idempotent:
 * after a successful run every matched item is above the placeholder, so a
 * second run matches nothing and writes nothing.
 *
 * One transaction, so a failure partway leaves the catalogue as it was
 * rather than half-converted.
 *
 * The one edge it does not cover: an item the operator deliberately sets
 * back to 1 would be re-filled on the next run. There is no way to tell that
 * apart from "never set" without storing a marker, and the case is not worth
 * a schema row — a real carton of one does not exist. */
export async function backfillBoxSizes(): Promise<BackfillResult> {
  return db.transaction('rw', db.items, async () => {
    const items = await db.items.toArray()
    const updated: BackfillResult['updated'] = []
    const unmatched: string[] = []

    for (const item of items) {
      const size = PACKAGE_SIZES[item.name]

      if (size === undefined) {
        unmatched.push(item.name)
        continue
      }
      // Their figure, not ours.
      if (item.boxSize !== UNSET_BOX_SIZE) continue

      await db.items.put({ ...item, boxSize: size, updatedAt: now() })
      updated.push({ name: item.name, boxSize: size })
    }

    return { updated, unmatched }
  })
}
