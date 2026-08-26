export const TRAYS = [10, 20, 30, 40, 50, 60] as const

export function trayOf(slotNumber: number): number {
  return Math.floor(slotNumber / 10) * 10
}

export function slotsInTray(slots: number[], tray: number): number[] {
  return slots.filter((s) => trayOf(s) === tray).sort((a, b) => a - b)
}

/** The machine's physical slot numbers: 10–14, then 20–29 … 60–69. The first
 * tray is short. */
export function isSlotNumber(slot: number): boolean {
  if (!Number.isInteger(slot)) return false
  const tray = trayOf(slot)
  if (!(TRAYS as readonly number[]).includes(tray)) return false
  return tray === 10 ? slot <= 14 : true
}

/** Reads an operator-typed list like `58, 59`. Anything that is not a
 * physical slot number comes back in `invalid` so the screen can say so
 * rather than dropping it silently. */
export function parseSlotNumbers(raw: string): { slots: number[]; invalid: string[] } {
  const slots: number[] = []
  const invalid: string[] = []

  for (const entry of raw.split(',')) {
    const text = entry.trim()
    if (text === '') continue
    const value = Number(text)
    if (!isSlotNumber(value)) invalid.push(text)
    else if (!slots.includes(value)) slots.push(value)
  }

  return { slots: slots.sort((a, b) => a - b), invalid }
}
