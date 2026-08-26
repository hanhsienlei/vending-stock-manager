export const TRAYS = [10, 20, 30, 40, 50, 60] as const

export function trayOf(slotNumber: number): number {
  return Math.floor(slotNumber / 10) * 10
}

export function slotsInTray(slots: number[], tray: number): number[] {
  return slots.filter((s) => trayOf(s) === tray).sort((a, b) => a - b)
}
