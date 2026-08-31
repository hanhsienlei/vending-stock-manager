import type { MatrixRow } from '../../domain/stockMatrix'
import type { Machine } from '../../domain/types'

/** The longest name that still leaves the figures room. Every column is now
 * a fixed width so the whole sheet fits a phone in landscape without
 * scrolling sideways, and the item column's share of 852px is about 130px —
 * roughly eighteen characters at 13px. The full string stays on the cell's
 * `title`. */
const NAME_LIMIT = 18

function truncateName(name: string): string {
  return name.length <= NAME_LIMIT ? name : `${name.slice(0, NAME_LIMIT).trimEnd()}…`
}

const HEAD = 'sticky top-0 z-10 bg-ink px-1 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-ground'
const CELL = 'px-1 py-1.5 text-[13px] font-extrabold tabular-nums'

/** The paper stock sheet, on screen — and in landscape, the whole screen.
 *
 * A PDF export is held (design §2), so a screenshot has to do the job, which
 * makes fitting the sheet in one view a requirement rather than polish.
 * Three things get it there: fixed column widths, machine columns labelled
 * by bare floor number exactly as the operator's paper sheet has them
 * handwritten (`2 3 4 … 16`), and `LG` for the storeroom.
 *
 * There is deliberately no machine selector any more. It existed to narrow a
 * table too wide to read; the columns now fit outright, and the operator
 * always wants every floor. **The layout is therefore sized for exactly
 * fifteen machines** — a sixteenth would overflow, and would need either the
 * selector back or narrower cells.
 *
 * `Order` stays blank for hand-writing until Phase 3 fills it, as the paper
 * does today. */
export function StockMatrix({
  rows, machines,
}: {
  rows: MatrixRow[]
  machines: Machine[]
}) {
  return (
    <div>
      {/* `overscroll-x-none` kills the horizontal rubber-band the operator hit
          on the phone. The table no longer exceeds the screen, so there is
          nothing to drag, but a stray sideways swipe would still bounce the
          page without this. The safe-area padding keeps the first and last
          columns clear of the Dynamic Island, which in landscape sits over
          the edge of the viewport. */}
      <div
        data-testid="matrix-scroller"
        // In landscape this div is the scroll container, not the page: it
        // takes the full viewport height and scrolls vertically itself.
        //
        // That is what makes the frozen header work. `position: sticky` sticks
        // within the nearest scrolling ancestor, and this element's
        // `overflow-x` ALREADY made it that ancestor — so with the page doing
        // the vertical scrolling, the header dutifully stuck to the top of a
        // container that was itself scrolling away, and slid off screen with
        // it. Measured, not assumed: the header sat at -900px after a 900px
        // scroll. Giving this element the vertical scroll too puts the sticky
        // header and the scrolling in the same container, where sticky works.
        className="overflow-x-auto overscroll-x-none landscape:h-[100dvh] landscape:overflow-y-auto"
        style={{
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {/* `w-full` so landscape fills the screen exactly — no horizontal scroll,
              nothing to rubber-band. `min-w-[722px]` is the floor: it is the sum
              of the column widths below, and without it a portrait viewport
              (393px) would squash twenty-two columns into a phone's width and
              make every figure unreadable. Under the floor the container
              scrolls sideways, which is the portrait behaviour and always was. */}
          <table className="w-full min-w-[722px] table-fixed">
          <colgroup>
            {/* Wide enough for a mixed slot's locator (`44-1`) on one line.
                An item in two slots (`48, 49`) still wraps — three items in
                the catalogue do that, and a second line on three rows is
                cheaper than 10px off every other column. */}
            <col style={{ width: '40px' }} />
            <col style={{ width: '122px' }} />
            <col style={{ width: '34px' }} />
            <col style={{ width: '30px' }} />
            {machines.map((m) => <col key={m.id} style={{ width: '26px' }} />)}
            <col style={{ width: '32px' }} />
            <col style={{ width: '36px' }} />
            <col style={{ width: '40px' }} />
          </colgroup>
          <thead>
            <tr className="text-left">
              <th scope="col" className={HEAD}>Slot</th>
              <th scope="col" className={HEAD}>Item</th>
              <th scope="col" className={HEAD}>Size</th>
              {/* The paper sheet's `Package` column, in the position it
                  occupies there — beside the name, left of the counts. */}
              <th scope="col" className={`${HEAD} text-right`}>Box</th>
              {/* Bare floor numbers, as the operator's own sheet writes them.
                  The `L` prefix cost 49px across fifteen columns, which is the
                  difference between the sheet fitting a landscape screen and
                  scrolling sideways. */}
              {machines.map((m) => (
                <th key={m.id} scope="col" className={`${HEAD} text-right`}>
                  {m.level}
                </th>
              ))}
              {/* `LG` is the operator's own name for the storeroom floor. It
                  has been `GF` and `Str room` on earlier sheets; this is the
                  one they use out loud, and it is also the shortest, which is
                  what buys the machine columns their width. */}
              <th
                scope="col"
                className={`${HEAD} border-l-2 border-rule-strong text-right`}
              >
                LG
              </th>
              <th scope="col" className={`${HEAD} text-right`}>Total</th>
              <th scope="col" className={`${HEAD} text-right text-accent`}>Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.key}
                aria-label={`stock row ${row.key}`}
                // At 60 rows by 22 columns, banding is what keeps a
                // screenshot readable (§11).
                className={`border-b border-rule-light ${i % 2 === 0 ? 'bg-paper' : 'bg-neutral-100'}`}
              >
                <td className={`${CELL} text-[13px] leading-tight`}>{row.key}</td>
                <td
                  aria-label={`item for ${row.key}`}
                  title={row.itemName}
                  className="truncate px-1 py-1.5 text-[13px] font-semibold"
                >
                  {truncateName(row.itemName)}
                </td>
                <td className="truncate px-1 py-1.5 text-[10px] font-medium text-neutral-700">
                  {row.size ?? ''}
                </td>
                {/* Blank, never `1`: the placeholder means the carton size is
                    unknown, and printing 1 would claim a size the catalogue
                    does not have. */}
                <td
                  aria-label={`box size for ${row.key}`}
                  className="px-1 py-1.5 text-right text-[12px] font-semibold tabular-nums text-neutral-700"
                >
                  {row.boxSize > 1 ? row.boxSize : ''}
                </td>
                {machines.map((m) => {
                  const value = row.perMachine.get(m.id) ?? 0
                  return (
                    <td
                      key={m.id}
                      className={`${CELL} text-right ${
                        value === 0 ? 'text-accent-700' : 'text-ink'
                      }`}
                    >
                      {value}
                    </td>
                  )
                })}
                <td className={`${CELL} border-l-2 border-rule-strong text-right`}>
                  {row.storeroom}
                </td>
                <td className={`${CELL} text-right`}>{row.total}</td>
                {/* Blank by design — Phase 3 fills it; until then it is
                    hand-written, exactly as on the paper sheet. The tint
                    says whose column it is. */}
                <td
                  aria-label={`order for ${row.key}`}
                  className="bg-accent-100 px-1 py-1.5"
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Portrait only: in landscape the sheet owns the screen, and a legend
          under it would cost two rows of stock. */}
      <p className="bg-surface px-4 py-3 text-[11px] font-medium text-neutral-700 landscape:hidden">
        Order stays blank for your pen until Phase 3 fills it — the red header
        marks it as the column that is yours, not the app&rsquo;s. A red figure
        is a machine at zero.
      </p>
    </div>
  )
}
