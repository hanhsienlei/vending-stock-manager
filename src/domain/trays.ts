export const TRAYS = [10, 20, 30, 40, 50, 60] as const

export function trayOf(slotNumber: number): number {
  return Math.floor(slotNumber / 10) * 10
}

export function slotsInTray(slots: number[], tray: number): number[] {
  return slots.filter((s) => trayOf(s) === tray).sort((a, b) => a - b)
}

/** Every physical slot number a tray actually has — 10–14 for the short
 * first tray, ten slots for the rest. This is what the item screen's slot
 * picker offers (fix-plan item 13); offering exactly these is what makes an
 * invalid slot number unreachable rather than rejected after the fact. */
export function allSlotsInTray(tray: number): number[] {
  if (!(TRAYS as readonly number[]).includes(tray)) return []
  const last = tray === 10 ? 14 : tray + 9
  return Array.from({ length: last - tray + 1 }, (_, i) => tray + i)
}

/** Display label only — slot numbers stay 10–69 everywhere else. Physically
 * these are the first through sixth tray; 10/20/…/60 are slot-number
 * prefixes, not tray names, so "Tray 10" on screen reads as a count of
 * trays rather than an index
 * (devs/debug/tray-name-should-be-tray1-tray2-etc.png). Shared by the item
 * list (grouped by tray) and the counting screen's tray tabs. */
export function trayLabel(tray: number): string {
  return `Tray ${tray / 10}`
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
