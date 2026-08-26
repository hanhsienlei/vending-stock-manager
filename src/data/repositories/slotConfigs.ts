import { db } from '../db'
import { newId, now } from '../../domain/ids'
import type { Id, SlotConfig } from '../../domain/types'

export function listSlotConfigs(): Promise<SlotConfig[]> {
  return db.slotConfigs.toArray()
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
