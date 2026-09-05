import { describe, it, expect, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { db } from '../data/db'
import { exportBundle, type Bundle } from './export'
import {
  ImportError, importBundle, planImport, readBundle, readBundleFile,
} from './import'
import { newId, now } from '../domain/ids'

const itemId = newId()
const machineId = newId()
const runId = newId()
const visitId = newId()

/** One row in every table, the same shape `export.test.ts` seeds, written
 * straight to Dexie for the same reason: this is a test of what the database
 * holds, not of whether the repositories agree with themselves. */
async function seedOneOfEverything(): Promise<void> {
  await db.items.add({
    id: itemId, name: 'Coke', price: 4.5, basePar: 8, boxSize: 24, updatedAt: now(),
  })
  await db.machines.add({ id: machineId, label: 'Lift lobby', level: 4, updatedAt: now() })
  await db.placements.add({
    id: newId(), itemId, scope: { kind: 'base' }, slots: [1, 2], updatedAt: now(),
  })
  await db.slotConfigs.add({
    id: newId(), machineId, slotNumber: 1, capacity: 10, accepts: [itemId], updatedAt: now(),
  })
  await db.runs.add({ id: runId, date: '2026-09-04', createdAt: now(), updatedAt: now() })
  await db.visits.add({
    id: visitId, runId, machineId, status: 'finalized', finalizedAt: now(), updatedAt: now(),
  })
  await db.countLines.add({
    id: newId(), visitId, slotNumber: 1, itemId,
    before: 3, after: 10, touched: true, filled: true, price: 4.5, updatedAt: now(),
  })
  await db.storeroomBalances.add({
    id: newId(), itemId, units: 137, updatedAt: now(), verifiedAt: now(),
  })
  await db.adjustments.add({
    id: newId(), itemId, locationKind: 'storeroom', reason: 'delivery',
    units: 24, occurredAt: now(), updatedAt: now(),
  })
}

/** A bundle written by this build, through the file rather than the object —
 * the operator's recovery path is JSON on disk. */
async function backupOnDisk(): Promise<string> {
  return JSON.stringify(await exportBundle())
}

/** Every table this build declares, empty. Handy for hand-built bundles that
 * only care about one or two of them. */
function emptyTables(): Record<string, unknown[]> {
  return Object.fromEntries(db.tables.map((t) => [t.name, []]))
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('readBundle', () => {
  it('accepts a bundle this build wrote', async () => {
    await seedOneOfEverything()

    const bundle = readBundle(await backupOnDisk())

    expect(bundle.schemaVersion).toBe(db.verno)
    expect(bundle.tables.items).toHaveLength(1)
  })

  it('rejects a file that is not JSON', () => {
    expect(() => readBundle('not a backup at all')).toThrow(ImportError)
    expect(() => readBundle('not a backup at all')).toThrow(/not a JSON file/i)
  })

  it('rejects JSON that is not a backup', () => {
    expect(() => readBundle('[1, 2, 3]')).toThrow(/not a backup/i)
    expect(() => readBundle('{}')).toThrow(/not a backup/i)
    expect(() => readBundle('{"schemaVersion":3,"tables":null}')).toThrow(/not a backup/i)
    expect(() => readBundle('{"schemaVersion":"3","tables":{}}')).toThrow(/not a backup/i)
  })

  it('rejects a table that is not a list of rows', () => {
    expect(() => readBundle('{"schemaVersion":3,"tables":{"items":42}}'))
      .toThrow(/items/)
    expect(() => readBundle('{"schemaVersion":3,"tables":{"items":[1,2]}}'))
      .toThrow(/items/)
  })

  it('rejects a bundle from a newer schema, naming both versions', () => {
    const newer = JSON.stringify({
      schemaVersion: db.verno + 1, exportedAt: Date.now(), tables: emptyTables(),
    })

    expect(() => readBundle(newer)).toThrow(ImportError)
    // Both numbers, so the operator can tell which build to go and install.
    expect(() => readBundle(newer)).toThrow(new RegExp(String(db.verno + 1)))
    expect(() => readBundle(newer)).toThrow(new RegExp(String(db.verno)))
  })

  it('rejects a table this build has never heard of at its own schema version', () => {
    const strange = JSON.stringify({
      schemaVersion: db.verno, exportedAt: Date.now(),
      tables: { ...emptyTables(), receipts: [] },
    })

    expect(() => readBundle(strange)).toThrow(/receipts/)
  })

  it('accepts an unknown table from an older schema, which may since have been dropped', () => {
    const older = JSON.stringify({
      schemaVersion: 1, exportedAt: Date.now(), tables: { items: [], scratch: [] },
    })

    expect(readBundle(older).schemaVersion).toBe(1)
  })
})

describe('planImport', () => {
  it('counts the rows and dates the backup', async () => {
    await seedOneOfEverything()
    const bundle = readBundle(await backupOnDisk())

    const plan = planImport(bundle)

    expect(plan.rows).toBe(9)
    expect(plan.takenOn).toBe(new Date().toLocaleDateString('en-CA'))
    expect(plan.fromOlderSchema).toBe(false)
    expect(plan.schemaVersion).toBe(db.verno)
  })

  it('flags a bundle from an older schema, which is restored but upgraded', () => {
    const plan = planImport({ schemaVersion: 2, exportedAt: Date.now(), tables: { items: [{}] } })

    expect(plan.fromOlderSchema).toBe(true)
    expect(plan.schemaVersion).toBe(2)
  })
})

describe('importBundle', () => {
  it('replaces everything the database holds with the bundle rows', async () => {
    await seedOneOfEverything()
    const bundle = readBundle(await backupOnDisk())

    // Something else entirely in the database by the time it is restored.
    await db.items.clear()
    await db.items.add({
      id: newId(), name: 'Wrong', price: 1, basePar: 1, boxSize: 1, updatedAt: now(),
    })
    await db.machines.clear()

    await importBundle(bundle)

    expect((await exportBundle()).tables).toEqual(bundle.tables)
    expect(await db.items.count()).toBe(1)
    expect((await db.items.toArray())[0].name).toBe('Coke')
  })

  it('touches nothing when the bundle is from a newer schema', async () => {
    await seedOneOfEverything()
    const before = await exportBundle()

    await expect(importBundle({
      schemaVersion: db.verno + 1, exportedAt: Date.now(), tables: { items: [] },
    })).rejects.toThrow(ImportError)

    expect((await exportBundle()).tables).toEqual(before.tables)
  })

  it('touches nothing when a row in the bundle is not a row', async () => {
    await seedOneOfEverything()
    const before = await exportBundle()

    await expect(importBundle({
      schemaVersion: db.verno, exportedAt: Date.now(),
      tables: { ...emptyTables(), items: ['nonsense'] },
    })).rejects.toThrow(ImportError)

    expect((await exportBundle()).tables).toEqual(before.tables)
  })

  it('leaves an empty database, not a half-written one, when a row cannot be stored', async () => {
    const duplicate = { id: machineId, label: 'Lift lobby', level: 4, updatedAt: now() }

    await expect(importBundle({
      schemaVersion: db.verno, exportedAt: Date.now(),
      tables: {
        ...emptyTables(),
        items: [{ id: itemId, name: 'Coke', price: 4.5, basePar: 8, boxSize: 24, updatedAt: now() }],
        // Two rows with one id. `items` is written first and succeeds, so a
        // surviving Coke would prove the writes were not rolled back.
        machines: [duplicate, duplicate],
      },
    })).rejects.toThrow()

    expect(await db.items.count()).toBe(0)
    expect(await db.machines.count()).toBe(0)
    // Still openable and still this build's schema — an empty database the
    // operator can retry into, not a broken one.
    expect(db.isOpen()).toBe(true)
    expect(db.verno).toBe(3)
  })

  it('restores a bundle from an older schema and runs the upgrades over it', async () => {
    // A v2 bundle: no `adjustments` table at all, and `countLines` rows with
    // no `price` — the field v3 added and backfills from the item.
    const bundle: Bundle = {
      schemaVersion: 2,
      exportedAt: Date.now(),
      tables: {
        items: [{
          id: itemId, name: 'Coke', price: 4.5, basePar: 8, boxSize: 24, updatedAt: now(),
        }],
        machines: [{ id: machineId, label: 'Lift lobby', level: 4, updatedAt: now() }],
        placements: [],
        slotConfigs: [],
        runs: [{ id: runId, date: '2026-09-04', createdAt: now(), updatedAt: now() }],
        visits: [{
          id: visitId, runId, machineId, status: 'finalized',
          finalizedAt: now(), updatedAt: now(),
        }],
        countLines: [{
          id: newId(), visitId, slotNumber: 1, itemId,
          before: 3, after: 10, touched: true, filled: true, updatedAt: now(),
        }],
        storeroomBalances: [],
      },
    }

    await importBundle(bundle)

    expect(db.verno).toBe(3)
    expect((await db.countLines.toArray())[0].price).toBe(4.5)
    expect(await db.adjustments.count()).toBe(0)
    expect(await db.items.count()).toBe(1)
  })

  it('restores into a database a newer app bundle has already upgraded', async () => {
    await seedOneOfEverything()
    const backup = readBundle(await backupOnDisk())
    await upgradedByANewerBundle()

    await importBundle(backup)

    // Recreated at *this* build's version, from nothing — not opened,
    // cleared and refilled. Native 30 is Dexie's `version(3)`; anything
    // higher would mean the newer database was still underneath.
    expect(db.isOpen()).toBe(true)
    expect(db.backendDB().version).toBe(30)
    expect(db.backendDB().objectStoreNames.contains('somethingNew')).toBe(false)
    expect((await exportBundle()).tables).toEqual(backup.tables)
  })

  // Not a test of our code but of the state it has to rescue the operator
  // from, and the reason import deletes rather than clears. Raw IndexedDB
  // refuses `open(name, 30)` against a database stored at 40 — but Dexie
  // catches that VersionError, retries with no version at all, finds the
  // schema it expects is not the one installed, and patches the missing
  // tables and indexes into the newer database in place (bumping it to 41).
  // So the rolled-back build appears to work while running on the newer
  // build's data and stores. Clearing tables through that connection would
  // "restore" the backup into that hybrid and leave it there. Deleting the
  // database is what makes the restore a restore.
  it('is needed because reopening the newer database silently patches it instead', async () => {
    await seedOneOfEverything()
    await upgradedByANewerBundle()

    await db.open()

    expect(db.backendDB().version).toBeGreaterThan(30)
    expect(db.backendDB().objectStoreNames.contains('somethingNew')).toBe(true)
  })
})

/** Leaves the database on disk where a newer app bundle would leave it: one
 * schema version on, with a table this build has never heard of, and the
 * running (rolled-back) `db` closed. */
async function upgradedByANewerBundle(): Promise<void> {
  const newer = new Dexie(db.name)
  newer.version(db.verno + 1).stores({
    ...Object.fromEntries(db.tables.map((table) => [table.name, 'id'])),
    somethingNew: 'id',
  })
  await newer.open()
  await newer.table('somethingNew').add({ id: newId() })
  newer.close()
  db.close()
}

describe('readBundleFile', () => {
  it('reads a picked file', async () => {
    await seedOneOfEverything()
    const text = await backupOnDisk()
    const file = new File([text], 'backup.json', { type: 'application/json' })

    const bundle = await readBundleFile(file)

    expect(bundle.tables.items).toHaveLength(1)
  })

  it('rejects a picked file that is not a backup', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })

    await expect(readBundleFile(file)).rejects.toThrow(ImportError)
  })
})
