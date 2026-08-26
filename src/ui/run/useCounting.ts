import { useCallback, useEffect, useRef, useState } from 'react'
import { useMachineMap } from '../useMachineMap'
import { levelKey, lastRecordedLevels } from '../../domain/levels'
import { fillToCapacity, slotTotal, type SlotContents } from '../../domain/fill'
import { newId, now } from '../../domain/ids'
import {
  finalizeVisit, getCountLines, historyForMachine, openVisit, putCountLine,
} from '../../data/repositories/visits'
import type { Id, ResolvedSlot, Visit } from '../../domain/types'

export function useCounting(runId: Id, machineId: Id) {
  const { map, items, reload, loading: mapLoading } = useMachineMap(machineId)
  const [visit, setVisit] = useState<Visit | null>(null)
  const [before, setBeforeState] = useState<Map<string, number>>(new Map())
  const [after, setAfterState] = useState<Map<string, number>>(new Map())
  const [filled, setFilled] = useState<Set<number>>(new Set())
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // Which (run, machine) this hook has already resumed. Set synchronously,
  // before any await, so a second firing of the effect — a `map` identity
  // change from `reload()` — cannot be mistaken for a fresh screen entry and
  // re-apply a stale snapshot of `touched`/`filled` over newer local state.
  const resumedKey = useRef<string | null>(null)

  useEffect(() => {
    if (mapLoading) return
    const seedKey = `${runId}:${machineId}`
    const firstEntry = resumedKey.current !== seedKey
    resumedKey.current = seedKey
    let cancelled = false
    let applied = false

    async function seed() {
      const openedVisit = await openVisit(runId, machineId)
      // The open visit's own lines are the counts already entered against
      // this machine today. Without them, unmounting the screen — a thumb on
      // the fixed bottom nav, a reload, a service-worker autoUpdate — resets
      // every row to last visit's level while the entered rows sit persisted
      // and unseen, and Finish then freezes a mix of the two (spec §7).
      // One visit's rows, read once on screen entry, off the interaction path.
      const [history, draftLines] = await Promise.all([
        historyForMachine(machineId),
        getCountLines(openedVisit.id),
      ])
      if (cancelled) return

      const levels = lastRecordedLevels(history)
      const draftBefore = new Map(
        draftLines.map((l) => [levelKey(l.slotNumber, l.itemId), l.before]),
      )
      const draftAfter = new Map(
        draftLines.map((l) => [levelKey(l.slotNumber, l.itemId), l.after]),
      )

      // Merge rather than replace: a key already present (because the
      // operator has already entered a count for it in this session) keeps
      // its current value. Only keys not yet present — including a newly
      // added item's slot — get seeded, the open draft winning over history
      // and history filling the gaps the draft has not reached. This makes
      // the effect idempotent, so a `map` identity change (e.g. from
      // `reload()` after a mid-count map correction) never wipes counts
      // already entered on this screen. Uses the functional setState form so
      // the merge reads the current `before`/`after` rather than a stale
      // closure snapshot, without needing them in the dependency array
      // (which would loop).
      const mergeWith = (draft: Map<string, number>) => (prev: Map<string, number>) => {
        const next = new Map(prev)
        for (const slot of map) {
          for (const itemId of slot.accepts) {
            const key = levelKey(slot.slotNumber, itemId)
            if (!next.has(key)) next.set(key, draft.get(key) ?? levels.get(key) ?? 0)
          }
        }
        return next
      }

      setVisit(openedVisit)
      setBeforeState(mergeWith(draftBefore))
      setAfterState(mergeWith(draftAfter))

      if (firstEntry) {
        // `touched` is recorded on the line itself; `filled` is not stored, but
        // a filled slot is exactly one whose after was raised above its before.
        const touchedKeys = draftLines
          .filter((l) => l.touched)
          .map((l) => levelKey(l.slotNumber, l.itemId))
        const filledSlots = draftLines
          .filter((l) => l.after > l.before)
          .map((l) => l.slotNumber)

        if (touchedKeys.length > 0) {
          setTouched((prev) => new Set([...prev, ...touchedKeys]))
        }
        if (filledSlots.length > 0) {
          setFilled((prev) => new Set([...prev, ...filledSlots]))
        }
      }

      applied = true
      setLoading(false)
    }

    seed().catch((err) => {
      // A screen-entry read that loses its race with unmount — the operator
      // switched screens before it landed — has nothing left to report to.
      if (!cancelled) throw err
    })

    return () => {
      cancelled = true
      // Never applied, so the next mount must still count as a first entry
      // and restore `touched`/`filled` from the open draft.
      if (!applied && resumedKey.current === seedKey) resumedKey.current = null
    }
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
      const slot = map.find((s) => s.slotNumber === slotNumber)

      // Every tap must paint immediately and persist behind it (spec §8.1) —
      // so we commit optimistically first. If the write is rejected (e.g.
      // the visit was finalized concurrently), we roll every captured map
      // back to its pre-change value and rethrow, rather than leaving
      // in-memory state showing a value the database never accepted.
      const prevBefore = before
      const prevAfter = after
      const prevFilled = filled
      const prevTouched = touched

      const nextBefore = new Map(before).set(key, qty)
      const nextTouched = new Set(touched).add(key)

      // While the slot is filled, changing any one item's before must
      // recompute `after` for the whole slot via fillToCapacity — not just
      // set the edited item's after to its own before. Otherwise a mixed
      // slot's after goes stale for its other items (and can end up
      // recording after < before for the edited item). Unfilled slots keep
      // the simple before-mirrors-after rule.
      const affected = slot && filled.has(slotNumber)
        ? fillToCapacity(slot, contentsOf(slot, nextBefore))
        : [{ itemId, qty }]

      const nextAfter = new Map(after)
      for (const entry of affected) {
        nextAfter.set(levelKey(slotNumber, entry.itemId), entry.qty)
      }

      setBeforeState(nextBefore)
      setAfterState(nextAfter)
      setTouched(nextTouched)

      try {
        for (const entry of affected) {
          const entryKey = levelKey(slotNumber, entry.itemId)
          await persist(
            slotNumber, entry.itemId,
            nextBefore.get(entryKey) ?? 0, entry.qty, nextTouched.has(entryKey),
          )
        }
      } catch (err) {
        setBeforeState(prevBefore)
        setAfterState(prevAfter)
        setFilled(prevFilled)
        setTouched(prevTouched)
        throw err
      }
    },
    [before, after, filled, touched, map, contentsOf, persist],
  )

  const toggleFill = useCallback(
    async (slotNumber: number) => {
      const slot = map.find((s) => s.slotNumber === slotNumber)
      if (!slot) return

      const prevBefore = before
      const prevAfter = after
      const prevFilled = filled
      const prevTouched = touched

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

      try {
        for (const entry of target) {
          const key = levelKey(slotNumber, entry.itemId)
          await persist(
            slotNumber, entry.itemId,
            before.get(key) ?? 0, entry.qty, touched.has(key),
          )
        }
      } catch (err) {
        setBeforeState(prevBefore)
        setAfterState(prevAfter)
        setFilled(prevFilled)
        setTouched(prevTouched)
        throw err
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
    setBefore, toggleFill, finalize, ranDry, reload,
  }
}
