import Dexie from 'dexie'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
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

  it('adds the storeroomBalances table', async () => {
    await db.open()
    expect(db.storeroomBalances).toBeDefined()
    expect(await db.storeroomBalances.toArray()).toEqual([])
  })

  it('indexes visits by machineId', async () => {
    await db.open()
    await db.visits.put({
      id: newId(), runId: 'r1', machineId: 'L7', status: 'draft', updatedAt: now(),
    })
    const found = await db.visits.where('machineId').equals('L7').toArray()
    expect(found).toHaveLength(1)
  })
})
