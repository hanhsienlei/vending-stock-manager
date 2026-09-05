import type { CountLine, Id } from './types'

/** What is still on the trolley: `taken − Σ (after − before)` per item, over
 * every count line of this run.
 *
 * **Derived, never decremented in a stored field** (design §3.9, §9). The
 * thing that empties the trolley is the after-count, not a tap.
 *
 * Spec §6.3 says the balance "decrements with each `Fill`". That is obsolete
 * and following it literally gives a wrong figure (design §16.5): since the
 * after-count became editable (spec §3.2 as amended, 2026-08-27) a refill is
 * recorded by typing a number with no Fill tap at all, and `Fill tray to par`
 * sets a whole tray at once. So **no operator-attention flag is read here** —
 * not `filled`, and not the one `purity.test.ts` forbids outright —
 * because `after − before` covers every path stock takes off the trolley,
 * including ones that do not exist yet.
 *
 * **The sum is signed on purpose.** A positive `after − before` is stock that
 * went off the trolley into the machine; a negative one is stock pulled *out*
 * of a machine and onto the trolley, which is exactly how spec §3.2 says an
 * intra-run redistribution records itself. The figure follows both directions
 * for free, and it is not floored at zero: a negative remainder means more
 * went into the machines than came off the trolley, which is a reconciliation
 * the return screen must show rather than hide.
 *
 * Pure: plain data in, plain data out. */
export function trolleyRemaining(
  taken: Map<Id, number>,
  lines: CountLine[],
): Map<Id, number> {
  const drawn = new Map<Id, number>()
  for (const line of lines) {
    drawn.set(line.itemId, (drawn.get(line.itemId) ?? 0) + line.after - line.before)
  }

  const remaining = new Map<Id, number>()
  for (const [itemId, units] of taken) {
    remaining.set(itemId, units - (drawn.get(itemId) ?? 0))
  }
  // An item that was never loaded can still end up on the trolley, pulled out
  // of one machine on the way to another. One that was counted and left alone
  // has no place on the list at all.
  for (const [itemId, units] of drawn) {
    if (!remaining.has(itemId) && units !== 0) remaining.set(itemId, -units)
  }

  return remaining
}

export interface RunOut {
  itemId: Id
  /** The floor level of the machine the item is projected to run short at. */
  level: number
  /** What is left on the trolley now — the second half of the watch line. */
  remaining: number
}

/** The level an item is projected to run out at, spec §6.3.
 *
 * Walks the machines still to be visited in level order, accumulating what
 * each is expected to draw, and names the first one the running total passes
 * what is left. Exhausting the trolley exactly is not running out — the last
 * machine is still served in full.
 *
 * The caller recomputes the draws against current levels on every render, so
 * the estimate sharpens as the run proceeds: a machine that turns out fuller
 * than projected pushes the run-out level up, correctly, and the watch goes
 * quiet again.
 *
 * Displayed as one line — `Coke runs out at L11 · 6 left` — and only when
 * something is short. Never a modal and never a block: spec §7 names the walk
 * the latency-critical path.
 *
 * Pure: plain data in, plain data out. */
export function runsOutAt(
  remaining: Map<Id, number>,
  drawByMachine: { machineId: Id; level: number; draw: Map<Id, number> }[],
): RunOut[] {
  const ahead = [...drawByMachine].sort(
    (a, b) => a.level - b.level || a.machineId.localeCompare(b.machineId),
  )

  const running = new Map<Id, number>()
  const named = new Set<Id>()
  const runOuts: RunOut[] = []

  for (const machine of ahead) {
    for (const [itemId, units] of machine.draw) {
      if (units <= 0 || named.has(itemId)) continue

      const total = (running.get(itemId) ?? 0) + units
      running.set(itemId, total)

      const left = remaining.get(itemId) ?? 0
      if (total > left) {
        named.add(itemId)
        runOuts.push({ itemId, level: machine.level, remaining: left })
      }
    }
  }

  return runOuts
}
