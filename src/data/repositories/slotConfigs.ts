import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, SlotConfig } from '../../domain/types'

export function listSlotConfigs(): Promise<SlotConfig[]> {
  return db.slotConfigs.toArray()
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
