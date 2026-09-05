import Dexie, { type Table } from 'dexie'
import { db } from '../data/db'
import type { Bundle } from './export'

/** A refusal the operator is meant to read, not a crash.
 *
 * Every message names what is wrong with the *file* and, where the database
 * was already touched, what state it is now in. A bare `Error` from Dexie
 * three layers down says `ConstraintError` and tells them nothing. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

/** What an import is about to do, for the confirmation the UI puts in front
 * of it. Import destroys everything currently stored, so the operator has to
 * be able to see they picked the file they meant. */
export interface ImportPlan {
  rows: number
  /** The backup's own day, `yyyy-mm-dd`, read in the operator's timezone —
   * `domain/date.ts` explains at length why a UTC day is the wrong one. */
  takenOn: string
  /** The schema the backup was written at, and the one it is going into.
   * Both, because "an older backup" is not a thing an operator can act on
   * and "schema 2, and this build is 3" is. */
  schemaVersion: number
  currentSchemaVersion: number
  fromOlderSchema: boolean
}

export function planImport(bundle: Bundle): ImportPlan {
  let rows = 0
  for (const table of Object.values(bundle.tables)) rows += table.length
  return {
    rows,
    takenOn: new Date(bundle.exportedAt).toLocaleDateString('en-CA'),
    schemaVersion: bundle.schemaVersion,
    currentSchemaVersion: db.verno,
    fromOlderSchema: bundle.schemaVersion < db.verno,
  }
}

/** Parses a backup file and refuses anything that is not one.
 *
 * Nothing here touches the database. That is the point: validation is the
 * whole of the safety, because `importBundle` deletes the database before it
 * writes a single row, and by then there is nothing left to change its mind
 * about. Every rejection below happens with the operator's data intact. */
export function readBundle(text: string): Bundle {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ImportError('That is not a JSON file, so it is not a backup.')
  }
  return validateBundle(parsed)
}

/** The same, from a file the operator picked.
 *
 * `FileReader` rather than `Blob.text()` for the reason `export.test.ts`
 * gives: jsdom's `Blob` has no `text()`, so the tested path and the shipped
 * path would otherwise be different code. */
export function readBundleFile(file: File): Promise<Bundle> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(readBundle(String(reader.result)))
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new ImportError('That file could not be read.'))
    reader.readAsText(file)
  })
}

/** Puts a bundle back, over the top of whatever is there.
 *
 * **The database is deleted, not cleared.** The scenario this exists for is
 * the one the export button warns about: the operator has rolled the app
 * bundle back a version, and the database on disk was already upgraded by
 * the newer one. Raw IndexedDB refuses `open(name, 30)` against a database
 * stored at 40 — but Dexie does not stop there. It catches that
 * `VersionError`, retries with no version at all, finds the schema it
 * declares is not the one installed, and *patches* the missing tables and
 * indexes into the newer database in place, bumping it a native version
 * (dexie.js, `tryOpenDB`; pinned by a test in `import.test.ts`). So an
 * import that opened the database and cleared its tables would not fail
 * loudly — it would quietly restore the backup into the newer build's
 * database, leaving the newer stores and version underneath and calling it
 * recovery.
 *
 * `Dexie.delete(name)` never opens anything: it constructs a throwaway Dexie
 * with no versions declared and calls `indexedDB.deleteDatabase`, which has
 * no version to disagree with. The database that comes back is this build's
 * own, built from nothing. That is what makes recovery an operator action
 * rather than a developer one with dev tools open.
 *
 * A bundle written by an older schema is written through a staging database
 * declared at *that* version, then handed to the real `db`, which upgrades
 * it on open exactly as it would upgrade the operator's own data. Restoring
 * a v2 backup into a v3 build any other way would leave `countLines` rows
 * with no `price` — rows that look restored and price a run at nothing. The
 * staging schema declares only the primary key, because the indexes are
 * rebuilt by the upgrade anyway and the bundle does not carry them. */
export async function importBundle(bundle: Bundle): Promise<void> {
  // Before anything is destroyed. A malformed or too-new file must cost the
  // operator nothing but the tap.
  const checked = validateBundle(bundle)

  // `disableAutoOpen: false` so the singleton is left as it was found —
  // closed but willing to open — rather than poisoned with a
  // `DatabaseClosed` error if the delete below throws.
  db.close({ disableAutoOpen: false })
  await Dexie.delete(db.name)

  if (checked.schemaVersion < db.verno) await writeThroughOldSchema(checked)

  await db.open()

  if (checked.schemaVersion === db.verno) await writeRows(db, checked)
}

async function writeThroughOldSchema(bundle: Bundle): Promise<void> {
  const names = Object.keys(bundle.tables)
  // Nothing to stage: opening `db` below creates the current schema empty,
  // which is the same result and one fewer connection.
  if (names.length === 0) return

  const staging = new Dexie(db.name)
  staging.version(bundle.schemaVersion).stores(
    Object.fromEntries(names.map((name) => [name, 'id'])),
  )
  try {
    await staging.open()
    await writeRows(staging, bundle)
  } finally {
    staging.close()
  }
}

/** Every row of every table, in one transaction.
 *
 * One transaction rather than one per table is the whole answer to "a failed
 * import must not leave the database half-written": IndexedDB rolls the
 * transaction back on any error, so a bundle whose last table will not store
 * leaves an empty database rather than a plausible-looking partial one. An
 * empty database is honest — the operator can see it failed and pick another
 * file. Half a restore is the state that gets trusted and shouldn't be. */
async function writeRows(target: Dexie, bundle: Bundle): Promise<void> {
  const tables: Table[] = target.tables.filter(
    (table) => (bundle.tables[table.name] ?? []).length > 0,
  )
  // Dexie rejects a transaction with no tables in scope, and an empty backup
  // is a legitimate one — the export survives an empty database.
  if (tables.length === 0) return

  try {
    await target.transaction('rw', tables, async () => {
      for (const table of tables) await table.bulkAdd(bundle.tables[table.name] ?? [])
    })
  } catch (error) {
    throw new ImportError(
      `The backup was read but could not be stored: ${describe(error)}. `
      + 'Nothing from it was kept — the database is empty, so another backup '
      + 'can be restored over it.',
    )
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const NOT_A_BACKUP = 'That file is not a backup written by this app.'

function validateBundle(value: unknown): Bundle {
  if (!isRecord(value)) throw new ImportError(NOT_A_BACKUP)

  const { schemaVersion, tables } = value
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new ImportError(NOT_A_BACKUP)
  }
  if (!isRecord(tables)) throw new ImportError(NOT_A_BACKUP)

  for (const [name, rows] of Object.entries(tables)) {
    if (!Array.isArray(rows)) {
      throw new ImportError(`The backup's "${name}" is not a list of rows.`)
    }
    if (!rows.every(isRecord)) {
      throw new ImportError(`The backup's "${name}" holds something that is not a row.`)
    }
  }

  if (schemaVersion > db.verno) {
    throw new ImportError(
      `That backup was written by a newer version of the app — schema ${schemaVersion}, `
      + `and this one reads schema ${db.verno}. Install the newer version and restore `
      + 'with that. Nothing has been changed.',
    )
  }

  // Only at this build's own version: an older bundle may well name a table
  // that has since been dropped, and dropping it is what restoring it means.
  // At the current version an unknown table is a file from somewhere else,
  // and silently ignoring it would restore a backup minus a table.
  if (schemaVersion === db.verno) {
    const known = new Set(db.tables.map((table) => table.name))
    for (const name of Object.keys(tables)) {
      if (!known.has(name)) {
        throw new ImportError(
          `The backup has a table this build does not know about — "${name}". `
          + 'Nothing has been changed.',
        )
      }
    }
  }

  const exportedAt = value.exportedAt
  return {
    schemaVersion,
    exportedAt: typeof exportedAt === 'number' ? exportedAt : 0,
    tables: tables as Record<string, unknown[]>,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
