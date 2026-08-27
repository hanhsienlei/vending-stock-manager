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
