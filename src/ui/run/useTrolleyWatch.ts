import { useEffect, useMemo, useState } from 'react'
import { forecastForRun } from '../../data/repositories/forecast'
import { listMachines } from '../../data/repositories/machines'
import { getRun } from '../../data/repositories/runs'
import { trolleyForRun } from '../../data/repositories/trolley'
import { getCountLines, listVisitsForRun } from '../../data/repositories/visits'
import { levelKey } from '../../domain/levels'
import { runsOutAt, trolleyRemaining, type RunOut } from '../../domain/trolley'
import type { CountLine, Id, MachineMap } from '../../domain/types'

/** What one screen entry reads from disk, once. Everything the watch shows is
 * derived from this plus the counts already in memory. */
interface WatchSnapshot {
  /** `itemId` → units taken off the shelf for this run. */
  taken: Map<Id, number>
  /** Every count line of this run recorded at a machine that is NOT the one
   * being counted — what the trolley has already given away elsewhere. This
   * machine's own lines are live in memory and are added on every render. */
  elsewhere: CountLine[]
  /** The machines still to be visited, and what each is expected to draw.
   * Excludes the machine in hand, which is measured live instead. */
  ahead: { machineId: Id; level: number; draw: Map<Id, number> }[]
}

/** The trolley watch of spec §6.3 and design §9: the level an item is
 * projected to run out at, while there is still a decision to make about it.
 *
 * **Read once on screen entry, recomputed in memory from then on.** Spec §8.1
 * is explicit that there are no queries during counting, so every keystroke
 * re-runs only the pure arithmetic — `trolleyRemaining` and `runsOutAt`,
 * both already built and tested — over the snapshot below and the live
 * `before`/`after` maps the count screen already holds.
 *
 * The read is skipped entirely on a run with no trolley lines: nothing was
 * loaded, so there is nothing to watch, and the expensive part (the forecast)
 * never runs. That is also every run recorded before this phase existed.
 *
 * **The machine in hand is measured, not projected.** For the machines ahead
 * the expected draw is the forecast's need, resolved to the slot's first
 * accepted item (design §3.8). For the machine being counted, the draw is
 * what its slots are still short of capacity *right now* — which is exactly
 * what design §9 means by recomputing against current levels: a machine that
 * turns out fuller than projected asks for less, the run-out level moves up,
 * and the watch goes quiet again.
 *
 * A machine part-counted and left mid-visit is still treated as fully ahead.
 * Its partial fills have already come off `remaining`, so the watch warns
 * slightly early there — the conservative direction for a figure whose whole
 * job is to be read before the lift doors close.
 */
export function useTrolleyWatch({
  runId, machineId, level, map, before, after,
}: {
  runId: Id
  machineId: Id
  /** The floor level of the machine being counted, so it can be placed in
   * the walk order with the machines ahead of it. */
  level: number
  map: MachineMap
  before: Map<string, number>
  after: Map<string, number>
}): RunOut[] {
  const [snapshot, setSnapshot] = useState<WatchSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const trolley = await trolleyForRun(runId)
      // No load recorded for this run: no watch, and — deliberately — no
      // forecast read either.
      if (trolley.length === 0) {
        if (!cancelled) setSnapshot(null)
        return
      }

      const [run, machines, visits] = await Promise.all([
        getRun(runId), listMachines(), listVisitsForRun(runId),
      ])
      if (cancelled || !run) return

      const elsewhere = (
        await Promise.all(
          visits.filter((v) => v.machineId !== machineId).map((v) => getCountLines(v.id)),
        )
      ).flat()
      if (cancelled) return

      const rows = await forecastForRun(run.date)
      if (cancelled) return

      const counted = new Set(
        visits.filter((v) => v.status === 'finalized').map((v) => v.machineId),
      )
      const levelOf = new Map(machines.map((m) => [m.id, m.level]))
      const drawOf = new Map<Id, Map<Id, number>>()

      for (const row of rows) {
        if (row.machineId === machineId || counted.has(row.machineId)) continue
        const itemId = row.itemIds[0]
        if (itemId === undefined || row.need <= 0) continue
        const draw = drawOf.get(row.machineId) ?? new Map<Id, number>()
        draw.set(itemId, (draw.get(itemId) ?? 0) + row.need)
        drawOf.set(row.machineId, draw)
      }

      setSnapshot({
        taken: new Map(trolley.map((line) => [line.itemId, line.taken])),
        elsewhere,
        ahead: [...drawOf].map(([id, draw]) => ({
          machineId: id, level: levelOf.get(id) ?? 0, draw,
        })),
      })
    }

    void load().catch(() => {
      // The watch is an aid, never a gate on counting: a failed read leaves
      // it silent rather than taking the screen down with it.
      if (!cancelled) setSnapshot(null)
    })

    return () => { cancelled = true }
  }, [runId, machineId])

  return useMemo(() => {
    if (!snapshot) return []

    // This machine's counts as lines, so `trolleyRemaining` sees the whole
    // run. Only the four fields it reads carry meaning; the rest are filled
    // to satisfy the type and are never written anywhere.
    const here: CountLine[] = map.flatMap((slot) =>
      slot.accepts.map((itemId) => {
        const key = levelKey(slot.slotNumber, itemId)
        return {
          id: '', visitId: '', slotNumber: slot.slotNumber, itemId,
          before: before.get(key) ?? 0,
          after: after.get(key) ?? 0,
          touched: false, filled: false, price: 0, updatedAt: 0,
        }
      }),
    )

    const remaining = trolleyRemaining(snapshot.taken, [...snapshot.elsewhere, ...here])

    // What the machine in hand is still short of capacity, resolved to the
    // slot's preferred item — the same rule the forecast uses.
    const draw = new Map<Id, number>()
    for (const slot of map) {
      const itemId = slot.accepts[0]
      if (itemId === undefined) continue
      const held = slot.accepts.reduce(
        (sum, id) => sum + (after.get(levelKey(slot.slotNumber, id)) ?? 0), 0,
      )
      const shortfall = slot.capacity - held
      if (shortfall > 0) draw.set(itemId, (draw.get(itemId) ?? 0) + shortfall)
    }

    const walk = [...snapshot.ahead]
    if (draw.size > 0) walk.push({ machineId, level, draw })

    return runsOutAt(remaining, walk)
  }, [snapshot, map, before, after, machineId, level])
}
