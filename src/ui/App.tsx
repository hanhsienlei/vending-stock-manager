import { useState } from 'react'
import { ItemListScreen } from './items/ItemListScreen'
import { ItemEditScreen } from './items/ItemEditScreen'
import { MachineListScreen } from './machines/MachineListScreen'
import { MachineMapScreen } from './machines/MachineMapScreen'
import type { Id } from '../domain/types'

type Screen =
  | { name: 'items' }
  | { name: 'item-edit'; itemId?: Id }
  | { name: 'machines' }
  | { name: 'machine-map'; machineId: Id }

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
            machineId={screen.machineId}
            onBack={() => setScreen({ name: 'machines' })}
          />
        )
      case 'machines':
        return (
          <MachineListScreen
            onSelect={(machineId) => setScreen({ name: 'machine-map', machineId })}
          />
        )
    }
  })()

  return (
    <div className="mx-auto max-w-lg pb-16">
      {body}
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-lg border-t bg-white">
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
      </nav>
    </div>
  )
}
