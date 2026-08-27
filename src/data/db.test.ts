import Dexie from 'dexie'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { historyForMachine } from './repositories/visits'
import { newId, now } from '../domain/ids'

const DB_NAME = 'vending-stock-manager'

/** Builds the database exactly as version 1 left it — no `filled` field on
 * `countLines`, no `machineId` index on `visits`, no `storeroomBalances`
 * table — so the version-2 upgrade under test runs against data shaped the
 * way an operator's already-seeded browser would actually hold it. */
function openLegacyV1(): Dexie {
  const legacy = new Dexie(DB_NAME)
  legacy.version(1).stores({
    items: 'id, name',
    machines: 'id, level',
    placements: 'id, itemId',
    slotConfigs: 'id, [machineId+slotNumber]',
    runs: 'id, date',
    visits: 'id, runId, [runId+machineId]',
    countLines: 'id, visitId, [visitId+slotNumber]',
  })
  return legacy
}

/** The database exactly as version 2 left it — `filled` present on count
 * lines, `machineId` indexed on visits, `storeroomBalances` present, but no
 * `price` and no `adjustments`. This is the shape an operator's browser
 * actually holds after the first real restock run. */
function openLegacyV2(): Dexie {
  const legacy = new Dexie(DB_NAME)
  legacy.version(1).stores({
    items: 'id, name',
    machines: 'id, level',
    placements: 'id, itemId',
    slotConfigs: 'id, [machineId+slotNumber]',
    runs: 'id, date',
    visits: 'id, runId, [runId+machineId]',
    countLines: 'id, visitId, [visitId+slotNumber]',
  })
  legacy.version(2).stores({
    items: 'id, name',
    machines: 'id, level',
    placements: 'id, itemId',
    slotConfigs: 'id, [machineId+slotNumber]',
    runs: 'id, date',
    visits: 'id, runId, [runId+machineId], machineId',
    countLines: 'id, visitId, [visitId+slotNumber]',
    storeroomBalances: 'id, itemId',
  })
  return legacy
}

describe('schema version 2 upgrade', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete(DB_NAME)
  })

  it('derives filled from after > before for pre-existing rows, and leaves rows that already carry filled untouched', async () => {
    const legacy = openLegacyV1()
    await legacy.open()

    const wasToppedUp = {
      id: newId(), visitId: 'v1', slotNumber: 58, itemId: 'coke',
      before: 3, after: 8, touched: true, updatedAt: now(),
    }
    const wasLeftAlone = {
      id: newId(), visitId: 'v1', slotNumber: 59, itemId: 'coke',
      before: 3, after: 3, touched: false, updatedAt: now(),
    }
    // Simulates a row already migrated once: `filled` is present and false
    // even though after > before, so a re-run of the upgrade must not
    // clobber it back to the derived value.
    const alreadyMigrated = {
      id: newId(), visitId: 'v1', slotNumber: 60, itemId: 'coke',
      before: 3, after: 8, touched: true, filled: false, updatedAt: now(),
    }

    await legacy.table('countLines').bulkPut([wasToppedUp, wasLeftAlone, alreadyMigrated])
    legacy.close()

    // Reopening the app's real `db` (declared through version 2) against the
    // same underlying database is what actually runs the upgrade.
    await db.open()

    const lines = await db.countLines.toArray()
    const byId = new Map(lines.map((l) => [l.id, l]))

    expect(byId.get(wasToppedUp.id)?.filled).toBe(true)
    expect(byId.get(wasLeftAlone.id)?.filled).toBe(false)
    expect(byId.get(alreadyMigrated.id)?.filled).toBe(false)
  })

  it('adds the storeroomBalances table to a database that already held data', async () => {
    const legacy = openLegacyV1()
    await legacy.open()
    await legacy.table('items').put({ id: 'coke', name: 'Coke', basePar: 5 })
    legacy.close()

    await db.open()

    expect(await db.storeroomBalances.toArray()).toEqual([])
    // The pre-existing row must survive the upgrade that adds the table.
    expect(await db.items.get('coke')).toMatchObject({ name: 'Coke' })
  })

  // The point of this test is the *order*: the visits are written through the
  // version-1 schema, which has no `machineId` index, and only then is the
  // version-2 database opened. Writing them afterwards would prove nothing —
  // a fresh v2 database carries the index by declaration. What has to hold is
  // that the upgrade back-fills the new index from rows already there.
  //
  // If it ever did not, `historyForMachine` would return nothing for every
  // machine, every slot would seed at 0, and finalize would write those zeros
  // over the operator's carried-forward levels.
  it('indexes visits that already existed before the upgrade', async () => {
    const legacy = openLegacyV1()
    await legacy.open()

    const onL7 = {
      id: newId(), runId: 'r1', machineId: 'L7',
      status: 'finalized', finalizedAt: now(), updatedAt: now(),
    }
    const onL2 = {
      id: newId(), runId: 'r1', machineId: 'L2',
      status: 'finalized', finalizedAt: now(), updatedAt: now(),
    }
    await legacy.table('visits').bulkPut([onL7, onL2])
    legacy.close()

    await db.open()

    const found = await db.visits.where('machineId').equals('L7').toArray()
    expect(found.map((v) => v.id)).toEqual([onL7.id])
  })

  // The same guarantee one level up, at the call site that actually depends on
  // it — a pre-upgrade visit must still be found as history for its machine.
  it('carries a pre-upgrade visit into historyForMachine', async () => {
    const legacy = openLegacyV1()
    await legacy.open()

    const visitId = newId()
    await legacy.table('visits').put({
      id: visitId, runId: 'r1', machineId: 'L7',
      status: 'finalized', finalizedAt: now(), updatedAt: now(),
    })
    await legacy.table('countLines').put({
      id: newId(), visitId, slotNumber: 58, itemId: 'coke',
      before: 3, after: 8, touched: true, updatedAt: now(),
    })
    legacy.close()

    await db.open()

    const history = await historyForMachine('L7')
    expect(history).toHaveLength(1)
    expect(history[0].lines.map((l) => l.after)).toEqual([8])
  })
})

describe('schema version 3 upgrade', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete(DB_NAME)
  })

  // v3 is the first migration to run against real data — v2 was done while
  // the database was empty, which is why its risk was acceptable then and is
  // not now. So this writes through v2 first and opens v3 second.
  it('backfills price on count lines that predate the field', async () => {
    const legacy = openLegacyV2()
    await legacy.open()
    await legacy.table('items').put({
      id: 'coke', name: 'Coke', price: 4.5, basePar: 5, boxSize: 24, updatedAt: 1,
    })
    const lineId = newId()
    await legacy.table('countLines').put({
      id: lineId, visitId: 'v1', slotNumber: 58, itemId: 'coke',
      before: 3, after: 8, touched: true, filled: true, updatedAt: 1,
    })
    legacy.close()

    await db.open()

    expect((await db.countLines.get(lineId))?.price).toBe(4.5)
  })

  it('backfills a deleted item\'s line at zero rather than leaving it undefined', async () => {
    const legacy = openLegacyV2()
    await legacy.open()
    const lineId = newId()
    // No matching item row: the item was deleted, which deleteItem allows —
    // it deliberately leaves CountLine rows alone so past counts are not
    // rewritten.
    await legacy.table('countLines').put({
      id: lineId, visitId: 'v1', slotNumber: 58, itemId: 'gone',
      before: 3, after: 8, touched: true, filled: true, updatedAt: 1,
    })
    legacy.close()

    await db.open()

    expect((await db.countLines.get(lineId))?.price).toBe(0)
  })

  it('leaves a price that is already present untouched', async () => {
    const legacy = openLegacyV2()
    await legacy.open()
    await legacy.table('items').put({
      id: 'coke', name: 'Coke', price: 9.99, basePar: 5, boxSize: 24, updatedAt: 1,
    })
    const lineId = newId()
    // Simulates a row already migrated once, or written after the upgrade,
    // at a price that has since changed on the item.
    await legacy.table('countLines').put({
      id: lineId, visitId: 'v1', slotNumber: 58, itemId: 'coke',
      before: 3, after: 8, touched: true, filled: true, price: 4.5, updatedAt: 1,
    })
    legacy.close()

    await db.open()

    expect((await db.countLines.get(lineId))?.price).toBe(4.5)
  })

  it('keeps every pre-upgrade visit and count line', async () => {
    const legacy = openLegacyV2()
    await legacy.open()
    await legacy.table('visits').put({
      id: 'v1', runId: 'r1', machineId: 'L7',
      status: 'finalized', finalizedAt: 1, updatedAt: 1,
    })
    await legacy.table('countLines').put({
      id: newId(), visitId: 'v1', slotNumber: 58, itemId: 'coke',
      before: 3, after: 8, touched: true, filled: true, updatedAt: 1,
    })
    legacy.close()

    await db.open()

    expect(await db.visits.toArray()).toHaveLength(1)
    expect(await db.countLines.toArray()).toHaveLength(1)
  })

  it('adds an adjustments table indexed for the queries Phase 2 makes', async () => {
    await db.open()

    await db.adjustments.put({
      id: newId(), itemId: 'coke', locationKind: 'machine',
      machineId: 'L7', slotNumber: 58, reason: 'expired', units: -2,
      occurredAt: 1, updatedAt: 1,
    })

    expect(await db.adjustments.where('machineId').equals('L7').toArray())
      .toHaveLength(1)
    expect(await db.adjustments.where('itemId').equals('coke').toArray())
      .toHaveLength(1)
    expect(
      await db.adjustments.where('[machineId+slotNumber]').equals(['L7', 58]).toArray(),
    ).toHaveLength(1)
  })
})
