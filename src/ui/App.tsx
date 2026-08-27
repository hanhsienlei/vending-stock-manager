import { useState } from 'react'
import { ItemListScreen } from './items/ItemListScreen'
import { ItemEditScreen } from './items/ItemEditScreen'
import { MachineListScreen } from './machines/MachineListScreen'
import { MachineMapScreen } from './machines/MachineMapScreen'
import { CountScreen } from './run/CountScreen'
import { StoreroomScreen } from './storeroom/StoreroomScreen'
import type { Id, Machine } from '../domain/types'

type Screen =
  | { name: 'items' }
  | { name: 'item-edit'; itemId?: Id }
  | { name: 'machines' }
  | { name: 'machine-map'; machine: Machine }
  | { name: 'count'; runId: Id; machineId: Id }
  | { name: 'storeroom' }

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
            machineId={screen.machineId}
            onDone={() => setScreen({ name: 'machines' })}
          />
        )
      case 'machines':
        return (
          <MachineListScreen
            onCount={(machineId, runId) => setScreen({ name: 'count', runId, machineId })}
            onViewMap={(machine) => setScreen({ name: 'machine-map', machine })}
          />
        )
      case 'storeroom':
        return <StoreroomScreen />
    }
  })()

  return (
    // The nav sits at the top, clear of where a thumb rests while scrolling a
    // fifty-slot machine (fix-plan item 11). `pt-14` keeps the body out from
    // under it; the nav itself is `z-10` so the counting screen's tray tabs
    // scroll beneath rather than over it.
    <div className="mx-auto max-w-lg pt-14">
      <nav className="fixed inset-x-0 top-0 z-10 mx-auto flex max-w-lg border-b bg-white">
        <button
          type="button"
          className="flex-1 p-3 font-semibold"
          onClick={() => setScreen({ name: 'machines' })}
        >
          Machines
        </button>
        <button
          type="button"
          className="flex-1 p-3 font-semibold"
          onClick={() => setScreen({ name: 'items' })}
        >
          Items
        </button>
        <button
          type="button"
          className="flex-1 p-3 font-semibold"
          onClick={() => setScreen({ name: 'storeroom' })}
        >
          Storeroom
        </button>
      </nav>
      {body}
    </div>
  )
}
