import type { SlotNeed } from './forecast'
import type { Id } from './types'

/** `${machineId}:${slotNumber}` — the key every per-slot map in this phase
 * uses. Distinct from `levelKey`, which pairs a slot with an item. */
export function slotKey(machineId: Id, slotNumber: number): string {
  return `${machineId}:${slotNumber}`
}

export interface PickInput {
  needs: SlotNeed[]
  /** `slotKey` → the slot's `accepts`, in preference order. */
  accepts: Map<string, Id[]>
  /** Items whose ledger balance is zero.
   *
   * **A binary, never a quantity** (design §3.7). Spec §6.2 resolves a slot
   * to the first accepted item "the storeroom is known to be out of" — and
   * the balance is an estimate, while the operator is standing in front of
   * the actual shelf. Rationing against a wrong estimate produces a list that
   * disagrees with what they can see, which they then have to undo in their
   * head. So: skip an item known to be out, and otherwise ask for the whole
   * need. */
  outOfStock: Set<Id>
  /** `slotKey`s whose total level has not moved across the rate window.
   *
   * Supplied by the caller because only it holds the period history. Paired
   * with a rate of zero it is design §4.4's `Nothing expected` list. */
  unmovedSlots: Set<string>
  /** `machineId` → the machine's floor level, which is what orders the walk. */
  levelOf: Map<Id, number>
}

export interface PickAssignment {
  machineId: Id
  slotNumber: number
  itemId: Id
  units: number
}

export interface PickLine {
  itemId: Id
  needed: number
  /** Every slot this line is going to, in walk order. */
  slots: PickAssignment[]
}

export interface PickList {
  /** One row per item, in the walk order of the first slot that wants it. */
  lines: PickLine[]
  /** Needs whose every accepted item is out of stock, or which accept
   * nothing at all. Not dropped silently: a slot that wants stock the
   * storeroom does not have is the clearest statement of a lost sale there
   * is, and it feeds the order suggestion directly. */
  unfulfillable: SlotNeed[]
  /** Slots selling nothing whose level has not moved — dead stock, or a tray
   * nobody has counted (design §4.4). Listed rather than picked. */
  quiet: SlotNeed[]
}

/** Resolve each slot's need to an item and aggregate the result per item.
 *
 * The walk order is machine level then slot number — the order the operator
 * physically meets the slots — so the `slots` list under an item reads down
 * the building, and so allocation's tiebreak later has the same shape.
 *
 * Pure: plain data in, plain data out. Consults no database, and rations
 * against nothing. */
export function buildPickList(input: PickInput): PickList {
  const { accepts, outOfStock, unmovedSlots, levelOf } = input

  const ordered = [...input.needs].sort((a, b) =>
    (levelOf.get(a.machineId) ?? 0) - (levelOf.get(b.machineId) ?? 0) ||
    a.machineId.localeCompare(b.machineId) ||
    a.slotNumber - b.slotNumber)

  const lines = new Map<Id, PickLine>()
  const unfulfillable: SlotNeed[] = []
  const quiet: SlotNeed[] = []

  for (const need of ordered) {
    const key = slotKey(need.machineId, need.slotNumber)

    // A rate of exactly zero AND a level that has not moved. Both halves are
    // required: a zero rate on its own is a slot that genuinely sells nothing
    // but is still being refilled, and a still level on its own is a slot
    // whose sales are being replaced as fast as they happen. `null` is
    // neither — a slot with no history is unknown, not quiet, and it keeps
    // its fallback need.
    if (need.rate === 0 && unmovedSlots.has(key)) {
      quiet.push(need)
      continue
    }

    if (need.need <= 0) continue

    const itemId = (accepts.get(key) ?? []).find((id) => !outOfStock.has(id))
    if (itemId === undefined) {
      unfulfillable.push(need)
      continue
    }

    const line = lines.get(itemId) ?? { itemId, needed: 0, slots: [] }
    line.needed += need.need
    line.slots.push({
      machineId: need.machineId,
      slotNumber: need.slotNumber,
      itemId,
      units: need.need,
    })
    lines.set(itemId, line)
  }

  return { lines: [...lines.values()], unfulfillable, quiet }
}
