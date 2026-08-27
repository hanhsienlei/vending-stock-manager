import { db } from '../db'
import { listItems } from './items'
import { listPlacements } from './placements'
import { newId, now } from '../../domain/ids'
import { resolveMachineMap } from '../../domain/placement'
import type { Id, SlotConfig } from '../../domain/types'

export function listSlotConfigs(): Promise<SlotConfig[]> {
  return db.slotConfigs.toArray()
}

/** Freeze the physical capacity of the given slots on the given machines,
 * exactly as they resolve *right now*, before something changes what those
 * slots hold.
 *
 * Capacity is physical and shared across everything in a slot (spec §4.3).
 * A slot with no SlotConfig has no stored capacity, so resolution falls back
 * to the basePar of whichever accepted item sorts first — which moves the
 * moment a second label is added. Pinning first makes the addition a change
 * of contents only.
 *
 * Both editing directions go through here: a machine-scoped edit at the
 * machine pins one machine, and a base placement — which lands on all fifteen
 * at once — pins every machine it touches. A slot nothing stocks yet resolves
 * to nothing and is deliberately left alone, so the first item placed still
 * seeds its capacity from basePar. Machines already carrying a SlotConfig are
 * already pinned and are not touched: `ensureSlotConfig` is create-only. */
export async function pinSlotCapacities(
  machineIds: Id[],
  slotNumbers: number[],
): Promise<void> {
  if (machineIds.length === 0 || slotNumbers.length === 0) return

  const [items, placements, configs] = await Promise.all([
    listItems(), listPlacements(), listSlotConfigs(),
  ])

  const pins = machineIds.flatMap((machineId) => {
    const map = resolveMachineMap(machineId, items, placements, configs)
    return slotNumbers.flatMap((slotNumber) => {
      const slot = map.find((s) => s.slotNumber === slotNumber)
      return slot ? [{ machineId, slot }] : []
    })
  })

  // One transaction for the batch: the nested `ensureSlotConfig` calls join it
  // rather than opening their own, so a set of pins lands together or not at all.
  await db.transaction('rw', db.slotConfigs, async () => {
    for (const { machineId, slot } of pins) {
      await ensureSlotConfig(machineId, slot.slotNumber, {
        capacity: slot.capacity, accepts: slot.accepts,
      })
    }
  })
}

/** Materialise a slot's physical config if — and only if — it has none yet,
 * pinning the capacity and preference order it resolves to today. Used before
 * changing what a slot holds, so the change cannot move the capacity. The
 * lookup and the insert share one transaction; a config that already exists
 * is authoritative and is left untouched. */
export async function ensureSlotConfig(
  machineId: Id,
  slotNumber: number,
  seed: { capacity: number; accepts: Id[] },
): Promise<SlotConfig> {
  return db.transaction('rw', db.slotConfigs, async () => {
    const existing = await db.slotConfigs
      .where('[machineId+slotNumber]')
      .equals([machineId, slotNumber])
      .first()
    if (existing) return existing

    const config: SlotConfig = {
      id: newId(),
      machineId,
      slotNumber,
      capacity: seed.capacity,
      accepts: [...seed.accepts],
      updatedAt: now(),
    }
    await db.slotConfigs.put(config)
    return config
  })
}

export async function setSlotConfig(
  machineId: Id,
  slotNumber: number,
  patch: { capacity?: number; accepts?: Id[] },
): Promise<SlotConfig> {
  return db.transaction('rw', db.slotConfigs, async () => {
    const existing = await db.slotConfigs
      .where('[machineId+slotNumber]')
      .equals([machineId, slotNumber])
      .first()

    const capacity = patch.capacity ?? existing?.capacity
    if (capacity === undefined) {
      throw new Error(
        `Cannot create slot config ${machineId}/${slotNumber} without a capacity — capacity is operator-set and has no default`,
      )
    }

    const config: SlotConfig = {
      id: existing?.id ?? newId(),
      machineId,
      slotNumber,
      capacity,
      accepts: patch.accepts ?? existing?.accepts ?? [],
      updatedAt: now(),
    }

    await db.slotConfigs.put(config)
    return config
  })
}
