import type { Id, ResolvedSlot } from './types'

export type SlotContents = { itemId: Id; qty: number }[]

export function slotTotal(contents: SlotContents): number {
  return contents.reduce((sum, entry) => sum + entry.qty, 0)
}

export function fillToCapacity(
  slot: ResolvedSlot,
  contents: SlotContents,
): SlotContents {
  const shortfall = slot.capacity - slotTotal(contents)
  if (shortfall <= 0) return contents.map((entry) => ({ ...entry }))

  const preferredId = slot.accepts[0]
  const next = contents.map((entry) => ({ ...entry }))
  const existing = next.find((entry) => entry.itemId === preferredId)

  if (existing) existing.qty += shortfall
  else next.unshift({ itemId: preferredId, qty: shortfall })

  return next
}
