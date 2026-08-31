/** Supplier package sizes, transcribed from the operator's paper stocktake
 * sheets (`docs/user-context/stocktake-sheet-1.heic`, `-2.heic`) — the
 * `Package` column, which reads `Box 21`, `Case 24`, `Box 200`. Units per
 * carton; the box/case wording is the supplier's, and only the number is
 * stock-keeping information.
 *
 * This exists because the starter catalogue seeded every item at
 * `boxSize: 1` — a placeholder nobody filled in — so the storeroom's
 * boxes+loose split has never had a real carton size to work with, and the
 * report's Box column would read `1` sixty times.
 *
 * **Keyed by catalogue name, and the sheet's wording is not the catalogue's.**
 * The sheet says `SMITHS CRINKLE CUT SALT VINEGAR Chips`, `Bundy`,
 * `Kitkat`; the catalogue says `Smith's Salt & Vinegar Chips`,
 * `Bundaberg Rum & Cola UP 4.6% (Cube)`, `KitKat`. Every key below is the
 * CATALOGUE name, matched by hand against the sheet. A test asserts that
 * every key names an item that actually exists, because a typo here would
 * silently do nothing rather than fail.
 *
 * ## Deliberately absent
 *
 * Fourteen of the sixty items are not here, and each is a decision rather
 * than an omission:
 *
 * - **Blank on the sheet** — the sundries are sold as loose units and the
 *   `Package` column is empty for them: `Tampon`, `Dove`, `Rexona`,
 *   `Panadol Paracetamol Tablets`, `Ansell L-STY Condom REG`.
 * - **The sheet contradicts itself** — `Apple Juice` and `Orange Juice`
 *   appear on BOTH sheets, as `Box 12` in the cups-and-juice group and as
 *   `Case 24` in the drinks group. The catalogue has one of each, so there
 *   is no way to tell which figure belongs to it. Guessing would put a wrong
 *   carton size behind an ordering decision.
 * - **The sheet names a different product** — `Fuze Peach black Tea` against
 *   the catalogue's `Fuze Peach Lemon Tea`, and `Smirnoff Ice Red` against
 *   `Smirnoff Lime Seltzer`. Same brand, different line.
 * - **Not on the sheets at all** — `Prancing Pony XPA`, `Kirks Ginger Beer`,
 *   `Ginger Beer (new)`, `Vodka Cruiser Lime`, `Tequila`.
 *
 * All fourteen keep `boxSize: 1` and show blank in the report's Box column,
 * which is the honest reading: the size is unknown, not one. */
export const PACKAGE_SIZES: Record<string, number> = {
  // Snacks — sheet 1
  "Smith's Salt & Vinegar Chips": 21,
  'Red Rock Deli Chips Honey Soy Chicken': 21,
  'Natural Con Snakes': 12,
  'Doritos Cheese Supreme': 18,
  'Peanut Pretzel Boodles': 14,

  // Sundries — sheet 1
  'Extra Gum Spearmint': 24,
  'Cranberry and Almond Granola Slice': 100,
  'Accor Shaving Kit — Wood Midscale': 200,
  'Accor Dental Kit — Bamboo Generic': 200,
  'Lemon Slice': 200,

  // Chocolate — sheet 1
  'Go Natural Almond & Cashew': 16,
  'Turkish Delight': 36,
  'Mondelez Cherry Ripe': 48,
  'Cadbury Dream': 48,
  'Cadbury Boost': 35,
  'Snickers': 50,
  'Mars': 50,
  'Twix': 20,
  'KitKat': 36,
  'Cadbury Picnic': 25,

  // Cups — sheet 1
  'Chicken Noodles Cup': 12,

  // Energy, water and soft drink — sheet 2
  'Red Bull Energy Drink': 24,
  'Red Bull No Sugar': 24,
  'Mother Energy Drink': 24,
  'Mother No Sugar': 24,
  'Powerade Blue': 12,
  'Nu Pure Sparkling Water': 24,
  'Nu Pure Water Bottles': 24,
  'Sunkist': 30,
  'Pepsi': 30,
  'Pepsi Max': 30,
  'Sprite': 24,
  'Fanta': 24,
  'Coke No Sugar': 24,
  'Coke': 24,

  // Beer and RTD — sheet 2
  'Coopers Pale Ale': 24,
  'Coopers XPA': 24,
  'Hahn Super Dry': 24,
  'Spiked Iced Tea Peach RTD': 24,
  'Sour Puss Grape RTD': 24,
  'Vodka Cruiser Zero Sugar Mixed Berry': 24,
  "Gordon's London Dry Gin & Tonic 4.5%": 24,
  'Johnnie Walker Blended Scotch Whisky & Cola (Cube)': 24,
  'Canadian Club Canadian Whiskey & Cola 4.8%': 24,
  'Bundaberg Rum & Cola UP 4.6% (Cube)': 24,
  'Jim Beam White Label Bourbon Whiskey & Cola 4.8% (Cube)': 24,
}

/** The placeholder every item was seeded with. An item still sitting at this
 * value has never had a real carton size, which is what makes it safe for
 * the backfill to write to — and what makes anything above it the
 * operator's own figure, never to be overwritten. */
export const UNSET_BOX_SIZE = 1
