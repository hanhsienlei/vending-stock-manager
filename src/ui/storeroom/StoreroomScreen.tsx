import { useState } from 'react'
import { useStoreroom } from './useStoreroom'
import { AdjustmentSheet } from '../adjustments/AdjustmentSheet'
import { SectionBar, useCollapsedSections } from '../components/CollapsibleSections'
import { QuantityField } from '../components/QuantityField'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScreenLayout } from '../components/ScreenLayout'
import { downloadBundle, type Bundle } from '../../backup/export'
import { importBundle, planImport, readBundleFile, type ImportPlan } from '../../backup/import'
import { today } from '../../domain/date'
import { TRAYS, trayOf, trayHeading } from '../../domain/trays'
import type { Id, Item } from '../../domain/types'

/** The section holding items with no base placement, keyed so it cannot
 * collide with a tray number. Same key and same heading as the item list's. */
const UNPLACED = 'unplaced'

/** How long ago the shelf figure was confirmed, short enough to sit beside a
 * size in a 1fr cell (§8). `Never verified` is the string the row's accent
 * treatment keys off, so it is unchanged. Display copy for this screen only —
 * it does not belong in `src/domain/`. */
function formatVerifiedAt(timestamp: number | undefined): string {
  if (timestamp === undefined) return 'Never verified'
  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (days <= 0) return 'Verified today'
  if (days === 1) return 'Verified yesterday'
  if (days < 7) return `Verified ${days} days ago`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? 'Verified 1 week ago' : `Verified ${weeks} weeks ago`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** A stored date (`yyyy-mm-dd`) as `4 Sep` — the export button's date, short
 * enough to sit inside a label. Split by hand rather than parsed, for the
 * reason `domain/date.ts` spells out: `new Date('2026-09-04')` is UTC
 * midnight, which reads as the 3rd in every zone behind UTC. Display copy for
 * this screen only, like `formatVerifiedAt` above. */
function formatShortDate(date: string): string {
  const [, month, day] = date.split('-').map(Number)
  return `${day} ${MONTHS[month - 1]}`
}

/** `1fr 44px 112px`. The count column holds the boxes+loose control — two
 * 34px fields, a 4px gap either side of a `×200 +` separator — which needs
 * ~108px. At 88px the flex was `justify-end` and spilled the excess LEFT, so
 * the boxes input rendered under the `APP ESTIMATE` heading and overlapped
 * the estimate figure by 12px (measured in a browser at 393px: heading
 * 219-281, boxes input 269-303).
 *
 * The column was sized when every item was seeded `boxSize: 1` and the
 * control was one plain field. Entering the real carton sizes flipped 46 of
 * 60 items into the two-field form — the case the layout had never been
 * checked against. The estimate column gives up the width because it only
 * ever holds a figure; 44px still takes four digits at 18px. */
const GRID = 'grid grid-cols-[1fr_44px_112px] items-center gap-2 px-4'

/** A footer action, flush left at `15px 16px` (tokens.md). Shared by the
 * export and the restore below so the two read as one block of desk work
 * rather than two controls that happen to sit together. */
const ACTION = 'px-4 py-[15px] text-left text-[12.5px] font-extrabold uppercase tracking-[0.04em]'

// Design §7.1: the adjustment sheet is reached from the storeroom screen too,
// but never with `miscount` on offer here. The storeroom's own correction
// mechanism is the manual count below, which resets the ledger anchor
// directly; a miscount recorded through the sheet would be excluded from
// `ledgerBalance` (domain/storeroom.ts, fix round 1, finding 1) and so would
// silently do nothing — worse than not offering it.
//
// This screen no longer narrows the list itself: `miscount` is retired at the
// table (design §4.1, `offered: false`), so the sheet's own default already
// withholds it everywhere. One rule, in one place, rather than a filter each
// call site has to remember.

/** The storeroom balance is a ledger estimate, not a stocktake (spec §6.5):
 * "on hand" is the last manual count plus every storeroom movement logged
 * since. The manual-count input beside it stays the anchor-setting
 * control — the operator's word for what the shelf actually holds right
 * now, resetting the ledger from that instant.
 *
 * The quantity is entered as boxes + loose with the units computed (spec
 * §5.4, design §8) — "5 boxes + 17 rather than counting to 137". It is this
 * field rather than a feature beside it, which is why it is built in rather
 * than retrofitted. At `boxSize: 1` — every seeded item today — the split is
 * the identity one, so the control shows a single plain units field and
 * starts working the day real carton sizes are entered. Machine screens stay
 * in loose units throughout: a vending slot contains no boxes. */
export function StoreroomScreen() {
  const { items, units, verifiedAt, onHand, baseSlot, loading, setUnits, refresh } =
    useStoreroom()
  const [search, setSearch] = useState('')
  const [adjusting, setAdjusting] = useState<Id | null>(null)
  const sections = useCollapsedSections('vsm.storeroom.collapsedTrays')

  if (loading) {
    return (
      <ScreenLayout header={<ScreenHeader title="Storeroom" />}>
        <div className="p-4">Loading…</div>
      </ScreenLayout>
    )
  }

  // Counted against every item, never the filtered subset (item 10,
  // fix-plan 2026-08-27) — otherwise typing a search would make the header
  // report fewer items counted than actually are.
  const countedCount = verifiedAt.size

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  // The item list's view, applied here at the operator's request. This used
  // to say that shelves have no tray structure to group by, which is true of
  // the shelves and beside the point: the operator picks the storeroom
  // *against the machine*, tray by tray, and a flat sixty-row list makes
  // them find each item by name in a list ordered by name — the same
  // complaint that got the item list ordered by slot.
  //
  // One section per tray, never one per slot the item occupies: unlike the
  // item list, every row here carries an editable count, and an item shown
  // under two trays would be the same balance with two fields to type into.
  // The lowest base slot decides, and an item with no base placement falls
  // into `UNPLACED` rather than disappearing.
  const groups = TRAYS.map((tray) => ({
    key: String(tray),
    heading: trayHeading(tray),
    rows: filtered
      .filter((item) => {
        const slot = baseSlot.get(item.id)
        return slot !== undefined && trayOf(slot) === tray
      })
      .sort((a, b) => (
        (baseSlot.get(a.id) ?? 0) - (baseSlot.get(b.id) ?? 0) || a.name.localeCompare(b.name)
      )),
  })).filter((group) => group.rows.length > 0)

  const unplaced = filtered.filter((item) => baseSlot.get(item.id) === undefined)

  function row(item: Item) {
    const verified = verifiedAt.get(item.id)
    const neverVerified = verified === undefined
    const estimate = onHand.get(item.id) ?? 0
    const slot = baseSlot.get(item.id)
    return (
      <li
        key={item.id}
        data-testid={`storeroom-row-${item.name}`}
        className={`border-b border-rule-light bg-paper py-2.5 ${
          neverVerified ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''
        }`}
      >
        <div className={GRID}>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold">{item.name}</div>
            <div
              className={`text-[11px] font-medium ${
                neverVerified ? 'text-accent-700' : 'text-neutral-700'
              }`}
            >
              {/* The slot leads the metadata line rather than taking a
                  column of its own: the count column already spends 112px
                  on the boxes+loose control (see `GRID`), and a fourth
                  column at 393px is the overflow that control just cost us.
                  It is here at all so the order the rows are in reads as an
                  order rather than as an arbitrary shuffle. */}
              {slot !== undefined && <>{slot} · </>}
              {item.size && <>{item.size} · </>}
              <span>{formatVerifiedAt(verified)}</span>
              {' · '}
              <button
                type="button"
                aria-label={`Adjust ${item.name}`}
                onClick={() => setAdjusting(item.id)}
                className="font-bold text-accent-700"
              >
                Adjust
              </button>
            </div>
          </div>

          <span
            aria-label={`${item.name} on hand`}
            className={`text-right text-[18px] font-extrabold tabular-nums ${
              estimate === 0 && neverVerified ? 'text-neutral-500' : 'text-ink'
            }`}
          >
            {estimate}
          </span>

          <QuantityField
            item={item}
            units={units.get(item.id) ?? 0}
            // Same shape as useCounting's steppers: commit
            // optimistically, persist behind it, swallow a rejected
            // write here rather than let it surface as an unhandled
            // rejection (no error surface is in scope for this screen
            // either — see known-gaps.md).
            onChange={(qty) => { void setUnits(item.id, qty).catch(() => {}) }}
          />
        </div>
      </li>
    )
  }

  return (
    <ScreenLayout
      header={
        <ScreenHeader
          eyebrow={`LEDGER · ${countedCount} OF ${items.length} VERIFIED`}
          title="Storeroom"
        />
      }
    >
      <div className="border-b border-rule-light px-4 py-2">
        <input
          type="search"
          aria-label="Search storeroom"
          placeholder="Search storeroom"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border-b-2 border-ink bg-transparent pb-1 text-[13.5px] outline-none"
        />
      </div>

      <div
        data-testid="storeroom-column-header"
        className={`${GRID} bg-ink py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ground`}
      >
        <span>Item</span>
        <span className="text-right leading-tight">App<br />estimate</span>
        <span className="text-right leading-tight">Your<br />count</span>
      </div>

      {groups.map((group) => (
        <section key={group.key}>
          <h3>
            <SectionBar
              heading={group.heading}
              open={sections.isOpen(group.key)}
              count={group.rows.length}
              onToggle={() => sections.toggle(group.key)}
            />
          </h3>
          {sections.isOpen(group.key) && <ul>{group.rows.map(row)}</ul>}
        </section>
      ))}

      {unplaced.length > 0 && (
        <section>
          <h3>
            <SectionBar
              heading="UNPLACED"
              open={sections.isOpen(UNPLACED)}
              count={unplaced.length}
              onToggle={() => sections.toggle(UNPLACED)}
            />
          </h3>
          {sections.isOpen(UNPLACED) && <ul>{unplaced.map(row)}</ul>}
        </section>
      )}

      <p className="bg-surface px-4 py-3 text-[11px] font-medium text-neutral-700">
        <strong>App estimate</strong> is your last count plus every delivery and
        adjustment since. Typing <strong>your count</strong> overrides it and the
        running total starts again from there.
      </p>

      {/* The backup export (design §14). It sits here because this is the
          screen the operator is already on when they are at G with a phone
          and no trolley, and because there is no settings screen to hide it
          behind. Neutral rather than accent: this screen's one accent is
          already spent on the never-verified inset, and a safety action that
          shouts competes with the work.
          `void` and a swallowed rejection, like the writes above — the
          failure mode is a download that does not start, which the operator
          sees directly, and there is still no error surface on this screen
          (known-gaps.md). */}
      <div className="border-t border-rule-light">
        <button
          type="button"
          onClick={() => { void downloadBundle().catch(() => {}) }}
          className={`w-full bg-ground ${ACTION} text-neutral-700`}
        >
          Export a backup · {formatShortDate(today())}
        </button>
        <p className="px-4 pb-3 text-[11px] font-medium text-neutral-700">
          Saves every table as one JSON file. Do it before you install a new
          version: an older build cannot reopen a database a newer one has
          upgraded.
        </p>
      </div>

      <RestoreFromBackup onFinished={() => { void refresh() }} />

      {/* A floating sheet, not an inline one — the same fix the machine map
          needed (94cf425). This list is the whole sixty-item catalogue, so a
          sheet rendered in document order after it opens thousands of pixels
          below the "Adjust" button that was tapped: from where the operator
          is standing, a button that does nothing. Anchored to the bottom,
          capped at 80vh, scrollable, and dismissed by tapping the backdrop. */}
      {adjusting !== null && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-2"
          onClick={() => setAdjusting(null)}
          aria-label="Close adjustment sheet"
          role="presentation"
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <AdjustmentSheet
              location={{ kind: 'storeroom' }}
              itemId={adjusting}
              itemName={items.find((i) => i.id === adjusting)?.name ?? ''}
              onSaved={() => {
                setAdjusting(null)
                void refresh()
              }}
              onCancel={() => setAdjusting(null)}
            />
          </div>
        </div>
      )}
    </ScreenLayout>
  )
}

type RestoreState =
  | { kind: 'idle' }
  | { kind: 'confirming'; fileName: string; bundle: Bundle; plan: ImportPlan }
  | { kind: 'restoring' }
  | { kind: 'restored'; rows: number }
  | { kind: 'refused'; message: string }

/** The other half of the export above: putting a backup file back.
 *
 * Two taps, never one. Picking a file only reads and describes it — the
 * import itself is behind a second, separately labelled `Confirm restore`,
 * the same shape `ItemEditScreen` uses to delete an item, because the tap
 * that commits deletes the database. `accent-700` as text and never a fill
 * (tokens.md): the destructive action is marked, not made attractive.
 *
 * The picked file is validated *before* the confirmation is offered rather
 * than after it is accepted, so a file that is not a backup, or one from a
 * newer build, is refused while the operator's data is still there — a
 * refusal they can act on, not a report of what has already happened.
 *
 * This is also the one place on this screen with an error surface
 * (known-gaps.md: there is none anywhere else, and the writes above swallow
 * their rejections). It has to be: every other action here is one cell of
 * one row, and this one is the whole database. */
function RestoreFromBackup({ onFinished }: { onFinished: () => void }) {
  const [state, setState] = useState<RestoreState>({ kind: 'idle' })

  async function pick(input: HTMLInputElement) {
    const file = input.files?.[0]
    // Cleared so that picking the same file again still fires `change` —
    // after a refusal, re-picking the file just fixed is the obvious move.
    input.value = ''
    if (!file) return
    try {
      const bundle = await readBundleFile(file)
      setState({ kind: 'confirming', fileName: file.name, bundle, plan: planImport(bundle) })
    } catch (error) {
      setState({ kind: 'refused', message: reasonFor(error) })
    }
  }

  async function restore(bundle: Bundle, rows: number) {
    setState({ kind: 'restoring' })
    try {
      await importBundle(bundle)
      setState({ kind: 'restored', rows })
    } catch (error) {
      setState({ kind: 'refused', message: reasonFor(error) })
    }
    // Either way. A failed import leaves the database empty rather than
    // half-written, and the screen should show that rather than the rows it
    // was rendered with before the attempt.
    onFinished()
  }

  return (
    <div className="border-t border-rule-light">
      {state.kind === 'confirming' && (
        <>
          <p className="px-4 pt-3 text-[11px] font-medium text-neutral-700">
            <strong>{state.fileName}</strong>
            {' — '}{state.plan.rows} rows, saved {formatShortDate(state.plan.takenOn)}.
            Restoring deletes everything the app holds now and puts this file in
            its place. There is no undo.
          </p>
          {state.plan.fromOlderSchema && (
            <p className="px-4 pt-2 text-[11px] font-medium text-neutral-700">
              It was written by an older version of the app (schema{' '}
              {state.plan.schemaVersion}; this one reads schema{' '}
              {state.plan.currentSchemaVersion}), so it is restored and then
              brought up to date, exactly as your own data was.
            </p>
          )}
          <div className="flex">
            <button
              type="button"
              onClick={() => { void restore(state.bundle, state.plan.rows) }}
              className={`bg-ground ${ACTION} text-accent-700`}
            >
              Confirm restore
            </button>
            <button
              type="button"
              onClick={() => setState({ kind: 'idle' })}
              className={`bg-ground ${ACTION} text-neutral-700`}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {state.kind === 'restoring' && (
        <div className={`bg-ground ${ACTION} text-neutral-700`}>Restoring…</div>
      )}

      {(state.kind === 'idle' || state.kind === 'restored' || state.kind === 'refused') && (
        // A label rather than a button driving a hidden input: the file
        // picker is the browser's, and a label opens it without a ref, a
        // synthetic click, or a control that lies about what it is.
        <label className={`block cursor-pointer bg-ground ${ACTION} text-accent-700`}>
          Restore from a backup
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Backup file"
            className="sr-only"
            onChange={(event) => { void pick(event.currentTarget) }}
          />
        </label>
      )}

      {state.kind === 'refused' ? (
        <p className="px-4 pb-3 text-[11px] font-semibold text-accent-700">
          {state.message}
        </p>
      ) : (
        <p className="px-4 pb-3 text-[11px] font-medium text-neutral-700">
          {state.kind === 'restored'
            ? `Restored ${state.rows} rows. Everything that was here before is gone.`
            : 'Replaces everything in the app with an exported file. Use it after '
              + 'reinstalling an older version, or on a new phone.'}
        </p>
      )}
    </div>
  )
}

function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message : 'That backup could not be restored.'
}
