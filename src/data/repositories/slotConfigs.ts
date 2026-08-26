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
  const existing = await db.slotConfigs
    .where('[machineId+slotNumber]')
    .equals([machineId, slotNumber])
    .first()

  const config: SlotConfig = {
    id: existing?.id ?? newId(),
    machineId,
    slotNumber,
    capacity: patch.capacity ?? existing?.capacity ?? 0,
    accepts: patch.accepts ?? existing?.accepts ?? [],
    updatedAt: now(),
  }

  await db.slotConfigs.put(config)
  return config
}
