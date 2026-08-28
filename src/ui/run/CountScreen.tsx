import { useState } from 'react'
import { TrayTabs } from '../components/TrayTabs'
import { SlotRow } from './SlotRow'
import { SlotEditSheet } from './SlotEditSheet'
import { parseSlotNumbers, trayOf } from '../../domain/trays'
import { levelKey } from '../../domain/levels'
import { useCounting } from './useCounting'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
import { distinctLabel } from '../machines/machineLabel'
import type { Id, Machine } from '../../domain/types'

export function CountScreen({
  runId, machine, onDone,
}: {
  runId: Id
  // The single source of truth for which machine this screen is counting —
  // both the id used to load the map and the object the header reads its
  // level and label from. A separate `machineId` prop alongside this one
  // let a caller pass a `machine` for one and a different machine's id for
  // the other; nothing enforced that they agreed, which is a latent version
  // of defect #5 ("no screen says which machine you are in"). One required
  // prop makes that mismatch unrepresentable.
  machine: Machine
  onDone: () => void
}) {
  const machineId = machine.id
  const counting = useCounting(runId, machineId)
  const [tray, setTray] = useState<number | null>(null)
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
  const [newSlot, setNewSlot] = useState('')
  const [newSlotError, setNewSlotError] = useState<string | null>(null)

  // §3.7: `counted` is every level key the operator has touched this visit
  // that the current map still has; `total` is every (slot, item) pair the
  // map has. Computed ahead of the loading branch below so the header
  // always has a figure to show, even while `counting.map`/`counting.touched`
  // are still their empty defaults.
  //
  // Fix 5, 2026-08-28 whole-branch review: `touched` is never pruned when an
  // item is removed from a slot mid-count via `⋯` — `reload()` shrinks the
  // map but the stale key stays in `touched`. Intersecting with the current
  // map's keys, rather than reading `touched.size` directly, keeps `counted`
  // from exceeding `total` (the `5 / 4` header) and the bar from rendering
  // past 100% of its parent (the container-break defect this screen already
  // had fixed once).
  const mapKeys = new Set(
    counting.map.flatMap((s) => s.accepts.map((itemId) => levelKey(s.slotNumber, itemId))),
  )
  const counted = [...counting.touched].filter((key) => mapKeys.has(key)).length
  const total = mapKeys.size

  const header = (
    <>
      <ScreenHeader
        back={{ label: '← MACHINES', onClick: onDone }}
        state="COUNTING"
        title={`L${machine.level}`}
        subtitle={distinctLabel(machine)}
        figure={`${counted} / ${total}`}
      />
      <div className="h-[3px] overflow-hidden bg-rule-light">
        <div
          className="h-full bg-accent"
          style={{ width: `${total === 0 ? 0 : Math.min(100, (counted / total) * 100)}%` }}
        />
      </div>
    </>
  )

  if (counting.loading) {
    return (
      <ScreenLayout header={header}>
        <div className="p-4">Loading…</div>
      </ScreenLayout>
    )
  }

  const present = new Set(counting.map.map((s) => trayOf(s.slotNumber)))
  // No fallback tray: a machine with nothing mapped has no active tray, and
  // pretending it is on tray 10 renders an empty tray list that looks like a
  // machine legitimately holding nothing.
  const activeTray = tray ?? [...present].sort((a, b) => a - b)[0] ?? null
  const slots =
    activeTray === null
      ? []
      : counting.map.filter((s) => trayOf(s.slotNumber) === activeTray)

  // §3.7: a tray gets its tick once every (slot, item) pair it has is a
  // touched level key — the same signal the header's own figure counts.
  const complete = new Set(
    [...present].filter((t) => {
      const traySlots = counting.map.filter((s) => trayOf(s.slotNumber) === t)
      return traySlots.every((s) =>
        s.accepts.every((itemId) => counting.touched.has(levelKey(s.slotNumber, itemId))))
    }),
  )

  const stickyExtra = activeTray !== null && (
    <>
      <TrayTabs active={activeTray} onSelect={setTray} present={present} complete={complete} />
      <div
        data-testid="column-header"
        className="grid grid-cols-[30px_1fr_60px_60px_34px] items-center gap-2 bg-ink px-3.5 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground"
      >
        <span>SL</span>
        <span>Item</span>
        <span className="text-center">Counted</span>
        <span className="text-center leading-tight">Refilled<br />to</span>
        <span />
      </div>
    </>
  )

  function openSlot() {
    const { slots: parsed, invalid } = parseSlotNumbers(newSlot)
    if (invalid.length > 0 || parsed.length !== 1) {
      setNewSlotError(
        `${newSlot.trim() || 'That'} is not a slot number. Slots run 10–14, 20–29, 30–39, 40–49, 50–59, 60–69.`,
      )
      return
    }
    setNewSlotError(null)
    setEditingSlot(parsed[0])
  }

  return (
    <ScreenLayout header={header} stickyExtra={stickyExtra}>
      <div>
        {counting.map.length === 0 && editingSlot === null && (
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[13px] font-semibold text-ink">
              No slots are mapped for this machine.
            </p>
            <p className="text-[12px] text-neutral-600">
              Set an item&apos;s slots on the Items screen to map every machine at
              once, or open one slot here and fill it in at the machine.
            </p>
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-600">
                  Slot number
                </span>
                <input
                  aria-label="Slot number"
                  inputMode="numeric"
                  placeholder="58"
                  className="border border-rule-light bg-paper p-2 text-[13px] text-ink outline-none"
                  value={newSlot}
                  onChange={(e) => setNewSlot(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={openSlot}
                className="bg-ink px-3 py-2 text-[12px] font-extrabold uppercase tracking-[0.04em] text-ground"
              >
                Open slot
              </button>
            </div>
            {newSlotError && (
              <span role="alert" className="text-[11px] font-semibold text-accent-700">
                {newSlotError}
              </span>
            )}
          </div>
        )}

        {/* Fix 7, 2026-08-28 whole-branch review: every row already carries
            its own `border-b border-rule-light` (§3.2's ruled table). The
            `gap-2` between rows cost roughly 80px per screen and made rows
            read as floating cards rather than a ruled table — undermining
            §3.2's density argument that a tray fits one screen because rows
            butt together. */}
        <ul className="flex flex-col p-2">
          {slots.map((slot) => (
            <SlotRow
              key={slot.slotNumber}
              slot={slot}
              items={counting.items}
              before={counting.before}
              after={counting.after}
              touched={counting.touched}
              ranDry={counting.ranDry(slot)}
              onSetBefore={(slotNumber, itemId, qty) => {
                // useCounting has already rolled local state back to the
                // pre-change values on a rejected write — writing to a
                // finalized visit is not one of the ways this fails any more
                // (spec §7, amended 2026-08-27: finalizedAt is a marker, not a
                // lock); a genuine rejection (the visit was deleted, IndexedDB
                // unavailable) still can, so swallow here rather than leaving
                // an unhandled rejection. No UI error surface is in scope for
                // this task.
                counting.setBefore(slotNumber, itemId, qty).catch(() => {})
              }}
              onSetAfter={(slotNumber, itemId, qty) => {
                counting.setAfter(slotNumber, itemId, qty).catch(() => {})
              }}
              onEdit={setEditingSlot}
            />
          ))}
        </ul>

        {counting.map.length > 0 && (
          <div className="bg-surface px-4 py-3 text-[11.5px] leading-snug text-neutral-700">
            <strong className="font-bold text-ink">Counted</strong> is what you found in
            the slot. <strong className="font-bold text-ink">Refilled to</strong> is what
            you leave behind — next visit opens from it.
          </div>
        )}

        {editingSlot !== null && (
          <SlotEditSheet
            machineId={machineId}
            slotNumber={editingSlot}
            items={[...counting.items.values()]}
            currentItemIds={
              counting.map.find((s) => s.slotNumber === editingSlot)?.accepts ?? []
            }
            capacity={counting.map.find((s) => s.slotNumber === editingSlot)?.capacity ?? 0}
            slotInMap={counting.map.some((s) => s.slotNumber === editingSlot)}
            isFilled={counting.filled.has(editingSlot)}
            onToggleFill={() => {
              void counting.toggleFill(editingSlot).catch(() => {})
            }}
            onSaved={() => {
              setEditingSlot(null)
              setNewSlot('')
              void counting.reload()
            }}
            onCancel={() => setEditingSlot(null)}
          />
        )}

        <div className="flex border-t-2 border-rule-strong">
          {/* Fix 3(a), 2026-08-28 whole-branch review: on a machine (or, once
              trays render, a tray) with nothing mapped, `slots` is `[]`,
              `fillTray([])` returns immediately, and this button was inert —
              a control that visibly does nothing when tapped. Hide it rather
              than let the operator tap a dead button. */}
          {slots.length > 0 && (
            <button
              type="button"
              onClick={() => {
                void counting.fillTray(slots.map((s) => s.slotNumber)).catch(() => {})
              }}
              className="flex-1 bg-ground px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-ink"
            >
              Fill tray to par
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              // Same shape as the stepper handlers: finalize is not a no-op on
              // an already-finalized visit — it always re-runs the whole-
              // machine batch and re-stamps updatedAt/finalizedAt (spec §7,
              // amended 2026-08-27), including when re-finishing a machine
              // that was already done. A rejected write must still not
              // surface as an unhandled rejection, and must still leave the
              // machine either way.
              void counting.finalize().catch(() => {}).then(onDone)
            }}
            className="flex-1 bg-accent px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-ground"
          >
            Finish machine
          </button>
        </div>
      </div>
    </ScreenLayout>
  )
}
