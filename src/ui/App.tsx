import { useState } from 'react'
import { ItemListScreen } from './items/ItemListScreen'
import { ItemEditScreen } from './items/ItemEditScreen'
import { MachineListScreen } from './machines/MachineListScreen'
import { MachineMapScreen } from './machines/MachineMapScreen'
import { CountScreen } from './run/CountScreen'
import { StoreroomScreen } from './storeroom/StoreroomScreen'
import { HistoryScreen } from './history/HistoryScreen'
import { NavContext, type TabName } from './components/ScreenLayout'
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
  // `lg:max-w-none` only applies on History: that is where the stock
  // matrix lives, and it is the one screen that needs the wide viewport.
  // Every other screen stays a phone-width column (StockMatrix.tsx's
  // comment says the same from the other side).
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
      <div className={`mx-auto max-w-lg bg-ground ${wide ? 'lg:max-w-none' : ''}`}>
        {body}
      </div>
    </NavContext.Provider>
  )
}
