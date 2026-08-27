import { useCallback, useEffect, useRef, useState } from 'react'
import { useMachineMap } from '../useMachineMap'
import { levelKey, lastRecordedLevels } from '../../domain/levels'
import { fillToCapacity, slotTotal, type SlotContents } from '../../domain/fill'
import { newId, now } from '../../domain/ids'
import {
  finalizeVisit, getCountLines, historyForMachine, openVisit, putCountLine, putCountLines,
} from '../../data/repositories/visits'
import type { Id, ResolvedSlot, Visit } from '../../domain/types'

export function useCounting(runId: Id, machineId: Id) {
  const { map, items, reload, loading: mapLoading } = useMachineMap(machineId)
  const [visit, setVisit] = useState<Visit | null>(null)
  const [before, setBeforeState] = useState<Map<string, number>>(new Map())
  const [after, setAfterState] = useState<Map<string, number>>(new Map())
  const [filled, setFilled] = useState<Set<number>>(new Set())
  const [touched, setTouched] = useState<Set<string>>(new Set())
  // Level keys for which some prior finalized visit recorded a level, even
  // 0 — i.e. `lastRecordedLevels(history)` has an entry for the key. Used to
  // tell "never counted" (seeded at 0 from empty history) apart from
  // "counted and found empty" for ran-dry (spec §5.2, amended 2026-08-27).
  const [hasHistory, setHasHistory] = useState<Set<string>>(new Set())
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
      // Recomputed fresh from `historyForMachine` every time, including on a
      // `reload()`-driven re-seed: it depends only on finalized history, never
      // on in-session edits, so there is nothing to merge.
      //
      // Excludes the visit being viewed from its own history (item 3,
      // fix-plan 2026-08-27): finalize() now writes a CountLine for every
      // slot, touched or not, so once this visit is finalized it satisfies
      // `lastRecordedLevels` for the whole map — re-opening a machine
      // finished earlier the same day (ordinary now that finalizedAt is a
      // marker, not a lock) would otherwise flag every untouched slot RAN
      // DRY again. The draft lines above still seed `before`/`after` from
      // this same visit — only the history judgement changes.
      const historyExcludingSelf = history.filter((h) => h.visit.id !== openedVisit.id)
      setHasHistory(new Set(lastRecordedLevels(historyExcludingSelf).keys()))

      // A capacity edit via SlotEditSheet mid-count calls `reload()`, giving
      // `map` a new identity and re-firing this effect with `firstEntry`
      // false. `mergeWith` above only fills gaps — a key already present
      // (a filled slot's `after`) is left untouched — so it cannot be what
      // updates an already-filled slot's `after` when capacity moves, e.g.
      // 5 to 20 (item 5, fix-plan 2026-08-27): `after` would stay pinned at
      // the old capacity both on screen and in the persisted CountLine,
      // recording a short fill. Recompute every currently filled slot
      // against the (possibly new) capacity and re-persist it — a no-op
      // when capacity did not change, since fillToCapacity is deterministic.
      // Skipped on first entry: `filled` is still empty then (it is seeded
      // from the draft just below), so there is nothing to recompute yet.
      if (!firstEntry && filled.size > 0) {
        const mergedBefore = mergeWith(draftBefore)(before)
        const rewrites: { slotNumber: number; itemId: Id; before: number; after: number }[] = []

        for (const slotNumber of filled) {
          const slot = map.find((s) => s.slotNumber === slotNumber)
          if (!slot) continue
          const contents = slot.accepts.map((itemId) => ({
            itemId, qty: mergedBefore.get(levelKey(slotNumber, itemId)) ?? 0,
          }))
          for (const entry of fillToCapacity(slot, contents)) {
            rewrites.push({
              slotNumber,
              itemId: entry.itemId,
              before: mergedBefore.get(levelKey(slotNumber, entry.itemId)) ?? 0,
              after: entry.qty,
            })
          }
        }

        if (rewrites.length > 0) {
          const rewriteKeys = rewrites.map((r) => levelKey(r.slotNumber, r.itemId))
          setAfterState((prev) => {
            const next = new Map(prev)
            for (const r of rewrites) next.set(levelKey(r.slotNumber, r.itemId), r.after)
            return next
          })
          setTouched((prev) => new Set([...prev, ...rewriteKeys]))

          await putCountLines(
            rewrites.map((r) => ({
              id: newId(),
              visitId: openedVisit.id,
              slotNumber: r.slotNumber,
              itemId: r.itemId,
              before: r.before,
              after: r.after,
              touched: true,
              filled: true,
              updatedAt: now(),
            })),
          )
        }
      }

      if (firstEntry) {
        // Both `touched` and `filled` are recorded on the line itself (spec
        // 1a: a slot filled while already at capacity has after === before,
        // so `after > before` cannot stand in for the flag).
        const touchedKeys = draftLines
          .filter((l) => l.touched)
          .map((l) => levelKey(l.slotNumber, l.itemId))
        const filledSlots = draftLines
          .filter((l) => l.filled)
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
    async (
      slotNumber: number, itemId: Id, b: number, a: number,
      isTouched: boolean, isFilled: boolean,
    ) => {
      if (!visit) return
      await putCountLine({
        id: newId(), visitId: visit.id, slotNumber, itemId,
        before: b, after: a, touched: isTouched, filled: isFilled, updatedAt: now(),
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

      const isFilled = filled.has(slotNumber)

      try {
        for (const entry of affected) {
          const entryKey = levelKey(slotNumber, entry.itemId)
          await persist(
            slotNumber, entry.itemId,
            nextBefore.get(entryKey) ?? 0, entry.qty, nextTouched.has(entryKey), isFilled,
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

      const turningOn = !filled.has(slotNumber)
      const nextFilled = new Set(filled)
      const nextAfter = new Map(after)
      const target = turningOn
        ? fillToCapacity(slot, contentsOf(slot, before))
        : contentsOf(slot, before)

      if (turningOn) nextFilled.add(slotNumber)
      else nextFilled.delete(slotNumber)

      for (const entry of target) {
        nextAfter.set(levelKey(slotNumber, entry.itemId), entry.qty)
      }

      // Filling a slot is an observation, same as tapping −/+ (item 4,
      // fix-plan 2026-08-27): a slot found empty and refilled without ever
      // touching the stepper is still a slot the operator looked at and
      // found empty, and must still flag RAN DRY. Only turning Fill *on*
      // counts as observing every item in the slot — turning it back off
      // just reverts `after` to `before` and is not a new observation.
      const nextTouched = turningOn
        ? new Set([...touched, ...target.map((e) => levelKey(slotNumber, e.itemId))])
        : touched

      setFilled(nextFilled)
      setAfterState(nextAfter)
      if (turningOn) setTouched(nextTouched)

      const isFilled = nextFilled.has(slotNumber)

      try {
        for (const entry of target) {
          const key = levelKey(slotNumber, entry.itemId)
          await persist(
            slotNumber, entry.itemId,
            before.get(key) ?? 0, entry.qty, nextTouched.has(key), isFilled,
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
    // Re-entering a finished machine is ordinary — the machine list routes
    // back there after every finish and openVisit hands the finalized visit
    // straight back — so tapping Finish again must not be a dead button.
    // Spec §7, amended 2026-08-27: finalizedAt is a marker, not a lock, and
    // putCountLines no longer rejects writes to a finalized visit. So there
    // is no longer any reason to special-case "already finalized" here: it
    // always re-runs the whole-machine batch and re-stamps below, which is
    // exactly what "re-finishing after an edit should still work and
    // re-stamp" requires — including when nothing changed, where it is a
    // harmless, idempotent-in-content re-write (only `updatedAt` moves).
    if (!visit) return

    // Record the whole machine, not just the rows the operator worked. Spec
    // §3.1 makes untouched the common case — a slot that sold nothing needs
    // zero taps — so touched-only recording leaves most of the machine with no
    // row for the period: nothing for Phase 2's sales residual to difference,
    // and nothing for the next visit's seed to find once the slot drops out of
    // the history window, which shows a full slot as 0 and RAN DRY.
    //
    // Written uniformly rather than diffed against what is already stored:
    // `putCountLines` upserts on (visitId, slotNumber, itemId), so a row the
    // operator did touch is rewritten from the same state it was written from.
    // `touched` is carried through, so the distinction survives into Phase 2.
    //
    // Runs before finalizeVisit re-stamps, once per machine, off the tapping
    // path, as a single batch.
    await putCountLines(
      map.flatMap((slot) =>
        slot.accepts.map((itemId) => {
          const key = levelKey(slot.slotNumber, itemId)
          return {
            id: newId(),
            visitId: visit.id,
            slotNumber: slot.slotNumber,
            itemId,
            before: before.get(key) ?? 0,
            after: after.get(key) ?? 0,
            touched: touched.has(key),
            filled: filled.has(slot.slotNumber),
            updatedAt: now(),
          }
        }),
      ),
    )

    const finalized = await finalizeVisit(visit.id)
    setVisit(finalized)
  }, [visit, map, before, after, touched, filled])

  const ranDry = useCallback(
    (slot: ResolvedSlot) => {
      if (slotTotal(contentsOf(slot, before)) !== 0) return false

      // Zero alone is not dry — it might just be a slot nobody has ever
      // counted. It is dry when that zero is an observation: either a prior
      // visit recorded a level for this slot (even 0, carried forward
      // untouched), or the operator has touched it this visit (counted it
      // down themselves). A slot with neither has simply never been looked
      // at, and "never counted" is not "sold out" (spec §5.2, amended).
      return slot.accepts.some((itemId) => {
        const key = levelKey(slot.slotNumber, itemId)
        return hasHistory.has(key) || touched.has(key)
      })
    },
    [before, contentsOf, hasHistory, touched],
  )

  return {
    loading: loading || mapLoading,
    map, items, before, after, filled, touched,
    setBefore, toggleFill, finalize, ranDry, reload,
  }
}
