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
 * The transcription's `size` column (e.g. "27g", "600ml") has nowhere to
 * live: `Item` has no size field (spec §4.1 lists name, price, photo, box
 * size, base par — not product size), and folding it into `name` would
 * break the exact-name matching the transcription's own resolutions rely on
 * ("Sunkist", "Fanta", …). Size is therefore read from the transcription but
 * not persisted — a deliberate drop, not an oversight. */

const SIZE_UNVERIFIED_REMARK =
  'Size on the stock sheet looks wrong for this product; not our sheet to correct — kept as written and unverified.'

export interface StarterCatalogueItem {
  name: string
  price: number
  /** Base slot(s) this item occupies. Two items sharing a slot number is
   * what makes that slot mixed — resolved at read time, never stored as a
   * distinct "mixed slot" record. */
  slots: number[]
  remark?: string
}

/** All 60 items, tray by tray, in the order the stock sheets list them. */
export const STARTER_ITEMS: StarterCatalogueItem[] = [
  // Tray 10 — chips
  { name: "Smith's Salt & Vinegar Chips", price: 3.5, slots: [10] },
  { name: 'Red Rock Deli Chips Honey Soy Chicken', price: 3.5, slots: [11] },
  { name: 'Natural Con Snakes', price: 7, slots: [12] },
  { name: 'Doritos Cheese Supreme', price: 4, slots: [13] },
  { name: 'Peanut Pretzel Boodles', price: 5, slots: [14] },

  // Tray 20 — sundries
  { name: 'Extra Gum Spearmint', price: 4, slots: [20] },
  { name: 'Cranberry and Almond Granola Slice', price: 5, slots: [21] },
  { name: 'Tampon', price: 9, slots: [22] },
  { name: 'Dove', price: 8, slots: [23] },
  { name: 'Rexona', price: 8, slots: [24] },
  { name: 'Panadol Paracetamol Tablets', price: 8, slots: [25] },
  { name: 'Ansell L-STY Condom REG', price: 9, slots: [26] },
  { name: 'Accor Shaving Kit — Wood Midscale', price: 3.5, slots: [27] },
  { name: 'Accor Dental Kit — Bamboo Generic', price: 2.5, slots: [28] },
  { name: 'Lemon Slice', price: 3, slots: [29] },

  // Tray 30 — chocolate
  { name: 'Go Natural Almond & Cashew', price: 5, slots: [30] },
  { name: 'Turkish Delight', price: 5, slots: [31] },
  { name: 'Mondelez Cherry Ripe', price: 5, slots: [32] },
  { name: 'Cadbury Dream', price: 5, slots: [33] },
  { name: 'Cadbury Boost', price: 5, slots: [34] },
  { name: 'Snickers', price: 5, slots: [35] },
  { name: 'Mars', price: 5, slots: [36] },
  { name: 'Twix', price: 5, slots: [37] },
  { name: 'KitKat', price: 5, slots: [38] },
  { name: 'Cadbury Picnic', price: 5, slots: [39] },

  // Tray 40 — juice, energy, water
  { name: 'Chicken Noodles Cup', price: 5, slots: [40] },
  { name: 'Apple Juice', price: 5.5, slots: [41] },
  { name: 'Orange Juice', price: 5.5, slots: [42] },
  { name: 'Fuze Peach Lemon Tea', price: 6, slots: [43] },
  // 44 — MIXED: Red Bull Energy Drink + Mother Energy Drink
  { name: 'Red Bull Energy Drink', price: 5.5, slots: [44], remark: SIZE_UNVERIFIED_REMARK },
  { name: 'Mother Energy Drink', price: 5.5, slots: [44], remark: SIZE_UNVERIFIED_REMARK },
  // 45 — MIXED: Red Bull No Sugar + Mother No Sugar
  { name: 'Red Bull No Sugar', price: 5.5, slots: [45], remark: SIZE_UNVERIFIED_REMARK },
  { name: 'Mother No Sugar', price: 5.5, slots: [45], remark: SIZE_UNVERIFIED_REMARK },
  { name: 'Powerade Blue', price: 5, slots: [46] },
  { name: 'Nu Pure Sparkling Water', price: 6, slots: [47] },
  // 48 and 49 are the same product, two slots deep.
  { name: 'Nu Pure Water Bottles', price: 4, slots: [48, 49] },

  // Tray 50 — cans
  { name: 'Coopers Pale Ale', price: 8, slots: [50] },
  // 51 — MIXED: Coopers XPA + Prancing Pony XPA
  { name: 'Coopers XPA', price: 10, slots: [51] },
  { name: 'Prancing Pony XPA', price: 10, slots: [51] },
  // 52 — MIXED: Sunkist + Fanta
  { name: 'Sunkist', price: 4.5, slots: [52] },
  { name: 'Fanta', price: 4.5, slots: [52] },
  // 53 — MIXED: Pepsi + Kirks Ginger Beer
  { name: 'Pepsi', price: 4.5, slots: [53] },
  { name: 'Kirks Ginger Beer', price: 4.5, slots: [53] },
  { name: 'Pepsi Max', price: 4.5, slots: [54] },
  { name: 'Sprite', price: 4.5, slots: [55] },
  { name: 'Coke No Sugar', price: 4.5, slots: [56, 57] },
  { name: 'Coke', price: 4.5, slots: [58, 59] },

  // Tray 60 — alcohol
  { name: 'Hahn Super Dry', price: 10, slots: [60] },
  { name: 'Spiked Iced Tea Peach RTD', price: 12, slots: [61] },
  // 62 — MIXED: Sour Puss Grape RTD + Ginger Beer (new)
  { name: 'Sour Puss Grape RTD', price: 12, slots: [62] },
  { name: 'Ginger Beer (new)', price: 12, slots: [62] },
  // 63 — MIXED, three items: Vodka Cruiser Zero Sugar Mixed Berry +
  // Vodka Cruiser Lime + Tequila
  { name: 'Vodka Cruiser Zero Sugar Mixed Berry', price: 12, slots: [63] },
  { name: 'Vodka Cruiser Lime', price: 12, slots: [63] },
  { name: 'Tequila', price: 12, slots: [63] },
  { name: 'Smirnoff Lime Seltzer', price: 12, slots: [64] },
  { name: "Gordon's London Dry Gin & Tonic 4.5%", price: 12, slots: [65] },
  { name: 'Johnnie Walker Blended Scotch Whisky & Cola (Cube)', price: 12, slots: [66] },
  { name: 'Canadian Club Canadian Whiskey & Cola 4.8%', price: 12, slots: [67] },
  { name: 'Bundaberg Rum & Cola UP 4.6% (Cube)', price: 12, slots: [68] },
  {
    name: 'Jim Beam White Label Bourbon Whiskey & Cola 4.8% (Cube)',
    price: 12,
    slots: [69],
  },
]

/** L2 through L16 — fifteen machines, one per floor. */
export const STARTER_MACHINE_LEVELS: number[] = Array.from(
  { length: 15 },
  (_, i) => i + 2,
)
