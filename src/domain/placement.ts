import type {
  Id, Item, ItemPlacement, MachineMap, ResolvedSlot, SlotConfig,
} from './types'

export function effectivePlacement(
  itemId: Id,
  machineId: Id,
  placements: ItemPlacement[],
): ItemPlacement | undefined {
  const forItem = placements.filter((p) => p.itemId === itemId)
  return (
    forItem.find((p) => p.scope.kind === 'machine' && p.scope.machineId === machineId) ??
    forItem.find((p) => p.scope.kind === 'base')
  )
}

export function resolveMachineMap(
  machineId: Id,
  items: Item[],
  placements: ItemPlacement[],
  slotConfigs: SlotConfig[],
): MachineMap {
  const byId = new Map(items.map((i) => [i.id, i]))
  const bySlot = new Map<number, Id[]>()

  for (const item of items) {
    const placement = effectivePlacement(item.id, machineId, placements)
    if (!placement) continue
    for (const slotNumber of placement.slots) {
      const existing = bySlot.get(slotNumber) ?? []
      existing.push(item.id)
      bySlot.set(slotNumber, existing)
    }
  }

  const configFor = (slotNumber: number) =>
    slotConfigs.find((c) => c.machineId === machineId && c.slotNumber === slotNumber)

  const slots: ResolvedSlot[] = []

  for (const [slotNumber, itemIds] of bySlot) {
    const config = configFor(slotNumber)
    const preferred = (config?.accepts ?? []).filter((id) => itemIds.includes(id))
    const rest = itemIds
      .filter((id) => !preferred.includes(id))
      .sort((a, b) => (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? ''))
    const accepts = [...preferred, ...rest]

    slots.push({
      slotNumber,
      capacity: config?.capacity ?? byId.get(accepts[0])?.basePar ?? 0,
      accepts,
    })
  }

  return slots.sort((a, b) => a.slotNumber - b.slotNumber)
}
