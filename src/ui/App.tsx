import { useEffect, useState } from 'react'
import { ItemListScreen } from './items/ItemListScreen'
import { ItemEditScreen } from './items/ItemEditScreen'
import { MachineListScreen } from './machines/MachineListScreen'
import { MachineMapScreen } from './machines/MachineMapScreen'
import { CountScreen } from './run/CountScreen'
import { StoreroomScreen } from './storeroom/StoreroomScreen'
import { HistoryScreen } from './history/HistoryScreen'
import { NavContext, type TabName } from './components/ScreenLayout'
import { backfillBoxSizes } from '../data/repositories/backfillBoxSizes'
import type { Id, Machine } from '../domain/types'

type Screen =
  | { name: 'items' }
  | { name: 'item-edit'; itemId?: Id }
  | { name: 'machines' }
  | { name: 'machine-map'; machine: Machine }
  | { name: 'count'; runId: Id; machine: Machine }
  | { name: 'storeroom' }
  | { name: 'history' }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'machines' })

  // The catalogue on the operator's phone was seeded before the supplier
  // carton sizes were ever transcribed, so every item sits at the
  // placeholder `boxSize: 1`. Re-seeding cannot fix that — the seed refuses
  // to run once any item exists, which is the gate protecting a real
  // catalogue from a stray tap — so the sizes are carried in here instead.
  //
  // Safe to run on every start: it only writes to an item still at the
  // placeholder, so it is a no-op read once it has run, and a size the
  // operator has set by hand is never overwritten. Failure is swallowed
  // deliberately — a carton size is a convenience, and there is no error
  // surface on this screen (known-gaps.md); it must never stop the app
  // opening at a machine.
  useEffect(() => {
    void backfillBoxSizes().catch(() => {})
  }, [])

  const body = (() => {
    switch (screen.name) {
      case 'item-edit':
        return (
          <ItemEditScreen
            itemId={screen.itemId}
            onDone={() => setScreen({ name: 'items' })}
          />
        )
      case 'items':
        return (
          <ItemListScreen
            onSelect={(itemId) => setScreen({ name: 'item-edit', itemId })}
            onNew={() => setScreen({ name: 'item-edit' })}
          />
        )
      case 'machine-map':
        return (
          <MachineMapScreen
            machine={screen.machine}
            onBack={() => setScreen({ name: 'machines' })}
          />
        )
      case 'count':
        return (
          <CountScreen
            runId={screen.runId}
            machine={screen.machine}
            onDone={() => setScreen({ name: 'machines' })}
          />
        )
      case 'machines':
        return (
          <MachineListScreen
            onCount={(machine, runId) => setScreen({ name: 'count', runId, machine })}
            onViewMap={(machine) => setScreen({ name: 'machine-map', machine })}
          />
        )
      case 'storeroom':
        return <StoreroomScreen />
      case 'history':
        return <HistoryScreen />
    }
  })()

  // The nav sits at the top, clear of where a thumb rests while scrolling a
  // fifty-slot machine (fix-plan item 11). Each screen renders its own
  // `ScreenLayout`, whose `<nav>` is `sticky top-0` rather than `fixed`, so
  // there is nothing to push the body out from under any more.
  //
  // History drops the width cap entirely: that is where the stock matrix
  // lives, and it is the one screen that needs every pixel. Every other
  // screen stays a phone-width column (StockMatrix.tsx's comment says the
  // same from the other side).
  //
  // This was `lg:max-w-none`, which never fired on the device it was for.
  // Tailwind's `lg` is 1024px and an iPhone 15 in landscape is 852px, so the
  // matrix stayed clamped to `max-w-lg` (512px) — a narrow centred column
  // with a hand's width of dead margin either side, which is exactly what
  // the operator photographed. Dropping the cap rather than lowering the
  // breakpoint is safe in portrait too: 393px is already well under 512px,
  // so the cap was never doing anything there.
  const wide = screen.name === 'history'
  const active: TabName =
    screen.name === 'item-edit' ? 'items'
    : screen.name === 'machine-map' || screen.name === 'count' ? 'machines'
    : screen.name

  return (
    <NavContext.Provider
      value={{
        active,
        go: (tab) => setScreen({ name: tab } as Screen),
      }}
    >
      <div className={`mx-auto bg-ground ${wide ? '' : 'max-w-lg'}`}>
        {body}
      </div>
    </NavContext.Provider>
  )
}
