/** Spec §5.4: every quantity entered at the storeroom is boxes + loose with
 * units computed — "5 boxes + 17 rather than counting to 137". Machine
 * screens stay in loose units, because a vending slot contains no boxes.
 *
 * Every seeded item currently has `boxSize: 1`, which makes this the identity
 * split — everything loose, nothing in boxes — so the control degrades to
 * plain units on its own and starts working the day real carton sizes are
 * entered. */
export function toBoxesAndLoose(
  units: number,
  boxSize: number,
): { boxes: number; loose: number } {
  if (!Number.isFinite(boxSize) || boxSize <= 1) return { boxes: 0, loose: units }
  return { boxes: Math.floor(units / boxSize), loose: units % boxSize }
}

export function fromBoxesAndLoose(
  boxes: number,
  loose: number,
  boxSize: number,
): number {
  if (!Number.isFinite(boxSize) || boxSize <= 1) return loose
  return boxes * boxSize + loose
}
