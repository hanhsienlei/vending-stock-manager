import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../data/db'
import { exportBundle, downloadBundle, type Bundle } from './export'
import { newId, now } from '../domain/ids'

/** One row in every table the schema declares, so the per-table assertions
 * below have something to find. Written straight to Dexie rather than through
 * the repositories: this is a test of what the *database* holds, and going
 * through the write paths would only prove the repositories agree with
 * themselves. */
async function seedOneOfEverything(): Promise<void> {
  const itemId = newId()
  const machineId = newId()
  const runId = newId()
  const visitId = newId()

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

/** jsdom's `Blob` has no `text()`, so the file's actual bytes are read the
 * long way round. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

/** Puts a bundle back. Import is out of scope for this phase (design §2) —
 * the promise is that the JSON is complete enough to restore *by hand*. This
 * is that hand, mechanised, and it lives in the test rather than in
 * `src/backup/` because nothing ships it. */
async function restore(bundle: Bundle): Promise<void> {
  for (const table of db.tables) {
    await table.clear()
    await table.bulkAdd(bundle.tables[table.name] ?? [])
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('backup export', () => {
  it('carries every table and the schema version', async () => {
    await seedOneOfEverything()

    const bundle = await exportBundle()

    expect(bundle.schemaVersion).toBe(db.verno)
    // One assertion per table, deliberately: a bundle that silently omits a
    // table added in a later phase is worse than no bundle, because it looks
    // like a backup. Adding a table without adding a line here fails.
    expect(bundle.tables.items).toHaveLength(1)
    expect(bundle.tables.machines).toHaveLength(1)
    expect(bundle.tables.placements).toHaveLength(1)
    expect(bundle.tables.slotConfigs).toHaveLength(1)
    expect(bundle.tables.runs).toHaveLength(1)
    expect(bundle.tables.visits).toHaveLength(1)
    expect(bundle.tables.countLines).toHaveLength(1)
    expect(bundle.tables.storeroomBalances).toHaveLength(1)
    expect(bundle.tables.adjustments).toHaveLength(1)
    expect(Object.keys(bundle.tables)).toHaveLength(db.tables.length)
  })

  it('survives an empty database', async () => {
    const bundle = await exportBundle()

    expect(bundle.tables.items).toEqual([])
    expect(Object.keys(bundle.tables)).toHaveLength(db.tables.length)
  })

  it('stamps when it was taken', async () => {
    const bundle = await exportBundle()

    expect(bundle.exportedAt).toBeGreaterThan(0)
  })

  it('restores every row after the database is wiped', async () => {
    await seedOneOfEverything()
    const before = await exportBundle()

    // Through the file, not the object: the operator's recovery path is a
    // JSON file on disk, so anything that does not survive stringify/parse
    // is not actually backed up.
    const parsed = JSON.parse(JSON.stringify(before)) as Bundle

    for (const table of db.tables) await table.clear()
    expect(await db.items.count()).toBe(0)

    await restore(parsed)

    const after = await exportBundle()
    expect(after.tables).toEqual(before.tables)
  })

  it('restores a nested placement scope, not a flattened one', async () => {
    await seedOneOfEverything()
    const parsed = JSON.parse(JSON.stringify(await exportBundle())) as Bundle

    for (const table of db.tables) await table.clear()
    await restore(parsed)

    const placement = (await db.placements.toArray())[0]
    expect(placement.scope).toEqual({ kind: 'base' })
    expect(placement.slots).toEqual([1, 2])
  })
})

describe('downloadBundle', () => {
  // Typed with its argument so the blob it was handed can be read back below.
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:bundle')
  const revokeObjectURL = vi.fn()
  let clicked: HTMLAnchorElement | null = null

  beforeEach(() => {
    clicked = null
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    vi.stubGlobal('URL', Object.assign(Object.create(URL), URL, {
      createObjectURL, revokeObjectURL,
    }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked = this
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('hands the browser a named JSON file and releases the URL', async () => {
    await seedOneOfEverything()

    await downloadBundle()

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0]
    expect(blob.type).toBe('application/json')
    const bundle = JSON.parse(await readBlob(blob)) as Bundle
    expect(bundle.tables.items).toHaveLength(1)

    expect(clicked).not.toBeNull()
    expect(clicked!.download).toMatch(/^vending-stock-manager-\d{4}-\d{2}-\d{2}\.json$/)
    expect(clicked!.href).toBe('blob:bundle')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:bundle')
  })
})
