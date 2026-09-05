import { db } from '../data/db'
import { today } from '../domain/date'

/** Everything the database holds, in one plain object.
 *
 * `schemaVersion` is stamped in because a JSON file that does not say which
 * schema wrote it is a puzzle rather than a backup (design §14): the shape of
 * `countLines` changed at v2 and again at v3, and a bundle restored into the
 * wrong version would need that fact worked out by inspection.
 *
 * `tables` is keyed by table name rather than typed per table on purpose —
 * see `exportBundle`. */
export interface Bundle {
  schemaVersion: number
  exportedAt: number
  tables: Record<string, unknown[]>
}

/** Reads every table into a bundle.
 *
 * `db.tables` enumerates what the schema actually declares, so a table added
 * in a later version is carried without this file being edited. A hard-coded
 * list is the exact failure mode this exists to avoid: a backup that quietly
 * omits the newest table still looks like a backup, and the operator only
 * finds out when they need it.
 *
 * Rows are handed back as Dexie stored them — plain structured-clone data,
 * no Dates, no class instances anywhere in `domain/types.ts` — so the whole
 * bundle survives `JSON.stringify` unchanged, nested `PlacementScope`
 * included. That is what makes restoring it by hand possible. */
export async function exportBundle(): Promise<Bundle> {
  const tables: Record<string, unknown[]> = {}
  for (const table of db.tables) tables[table.name] = await table.toArray()
  return { schemaVersion: db.verno, exportedAt: Date.now(), tables }
}

/** The same bundle, handed to the browser as a downloaded file.
 *
 * A Blob, an object URL and a synthetic anchor click — the only way to
 * originate a download from a page without a server or a dependency. The URL
 * is revoked immediately afterwards; the browser has already taken its own
 * reference to the blob by the time `click()` returns, so releasing it here
 * frees the memory without cancelling the download.
 *
 * The filename carries the operator's local calendar day, not a UTC one, and
 * not a clock time: several backups on one day overwrite or suffix in the
 * downloads folder, which is the behaviour wanted — the useful backup is the
 * most recent, and a folder of timestamped near-duplicates is harder to
 * choose from under pressure. */
export async function downloadBundle(): Promise<void> {
  const bundle = await exportBundle()
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `vending-stock-manager-${today()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
