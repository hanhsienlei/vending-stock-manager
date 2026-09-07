import type { MatrixRow } from '../../domain/stockMatrix'
import type { Id, Machine } from '../../domain/types'

/** The longest name the item column holds at its rendered width. Measured
 * rather than guessed: at 852px the column renders ~218px, and the longest
 * real product name in the catalogue — `Jim Beam White Label Bourbon Whiskey
 * & Cola 4.8% (Cube)` — fits 26 characters of it at regular weight.
 *
 * Regular weight is what bought those characters. The names were semibold
 * and the figures extrabold; lightening both narrowed every glyph, which let
 * the machine columns give 60px back to the name. Eighteen characters became
 * twenty-six.
 *
 * The cell also carries CSS `truncate`, which measures real glyph widths and
 * catches anything this character count lets through. The full string stays
 * on the cell's `title`. */
const NAME_LIMIT = 26

function truncateName(name: string): string {
  return name.length <= NAME_LIMIT ? name : `${name.slice(0, NAME_LIMIT).trimEnd()}…`
}

const HEAD = 'sticky top-0 z-10 bg-ink px-1 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-ground'
const CELL = 'px-1 py-1.5 text-[13px] font-medium tabular-nums'

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
 * `Order` is the one column that is the operator's rather than the app's.
 * Without `orderByItem` it renders blank for hand-writing, exactly as the
 * paper sheet does; with it, it prints the suggestion (decision D7, design
 * §12.4). The accent header and the `accent-100` fill stay either way — a
 * suggested figure is still a figure the operator may cross out.
 *
 * The map is keyed by item and holds an already-formatted string (`2 × 24`,
 * or plain units at `boxSize: 1`), so this component formats nothing and the
 * matrix and the order section below it cannot drift apart. **An item absent
 * from the map keeps its blank cell** — that is how "no rate yet" reads here,
 * because a zero would claim the app had worked out that nothing is needed. */
export function StockMatrix({
  rows, machines, orderByItem,
}: {
  rows: MatrixRow[]
  machines: Machine[]
  orderByItem?: Map<Id, string>
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
        // takes the full viewport height, scrolls vertically, and cannot
        // scroll horizontally at all.
        //
        // `landscape:overflow-x-hidden` is what finally killed the sideways
        // nudge. `table-fixed` + `w-full` makes the table exactly the
        // container's width, so nothing meaningful can overflow — but
        // sub-pixel rounding across twenty-two columns still left 7px of
        // scrollable width, and the container would still drag. Measured: the
        // table box was 852px, its columns summed to 851.97px, no child
        // extended past its right edge, and `scrollLeft` could still reach
        // 6.5px. Forbidding the axis is the only fix that holds regardless of
        // how a device rounds. Portrait keeps `overflow-x-auto`, because there
        // the sheet genuinely is wider than the screen.
        //
        // That is what makes the frozen header work. `position: sticky` sticks
        // within the nearest scrolling ancestor, and this element's
        // `overflow-x` ALREADY made it that ancestor — so with the page doing
        // the vertical scrolling, the header dutifully stuck to the top of a
        // container that was itself scrolling away, and slid off screen with
        // it. Measured, not assumed: the header sat at -900px after a 900px
        // scroll. Giving this element the vertical scroll too puts the sticky
        // header and the scrolling in the same container, where sticky works.
        className="overflow-x-auto overscroll-x-none landscape:h-[100dvh] landscape:overflow-x-hidden landscape:overflow-y-auto"
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
            <col style={{ width: '178px' }} />
            <col style={{ width: '32px' }} />
            <col style={{ width: '30px' }} />
            {machines.map((m) => <col key={m.id} style={{ width: '22px' }} />)}
            {/* GF and Total carry the widest figures on the sheet — a
                storeroom holding ten cartons of 100 is a four-digit number,
                and a clipped `4375` reading as `437` is a wrong figure, not a
                cosmetic problem. Both are sized against four digits, measured.
                The width used to come from Order, back when Order was blank;
                it no longer can, so these two stand on their own. */}
            <col style={{ width: '38px' }} />
            <col style={{ width: '42px' }} />
            {/* Sized for the widest FILLED figure, not for the header. 38px
                was right while the column was blank — room for a pen stroke —
                and became wrong the moment task 17 started printing into it:
                `1 × 21` wrapped onto two lines and the heading clipped, which
                reads as a broken table. `orderCell` emits `<boxes> × <carton>`,
                so the worst case is three digits against three. */}
            <col style={{ width: '72px' }} />
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
              {/* `GF` — the ground floor, where the storeroom is. This column
                  has now been `GF`, `Storeroom` and `LG` in turn; `GF` is what
                  the operator settled on, and it is also two characters, which
                  is what keeps the machine columns their width. */}
              <th
                scope="col"
                className={`${HEAD} border-l-2 border-rule-strong text-right`}
              >
                GF
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
                <td className={`${CELL} text-[13px] font-semibold leading-tight`}>{row.key}</td>
                <td
                  aria-label={`item for ${row.key}`}
                  title={row.itemName}
                  className="truncate px-1 py-1.5 text-[13px] font-normal"
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
                {/* Filled from the suggestion when there is one, and blank
                    for the pen when there is not — the tint says whose
                    column it is in both states. */}
                <td
                  aria-label={`order for ${row.key}`}
                  className="whitespace-nowrap bg-accent-100 px-1 py-1.5 text-right text-[12px] font-bold tabular-nums text-accent-800"
                >
                  {orderByItem?.get(row.itemId) ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Portrait only: in landscape the sheet owns the screen, and a legend
          under it would cost two rows of stock. */}
      <p className="bg-surface px-4 py-3 text-[11px] font-medium text-neutral-700 landscape:hidden">
        {orderByItem
          ? <>Order is the suggestion below, in whole boxes where the carton
              size is known. A blank one means no rate yet — that cell is still
              yours. A red figure is a machine at zero.</>
          : <>Order stays blank for your pen — the red header marks it as the
              column that is yours, not the app&rsquo;s. A red figure is a
              machine at zero.</>}
      </p>
    </div>
  )
}
