import { trayOf, trayHeading } from '../../domain/trays'
import { SectionBar, useCollapsedSections } from '../components/CollapsibleSections'
import type { MatrixRow } from '../../domain/stockMatrix'
import type { Id, Machine } from '../../domain/types'

/** Rows the tray sections could not place, kept in a section of their own so
 * that a locator this cannot read costs a heading rather than a row. */
const UNPLACED = 'unplaced'

/** The tray a row belongs to, read back out of its locator — `34`, `52-1` and
 * `58, 59` all start with the slot the row is filed under, which is exactly
 * how `buildStockMatrix` ordered them in the first place. Read here rather
 * than added to `MatrixRow`: the domain already decided this row's position,
 * and a second field carrying the same fact is a second thing to keep true.
 *
 * `undefined` only for a locator with no leading number at all, which the
 * matrix builder cannot produce today — the guard is here so that a row can
 * never be lost to a grouping, which is a display decision. */
function trayOfRow(row: MatrixRow): number | undefined {
  const slot = Number.parseInt(row.key, 10)
  return Number.isNaN(slot) ? undefined : trayOf(slot)
}

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
/** Every column's width in one place, because the table's minimum width has
 * to equal their sum and a second hard-coded number goes stale silently. It
 * did, twice: `min-w-[722px]` survived Order growing 38px → 72px and Full and
 * Balance adding 106px, after which the table declared a floor 146px narrower
 * than its own columns and `table-fixed` squashed every figure to fit. */
const COL = {
  /** Wide enough for a mixed slot's locator (`44-1`) on one line. */
  slot: 40,
  item: 178,
  size: 32,
  box: 30,
  machine: 22,
  /** GF and Total carry the sheet's widest figures — a storeroom holding ten
   * cartons of 100 is four digits, and a clipped `4375` reading as `437` is a
   * wrong figure, not a cosmetic problem. Measured against four digits. */
  gf: 38,
  total: 42,
  /** Full and Balance are sized against their own HEADINGS, which are wider
   * than their figures: `BALANCE` is seven characters at 9.5px/700 with
   * 0.12em tracking. Order was sized against its content instead and clipped
   * its own heading, which the operator reported as a broken table. */
  full: 44,
  balance: 62,
  /** `orderCell` emits `<boxes> × <carton>`, worst case three digits
   * against three. */
  order: 72,
} as const

const FIXED_WIDTH =
  COL.slot + COL.item + COL.size + COL.box
  + COL.gf + COL.total + COL.full + COL.balance + COL.order

export function StockMatrix({
  rows, machines, orderByItem,
}: {
  rows: MatrixRow[]
  machines: Machine[]
  orderByItem?: Map<Id, string>
}) {
  const sections = useCollapsedSections('vsm.matrix.collapsedTrays')

  // One group per tray, in tray order — which is the order `rows` already
  // arrives in, so grouping never reorders the sheet, it only cuts it. The
  // trays come from the rows, like the receipt's: a tray nothing is placed in
  // gets no bar, and a slot outside the six still gets a heading rather than
  // losing its row.
  const trays = [...new Set(rows.map(trayOfRow))]
    .filter((tray): tray is number => tray !== undefined)
    .sort((a, b) => a - b)

  const groups = [
    ...trays.map((tray) => ({
      key: String(tray),
      heading: trayHeading(tray),
      rows: rows.filter((row) => trayOfRow(row) === tray),
    })),
    {
      key: UNPLACED,
      heading: 'UNPLACED',
      rows: rows.filter((row) => trayOfRow(row) === undefined),
    },
  ].filter((group) => group.rows.length > 0)

  // Slot, Item, Size, Box, then a column per machine, then GF, Total, Order.
  // The section bar spans exactly this, so it displaces no column.
  const columnCount = 4 + machines.length + 5
  // The floor, derived rather than declared. Below it the container scrolls
  // sideways; above it `w-full` lets the sheet fill the screen.
  const minWidth = FIXED_WIDTH + machines.length * COL.machine

  // The banding runs across the sheet rather than restarting in each section:
  // it exists so the eye can hold a row across twenty-two columns (§11), and
  // a stripe that resets at every heading is a stripe that stops helping.
  // Counted over the rows actually shown, so folding a tray does not leave
  // two identical bands meeting where it used to be.
  const bandByRowKey = new Map<string, number>()
  let shown = 0
  for (const group of groups) {
    if (!sections.isOpen(group.key)) continue
    for (const row of group.rows) bandByRowKey.set(row.key, shown++ % 2)
  }

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
        // Landscape USED TO hide the horizontal overflow, on the reasoning
        // that the sheet fitted exactly and there was nothing to scroll. That
        // held at 722px against an 852px landscape phone and stopped holding
        // the moment the sheet reached 868px — and `hidden` does not shrink
        // what overflows, it CLIPS it, so the Order column was cut off the
        // right-hand edge with nothing to drag it back. Landscape scrolls
        // sideways too now, on the devices that need it; `w-full` still fills
        // a screen wide enough to take the whole sheet, which is most of
        // them.
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
          <table className="w-full table-fixed" style={{ minWidth }}>
          <colgroup>
            {/* Wide enough for a mixed slot's locator (`44-1`) on one line.
                An item in two slots (`48, 49`) still wraps — three items in
                the catalogue do that, and a second line on three rows is
                cheaper than 10px off every other column. */}
            <col style={{ width: COL.slot }} />
            <col style={{ width: COL.item }} />
            <col style={{ width: COL.size }} />
            <col style={{ width: COL.box }} />
            {machines.map((m) => <col key={m.id} style={{ width: COL.machine }} />)}
            {/* GF and Total carry the widest figures on the sheet — a
                storeroom holding ten cartons of 100 is a four-digit number,
                and a clipped `4375` reading as `437` is a wrong figure, not a
                cosmetic problem. Both are sized against four digits, measured.
                The width used to come from Order, back when Order was blank;
                it no longer can, so these two stand on their own. */}
            <col style={{ width: COL.gf }} />
            <col style={{ width: COL.total }} />
            {/* Full and Balance. Sized against their own headings, which are
                wider than their figures: `BALANCE` is seven characters of
                9.5px/700 at 0.12em tracking. The Order column was sized
                against its content once and clipped its own heading, which
                reads as a broken table — see the note below. */}
            <col style={{ width: COL.full }} />
            <col style={{ width: COL.balance }} />
            {/* Sized for the widest FILLED figure, not for the header. 38px
                was right while the column was blank — room for a pen stroke —
                and became wrong the moment task 17 started printing into it:
                `1 × 21` wrapped onto two lines and the heading clipped, which
                reads as a broken table. `orderCell` emits `<boxes> × <carton>`,
                so the worst case is three digits against three. */}
            <col style={{ width: COL.order }} />
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
              {/* What the estate holds with every slot at par, and the gap to
                  it. Beside Total because they are read against it. */}
              <th scope="col" className={`${HEAD} text-right`}>Full</th>
              <th scope="col" className={`${HEAD} text-right`}>Balance</th>
              <th scope="col" className={`${HEAD} text-right text-accent`}>Order</th>
            </tr>
          </thead>
          {/* One `<tbody>` per tray, because a `<section>` cannot live in a
              table and a wrapper element around a run of `<tr>`s would drop
              the rows out of the table's own layout — which is what aligns
              the columns. The bar itself is the shared `SectionBar`, inside a
              `<th colSpan>` spanning every column so it displaces none of
              them. The frozen header is untouched: it is in the `<thead>`,
              above all of these. */}
          {groups.map((group) => (
            <tbody key={group.key}>
              <tr>
                <th
                  colSpan={columnCount}
                  scope="colgroup"
                  // `p-0`: the bar brings the section-bar padding with it, and
                  // the cell's own `px-1` would inset it from the sheet's
                  // edge and make it read as a cell rather than a heading.
                  className="border-b border-rule-light p-0 text-left"
                >
                  <SectionBar
                    heading={group.heading}
                    open={sections.isOpen(group.key)}
                    count={group.rows.length}
                    onToggle={() => sections.toggle(group.key)}
                    // The sheet's own tracking, not the list screens' — every
                    // heading on this table is set at 0.06em because
                    // twenty-two columns cannot afford 0.12em.
                    className="tracking-[0.06em]"
                  />
                </th>
              </tr>
              {sections.isOpen(group.key) && group.rows.map((row) => (
              <tr
                key={row.key}
                aria-label={`stock row ${row.key}`}
                // At 60 rows by 22 columns, banding is what keeps a
                // screenshot readable (§11).
                className={`border-b border-rule-light ${bandByRowKey.get(row.key) === 0 ? 'bg-paper' : 'bg-neutral-100'}`}
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
                <td
                  aria-label={`full for ${row.key}`}
                  className={`${CELL} text-right text-neutral-700`}
                >
                  {row.full}
                </td>
                {/* Short is the direction that costs money, so it is the one
                    that takes the accent; a surplus is just a number. Text,
                    never a fill — the screen's one accent element is the
                    Order column's header (tokens.md, colour budget). */}
                <td
                  aria-label={`balance for ${row.key}`}
                  className={`${CELL} text-right ${row.balance < 0 ? 'text-accent-700' : ''}`}
                >
                  {row.balance}
                </td>
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
          ))}
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
