import { useState } from 'react'
import { ItemListScreen } from './items/ItemListScreen'
import { ItemEditScreen } from './items/ItemEditScreen'
import type { Id } from '../domain/types'

type Screen = { name: 'items' } | { name: 'item-edit'; itemId?: Id }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'items' })

  if (screen.name === 'item-edit') {
    return (
      <ItemEditScreen
        itemId={screen.itemId}
        onDone={() => setScreen({ name: 'items' })}
      />
    )
  }

  return (
    <ItemListScreen
      onSelect={(itemId) => setScreen({ name: 'item-edit', itemId })}
      onNew={() => setScreen({ name: 'item-edit' })}
    />
  )
}
