# Catalogue transcription — for review before seeding

Transcribed from `docs/user-context/stock-sheet-1.heic` and `stock-sheet-2.heic`
(names, slot numbers, sizes) and `docs/user-context/vending-machine-map.HEIC`
(prices — the stock sheets carry none).

**Nothing has been built from this yet.** Correct anything wrong, then it gets
seeded into the app.

Par is 5 for every slot, as instructed. No stock levels are being imported — the
handwritten counts are one refill out of date.

Lines marked **?** need your input.

---

## Tray 10 — chips

| Slot | Item | Size | Price |
|---|---|---|---|
| 10 | Smith's Salt & Vinegar Chips | 27g | $3.50 |
| 11 | Red Rock Deli Chips Honey Soy Chicken | 28g | $3.50 |
| 12 | Natural Con Snakes | 190g | $7.00 |
| 13 | Doritos Cheese Supreme | 45g | $4.00 |
| 14 | Peanut Pretzel Boodles | 30g | $5.00 |

## Tray 20 — sundries

| Slot | Item | Size | Price |
|---|---|---|---|
| 20 | Extra Gum Spearmint | ea | $4.00 |
| 21 | Cranberry and Almond Granola Slice | ea | $5.00 |
| 22 | Tampon | ea | $9.00 |
| 23 | Dove | 30g | $8.00 |
| 24 | Rexona | 30g | $8.00 |
| 25 | Panadol Paracetamol Tablets | ea | $8.00 |
| 26 | Ansell L-STY Condom REG | ea | $9.00 |
| 27 | Accor Shaving Kit — Wood Midscale | ea | $3.50 |
| 28 | Accor Dental Kit — Bamboo Generic | ea | $2.50 |
| 29 | Lemon Slice | 25g | $3.00 |

## Tray 30 — chocolate

| Slot | Item | Size | Price |
|---|---|---|---|
| 30 | Go Natural Almond & Cashew | 45g | $5.00 |
| 31 | Turkish Delight | 50g | $5.00 |
| 32 | Mondelez Cherry Ripe | 44g | $5.00 |
| 33 | Cadbury Dream | 50g | $5.00 |
| 34 | Cadbury Boost | 50g | $5.00 |
| 35 | Snickers | 53g | $5.00 |
| 36 | Mars | 47g | $5.00 |
| 37 | Twix | 50g | $5.00 |
| 38 | KitKat | 48g | $5.00 |
| 39 | Cadbury Picnic | 46g | $5.00 |

## Tray 40 — juice, energy, water

| Slot | Item | Size | Price |
|---|---|---|---|
| 40 | Chicken Noodles Cup | 250ml | $5.00 |
| 41 | Apple Juice | 300ml | $5.50 |
| 42 | Orange Juice | 250ml | $5.50 |
| 43 | Fuze Peach Lemon Tea | 250ml | $6.00 |
| 44 | **MIXED** — Red Bull Energy Drink + Mother Energy Drink | 600ml | $5.50 |
| 45 | **MIXED** — Red Bull No Sugar + Mother No Sugar | 500ml | $5.50 |
| 46 | Powerade Blue | 500ml | $5.00 |
| 47 | Nu Pure Sparkling Water | 500ml | $6.00 |
| 48 | Nu Pure Water Bottles | 600ml | $4.00 |
| 49 | Nu Pure Water Bottles | 600ml | $4.00 |

## Tray 50 — cans

| Slot | Item | Size | Price |
|---|---|---|---|
| 50 | Coopers Pale Ale | 330ml | $8.00 |
| 51 | **MIXED** — Coopers XPA + Prancing Pony XPA | 330ml | $10.00 |
| 52 | **MIXED** — Sunkist + Fanta | 375ml | $4.50 |
| 53 | **MIXED** — Pepsi + Kirks Ginger Beer | 375ml | $4.50 |
| 54 | Pepsi Max | 375ml | $4.50 |
| 55 | Sprite | 375ml | $4.50 |
| 56 | Coke No Sugar | 375ml | $4.50 |
| 57 | Coke No Sugar | 375ml | $4.50 |
| 58 | Coke | 375ml | $4.50 |
| 59 | Coke | 375ml | $4.50 |

## Tray 60 — alcohol

| Slot | Item | Size | Price |
|---|---|---|---|
| 60 | Hahn Super Dry | 375ml | $10.00 |
| 61 | Spiked Iced Tea Peach RTD | 375ml | $12.00 |
| 62 | **MIXED** — Sour Puss Grape RTD + Matso's Ginger Beer | 375ml | $12.00 |
| 63 | **MIXED** — Vodka Cruiser Zero Sugar Mixed Berry + Vodka Cruiser Lime + Tequila | 275ml | $12.00 |
| 64 | Smirnoff Lime Seltzer | 375ml | $12.00 |
| 65 | Gordon's London Dry Gin & Tonic 4.5% | 375ml | $12.00 |
| 66 | Johnnie Walker Blended Scotch Whisky & Cola (Cube) | 375ml | $12.00 |
| 67 | Canadian Club Canadian Whiskey & Cola 4.8% | 375ml | $12.00 |
| 68 | Bundaberg Rum & Cola UP 4.6% (Cube) | 375ml | $12.00 |
| 69 | Jim Beam White Label Bourbon Whiskey & Cola 4.8% (Cube) | 375ml | $12.00 |

---

## Machines

`L2` through `L16` — fifteen machines, one per floor. All share this map as
their base placement; per-machine differences get recorded as you find them.

---

## Resolved

1. **Slot 44 is Mother / sugared; 45 is Mother No Sugar.** The margin note
   putting `mother no sugar` against 44 is the colleague's error.

   Both slots sometimes get filled with the no-sugar variant when the original
   is out of stock — same price, interchangeable enough that the sale is worth
   more than the exactness. **Not pre-seeded**, because listing four accepted
   items on slot 44 would render four sub-rows on the counting screen, most of
   them zero, on every run. Add the no-sugar item at the machine with `⋯` when
   it actually happens; it persists from then on. Revisit if it turns out to be
   most weeks — the fix would be to hide zero-count sub-rows.

2. **Names confirmed or accepted as placeholders.** `Kirks Ginger Beer` at 53 is
   confirmed from `vending-machine-picture-8`, and slot 62's `Ginger Beer
   (new)` was identified from the product page on 2026-09-05 as **Matso's
   Ginger Beer** — the same source gives its can as 330mL, against the 375ml
   this sheet records; the sheet's figure stands here, per #3. The rest —
   Mother, Mother No Sugar, Prancing Pony XPA, Fanta, Vodka Cruiser Lime,
   Tequila — are seeded under the names used here and **corrected in the app**
   during the next run. Every item name is editable on the item screen.

3. **Sizes on 44 and 45 stay as written** (`600ml`, `500ml`) even though they
   look wrong for Red Bull. Not our sheet to correct. Both items carry a
   `remark` recording that the size is unverified.

4. **Prices follow the laminated map**, which the manager maintains. That is the
   authority; these sheets carry no prices.
