# Vending Stock Manager

An offline-first PWA for restocking vending machines, built to replace the paper stock sheets used to service 15 machines in a hotel.

**Live demo: [vending-stock-manager.pages.dev](https://vending-stock-manager.pages.dev)**

## What it does and why

Servicing a floor of vending machines means counting what is left in every slot, working out what to bring up from the storeroom, and knowing what to reorder from the supplier. That was being done on paper twice a week, with the arithmetic redone by hand each run.

This app records the count at the machine on a phone, derives demand from the history, and turns it into a trolley load, a storeroom balance, and a supplier order. It works offline because lift lobbies and service corridors have no reliable signal, and everything stays on the device in IndexedDB.

Built for one operator, in use on real runs, and shaped by their feedback between shifts.

## Features

- **Counting at the machine.** Per-slot before and after counts on a phone-width screen, grouped by tray, with a "fill tray to par" shortcut.
- **Per-machine maps.** Fifteen machines each with their own slot map, because floors drift from the master map as products change over or go out of stock.
- **Sales without a till.** Units sold in a period are derived as a residual between two consecutive finalised visits, net of recorded stock movements. A period that cannot be trusted (no prior visit, slot left with stock, visit never finalised) is labelled censored, so a missing figure never reads as a zero sale.
- **Demand forecast.** Units per day per slot, projected forward by the days since that machine's own last visit rather than since the last run, because a machine skipped last week has been drawing down for twice as long as its neighbours.
- **Trolley allocation.** When the trolley cannot cover every slot, lines are ranked by proven unmet demand first (slots that ran dry), then by demand rate, with a visible cut line marking where the stock runs out.
- **Storeroom ledger.** A running balance per item, with a manual count that resets the estimate to truth.
- **Reorder suggestion.** Demand forecast over a 7 day horizon plus 3 days of safety, converted into whole supplier cartons.
- **Stock matrix.** Every item against every machine, plus storeroom and total, with a deliberately blank Order column to fill in by hand.
- **Backup and restore.** Full JSON export and import, stamped with the schema version that wrote it.
- **Installable and offline.** Service worker, app icons, and no network dependency at run time.

## Tech stack

| | |
|---|---|
| UI | React 19, TypeScript 5.7, Tailwind CSS 4 |
| Build | Vite 6, vite-plugin-pwa (Workbox) |
| Storage | Dexie 4 over IndexedDB, 4 versioned schema migrations |
| Tests | Vitest, Testing Library, fake-indexeddb |
| Hosting | Cloudflare Pages |

## Architecture

**`src/domain/`** holds the business logic as pure functions: forecasting, allocation, sales reconciliation, ordering, tray and slot resolution. It imports no React, no Dexie, and nothing from the data layer. That boundary is enforced mechanically: `src/domain/purity.test.ts` reads every domain source file and fails the build if one of them imports I/O.

**`src/data/`** wraps Dexie behind typed repositories, and owns the schema, its migrations, and the starter catalogue.

**`src/ui/`** is one folder per screen, each owning its own hook and tests.

## Getting started

Requires Node 20 or newer. No backend, no API keys, no environment variables.

```bash
git clone https://github.com/hanhsienlei/vending-stock-manager.git
cd vending-stock-manager
npm install
npm run dev
```

To see it with data, open **Items** and tap **Seed starter catalogue**. That loads a 60 item catalogue across 15 machines. The button only appears while the catalogue is empty, which is the guard against overwriting real data.

## Testing

```bash
npm test           # single run
npm run test:watch
```

825 tests across 53 files, covering domain arithmetic, repositories exercised against a real IndexedDB fake, and screen-level user flows.

## Deployment

```bash
npm run build      # tsc --noEmit && vite build
npm run deploy     # build, then deploy to Cloudflare Pages via wrangler
```

HTTPS is a hard requirement. ID generation uses `crypto.randomUUID()`, which only exists in a secure context, and a PWA will not install over plain HTTP.

## Screenshots

_To add._

## Project docs

`docs/` is the working record kept during development, not generated documentation:

- [`decisions.md`](docs/decisions.md), choices made and the reasoning behind them
- [`known-gaps.md`](docs/known-gaps.md), features deliberately not built and defects deliberately not fixed, each with its reasoning
- [`handover.md`](docs/handover.md), per-release notes covering what changed, what did not, and how to roll back
- [`user-context/user-story.md`](docs/user-context/user-story.md), the original problem statement in the operator's own words

## License

MIT. See [LICENSE](LICENSE).
