import { useCallback, useEffect, useState } from 'react'
import { useMachineMap } from '../useMachineMap'
import { levelKey, lastRecordedLevels } from '../../domain/levels'
import { fillToCapacity, slotTotal, type SlotContents } from '../../domain/fill'
import { newId, now } from '../../domain/ids'
import {
  finalizeVisit, historyForMachine, openVisit, putCountLine,
} from '../../data/repositories/visits'
import type { Id, ResolvedSlot, Visit } from '../../domain/types'

export function useCounting(runId: Id, machineId: Id) {
  const { map, items, loading: mapLoading } = useMachineMap(machineId)
  const [visit, setVisit] = useState<Visit | null>(null)
  const [before, setBeforeState] = useState<Map<string, number>>(new Map())
  const [after, setAfterState] = useState<Map<string, number>>(new Map())
  const [filled, setFilled] = useState<Set<number>>(new Set())
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (mapLoading) return
    void (async () => {
      const [openedVisit, history] = await Promise.all([
        openVisit(runId, machineId),
        historyForMachine(machineId),
      ])
      const levels = lastRecordedLevels(history)
      const seeded = new Map<string, number>()
      for (const slot of map) {
        for (const itemId of slot.accepts) {
          const key = levelKey(slot.slotNumber, itemId)
          seeded.set(key, levels.get(key) ?? 0)
        }
      }
      setVisit(openedVisit)
      setBeforeState(seeded)
      setAfterState(new Map(seeded))
      setLoading(false)
    })()
  }, [mapLoading, map, runId, machineId])

  const contentsOf = useCallback(
    (slot: ResolvedSlot, source: Map<string, number>): SlotContents =>
      slot.accepts.map((itemId) => ({
        itemId,
        qty: source.get(levelKey(slot.slotNumber, itemId)) ?? 0,
      })),
    [],
  )

  const persist = useCallback(
    async (slotNumber: number, itemId: Id, b: number, a: number, isTouched: boolean) => {
      if (!visit) return
      await putCountLine({
        id: newId(), visitId: visit.id, slotNumber, itemId,
        before: b, after: a, touched: isTouched, updatedAt: now(),
      })
    },
    [visit],
  )

  const setBefore = useCallback(
    async (slotNumber: number, itemId: Id, qty: number) => {
      const key = levelKey(slotNumber, itemId)
      const nextBefore = new Map(before).set(key, qty)
      const nextAfter = new Map(after)
      if (!filled.has(slotNumber)) nextAfter.set(key, qty)

      setBeforeState(nextBefore)
      setAfterState(nextAfter)
      setTouched(new Set(touched).add(key))
      await persist(slotNumber, itemId, qty, nextAfter.get(key) ?? qty, true)
    },
    [before, after, filled, touched, persist],
  )

  const toggleFill = useCallback(
    async (slotNumber: number) => {
      const slot = map.find((s) => s.slotNumber === slotNumber)
      if (!slot) return

      const nextFilled = new Set(filled)
      const nextAfter = new Map(after)
      const target = filled.has(slotNumber)
        ? contentsOf(slot, before)
        : fillToCapacity(slot, contentsOf(slot, before))

      if (filled.has(slotNumber)) nextFilled.delete(slotNumber)
      else nextFilled.add(slotNumber)

      for (const entry of target) {
        nextAfter.set(levelKey(slotNumber, entry.itemId), entry.qty)
      }

      setFilled(nextFilled)
      setAfterState(nextAfter)

      for (const entry of target) {
        const key = levelKey(slotNumber, entry.itemId)
        await persist(
          slotNumber, entry.itemId,
          before.get(key) ?? 0, entry.qty, touched.has(key),
        )
      }
    },
    [map, filled, after, before, touched, contentsOf, persist],
  )

  const finalize = useCallback(async () => {
    if (!visit) return
    const finalized = await finalizeVisit(visit.id)
    setVisit(finalized)
  }, [visit])

  const ranDry = useCallback(
    (slot: ResolvedSlot) => slotTotal(contentsOf(slot, before)) === 0,
    [before, contentsOf],
  )

  return {
    loading: loading || mapLoading,
    map, items, before, after, filled, touched,
    setBefore, toggleFill, finalize, ranDry,
  }
}
