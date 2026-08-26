import type { CountLine, Id, Visit } from './types'

export function levelKey(slotNumber: number, itemId: Id): string {
  return `${slotNumber}:${itemId}`
}

/** `history` must be newest-first. The first entry seen for a key wins. */
export function lastRecordedLevels(
  history: { visit: Visit; lines: CountLine[] }[],
): Map<string, number> {
  const levels = new Map<string, number>()
  for (const { lines } of history) {
    for (const line of lines) {
      const key = levelKey(line.slotNumber, line.itemId)
      if (!levels.has(key)) levels.set(key, line.after)
    }
  }
  return levels
}
