/** The one-tap starter catalogue: a plain, declarative transcription of
 * `docs/catalogue-transcription.md` — already reviewed and corrected by the
 * operator against the paper stock sheets. This module holds data only; the
 * code that writes it lives in `data/repositories/seed.ts`.
 *
 * Every item's `basePar` is fixed at 5 and every `boxSize` at 1 by the
 * seeding function, not stored here — the operator said so for par, and the
 * transcription carries no carton sizes to invent. A mixed slot is simply
 * two or more entries sharing the same slot number; `resolveMachineMap`
 * groups them at read time (spec §4.2), so no separate "mixed slot" concept
 * is needed here.
 *
 * The transcription's `size` column (e.g. "27g", "600ml") is carried into
 * `Item.size` verbatim, including slot 44 and 45's odd-looking `600ml` /
 * `500ml` for Red Bull — a known error on the colleague's part, but not this
 * module's to correct (docs/catalogue-transcription.md, "Resolved" #3). Size
 * is a display label only; nothing computes with it. */

const SIZE_UNVERIFIED_REMARK =
  'Size on the stock sheet looks wrong for this product; not our sheet to correct — kept as written and unverified.'

export interface StarterCatalogueItem {
  name: string
  price: number
  /** Base slot(s) this item occupies. Two items sharing a slot number is
   * what makes that slot mixed — resolved at read time, never stored as a
   * distinct "mixed slot" record. */
  slots: number[]
  /** The transcription's Size column, verbatim — a display label only. */
  size?: string
  remark?: string
}

/** All 60 items, tray by tray, in the order the stock sheets list them. */
export const STARTER_ITEMS: StarterCatalogueItem[] = [
  // Tray 10 — chips
  { name: "Smith's Salt & Vinegar Chips", price: 3.5, slots: [10], size: '27g' },
  { name: 'Red Rock Deli Chips Honey Soy Chicken', price: 3.5, slots: [11], size: '28g' },
  { name: 'Natural Con Snakes', price: 7, slots: [12], size: '190g' },
  { name: 'Doritos Cheese Supreme', price: 4, slots: [13], size: '45g' },
  { name: 'Peanut Pretzel Boodles', price: 5, slots: [14], size: '30g' },

  // Tray 20 — sundries
  { name: 'Extra Gum Spearmint', price: 4, slots: [20], size: 'ea' },
  { name: 'Cranberry and Almond Granola Slice', price: 5, slots: [21], size: 'ea' },
  { name: 'Tampon', price: 9, slots: [22], size: 'ea' },
  { name: 'Dove', price: 8, slots: [23], size: '30g' },
  { name: 'Rexona', price: 8, slots: [24], size: '30g' },
  { name: 'Panadol Paracetamol Tablets', price: 8, slots: [25], size: 'ea' },
  { name: 'Ansell L-STY Condom REG', price: 9, slots: [26], size: 'ea' },
  { name: 'Accor Shaving Kit — Wood Midscale', price: 3.5, slots: [27], size: 'ea' },
  { name: 'Accor Dental Kit — Bamboo Generic', price: 2.5, slots: [28], size: 'ea' },
  { name: 'Lemon Slice', price: 3, slots: [29], size: '25g' },

  // Tray 30 — chocolate
  { name: 'Go Natural Almond & Cashew', price: 5, slots: [30], size: '45g' },
  { name: 'Turkish Delight', price: 5, slots: [31], size: '50g' },
  { name: 'Mondelez Cherry Ripe', price: 5, slots: [32], size: '44g' },
  { name: 'Cadbury Dream', price: 5, slots: [33], size: '50g' },
  { name: 'Cadbury Boost', price: 5, slots: [34], size: '50g' },
  { name: 'Snickers', price: 5, slots: [35], size: '53g' },
  { name: 'Mars', price: 5, slots: [36], size: '47g' },
  { name: 'Twix', price: 5, slots: [37], size: '50g' },
  { name: 'KitKat', price: 5, slots: [38], size: '48g' },
  { name: 'Cadbury Picnic', price: 5, slots: [39], size: '46g' },

  // Tray 40 — juice, energy, water
  { name: 'Chicken Noodles Cup', price: 5, slots: [40], size: '250ml' },
  { name: 'Apple Juice', price: 5.5, slots: [41], size: '300ml' },
  { name: 'Orange Juice', price: 5.5, slots: [42], size: '250ml' },
  { name: 'Fuze Peach Lemon Tea', price: 6, slots: [43], size: '250ml' },
  // 44 — MIXED: Red Bull Energy Drink + Mother Energy Drink. Sheet reads
  // 600ml for both — wrong for Red Bull, the colleague's known error, kept
  // as written (docs/catalogue-transcription.md, "Resolved" #3).
  {
    name: 'Red Bull Energy Drink',
    price: 5.5,
    slots: [44],
    size: '600ml',
    remark: SIZE_UNVERIFIED_REMARK,
  },
  {
    name: 'Mother Energy Drink',
    price: 5.5,
    slots: [44],
    size: '600ml',
    remark: SIZE_UNVERIFIED_REMARK,
  },
  // 45 — MIXED: Red Bull No Sugar + Mother No Sugar. Sheet reads 500ml.
  {
    name: 'Red Bull No Sugar',
    price: 5.5,
    slots: [45],
    size: '500ml',
    remark: SIZE_UNVERIFIED_REMARK,
  },
  {
    name: 'Mother No Sugar',
    price: 5.5,
    slots: [45],
    size: '500ml',
    remark: SIZE_UNVERIFIED_REMARK,
  },
  { name: 'Powerade Blue', price: 5, slots: [46], size: '500ml' },
  { name: 'Nu Pure Sparkling Water', price: 6, slots: [47], size: '500ml' },
  // 48 and 49 are the same product, two slots deep.
  { name: 'Nu Pure Water Bottles', price: 4, slots: [48, 49], size: '600ml' },

  // Tray 50 — cans
  { name: 'Coopers Pale Ale', price: 8, slots: [50], size: '330ml' },
  // 51 — MIXED: Coopers XPA + Prancing Pony XPA
  { name: 'Coopers XPA', price: 10, slots: [51], size: '330ml' },
  { name: 'Prancing Pony XPA', price: 10, slots: [51], size: '330ml' },
  // 52 — MIXED: Sunkist + Fanta
  { name: 'Sunkist', price: 4.5, slots: [52], size: '375ml' },
  { name: 'Fanta', price: 4.5, slots: [52], size: '375ml' },
  // 53 — MIXED: Pepsi + Kirks Ginger Beer
  { name: 'Pepsi', price: 4.5, slots: [53], size: '375ml' },
  { name: 'Kirks Ginger Beer', price: 4.5, slots: [53], size: '375ml' },
  { name: 'Pepsi Max', price: 4.5, slots: [54], size: '375ml' },
  { name: 'Sprite', price: 4.5, slots: [55], size: '375ml' },
  { name: 'Coke No Sugar', price: 4.5, slots: [56, 57], size: '375ml' },
  { name: 'Coke', price: 4.5, slots: [58, 59], size: '375ml' },

  // Tray 60 — alcohol
  { name: 'Hahn Super Dry', price: 10, slots: [60], size: '375ml' },
  { name: 'Spiked Iced Tea Peach RTD', price: 12, slots: [61], size: '375ml' },
  // 62 — MIXED: Sour Puss Grape RTD + Ginger Beer (new)
  { name: 'Sour Puss Grape RTD', price: 12, slots: [62], size: '375ml' },
  { name: 'Ginger Beer (new)', price: 12, slots: [62], size: '375ml' },
  // 63 — MIXED, three items: Vodka Cruiser Zero Sugar Mixed Berry +
  // Vodka Cruiser Lime + Tequila
  { name: 'Vodka Cruiser Zero Sugar Mixed Berry', price: 12, slots: [63], size: '275ml' },
  { name: 'Vodka Cruiser Lime', price: 12, slots: [63], size: '275ml' },
  { name: 'Tequila', price: 12, slots: [63], size: '275ml' },
  { name: 'Smirnoff Lime Seltzer', price: 12, slots: [64], size: '375ml' },
  { name: "Gordon's London Dry Gin & Tonic 4.5%", price: 12, slots: [65], size: '375ml' },
  {
    name: 'Johnnie Walker Blended Scotch Whisky & Cola (Cube)',
    price: 12,
    slots: [66],
    size: '375ml',
  },
  {
    name: 'Canadian Club Canadian Whiskey & Cola 4.8%',
    price: 12,
    slots: [67],
    size: '375ml',
  },
  { name: 'Bundaberg Rum & Cola UP 4.6% (Cube)', price: 12, slots: [68], size: '375ml' },
  {
    name: 'Jim Beam White Label Bourbon Whiskey & Cola 4.8% (Cube)',
    price: 12,
    slots: [69],
    size: '375ml',
  },
]

/** L2 through L16 — fifteen machines, one per floor. */
export const STARTER_MACHINE_LEVELS: number[] = Array.from(
  { length: 15 },
  (_, i) => i + 2,
)
