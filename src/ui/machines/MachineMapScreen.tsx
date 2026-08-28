import { useState } from 'react'
import { TRAYS, allSlotsInTray, trayLabel } from '../../domain/trays'
import { SlotEditSheet } from '../run/SlotEditSheet'
import { useMachineMap } from '../useMachineMap'
import { distinctLabel } from './machineLabel'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
import type { Machine, ResolvedSlot } from '../../domain/types'

export function MachineMapScreen({
  machine, onBack,
}: {
  machine: Machine
  onBack: () => void
}) {
  const { map, items, reload, loading } = useMachineMap(machine.id)
  // Fix-plan item 14. The same sheet the counting screen opens with `⋯`,
  // reached from the map as well — an addition to spec §5.1's in-place
  // correction, never a replacement for it.
  const [editingSlot, setEditingSlot] = useState<number | null>(null)

  const header = (
    <ScreenHeader
      back={{ label: '← MACHINES', onClick: onBack }}
      title={`L${machine.level}`}
      subtitle={distinctLabel(machine)}
    />
  )

  if (loading) {
    return (
      <ScreenLayout header={header}>
        <div className="p-4">Loading…</div>
      </ScreenLayout>
    )
  }

  // Every slot the editor can be opened for, mapped or not: an unmapped slot
  // (§5) has no `ResolvedSlot` of its own, so one is fabricated with capacity
  // 0 and nothing accepted — the same starting point `SlotEditSheet` already
  // treats as "not stocked".
  const editing = editingSlot === null
    ? null
    : map.find((s) => s.slotNumber === editingSlot) ??
      ({ slotNumber: editingSlot, capacity: 0, accepts: [] } satisfies ResolvedSlot)

  return (
    <ScreenLayout header={header}>
      <div>
        <div
          className="grid grid-cols-[30px_1fr_44px_34px] items-center gap-2 bg-ink px-3.5 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground"
        >
          <span>SL</span>
          <span>Holds</span>
          <span className="text-right">Cap</span>
          <span />
        </div>

        {TRAYS.map((tray) => {
          // §5: every physical slot the tray has, not just the ones with an
          // item mapped to them — an empty slot renders as "Not stocked"
          // rather than being absent, so a hole in the map is visible instead
          // of invisible.
          const slotNumbers = allSlotsInTray(tray)
          const first = slotNumbers[0]
          const last = slotNumbers[slotNumbers.length - 1]

          return (
            <section key={tray}>
              <div className="bg-surface px-3.5 py-2 text-[11px] font-bold tracking-[0.06em] text-neutral-700">
                {`${trayLabel(tray).toUpperCase()} · SLOTS ${first}–${last}`}
              </div>
              <ul>
                {slotNumbers.map((slotNumber) => {
                  const slot = map.find((s) => s.slotNumber === slotNumber)
                  const mixed = (slot?.accepts.length ?? 0) > 1

                  return (
                    <li
                      key={slotNumber}
                      className={`grid grid-cols-[30px_1fr_44px_34px] items-center gap-2 border-b border-rule-light px-3.5 py-2 ${
                        slot ? 'bg-paper' : 'bg-neutral-100'
                      }`}
                    >
                      <span className="text-[15px] font-extrabold tabular-nums">
                        {slotNumber}
                      </span>
                      {slot ? (
                        <div className="flex min-w-0 flex-col justify-center">
                          {slot.accepts.map((id, i) => (
                            <span
                              key={id}
                              className={
                                i === 0
                                  ? 'truncate text-[13px] font-semibold'
                                  : 'truncate text-[12px] font-medium text-neutral-700'
                              }
                            >
                              {items.get(id)?.name ?? '?'}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[13px] font-medium text-neutral-500">
                          Not stocked
                        </span>
                      )}
                      <span
                        className={`text-right text-[13px] font-semibold tabular-nums ${
                          slot ? '' : 'text-neutral-500'
                        }`}
                      >
                        {slot ? slot.capacity : '—'}
                      </span>
                      <button
                        type="button"
                        aria-label={`Edit slot ${slotNumber}`}
                        onClick={() => setEditingSlot(slotNumber)}
                        className={`justify-self-end text-lg text-neutral-400 ${
                          mixed ? 'self-start' : ''
                        }`}
                      >
                        ⋯
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        {/* A floating sheet, not an inline one. The map lists every mapped slot
            at once, so rendering the sheet in document order put it below all
            six trays — about 3100px down an 828px viewport on a full machine,
            which reads as `⋯` doing nothing at all. The counting screen shows
            one tray at a time and keeps its inline sheet. */}
        {editing && (
          <div
            className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-2"
            onClick={() => setEditingSlot(null)}
            aria-label="Close slot editor"
            role="presentation"
          >
            <div
              className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <SlotEditSheet
                machineId={machine.id}
                slotNumber={editing.slotNumber}
                items={[...items.values()]}
                currentItemIds={editing.accepts}
                capacity={editing.capacity}
                onSaved={() => {
                  setEditingSlot(null)
                  void reload()
                }}
                onCancel={() => setEditingSlot(null)}
              />
            </div>
          </div>
        )}

        <div className="bg-surface px-4 py-3 text-[11.5px] leading-snug text-neutral-700">
          The printed map is about 90% right. Tap ⋯ on any slot to correct what
          it holds or how deep it is — for this machine only.
        </div>
      </div>
    </ScreenLayout>
  )
}
