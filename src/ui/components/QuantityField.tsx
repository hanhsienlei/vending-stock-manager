import { fromBoxesAndLoose, toBoxesAndLoose } from '../../domain/packs'
import type { Item } from '../../domain/types'

/** A typed number field, floored at zero. An empty field reads as 0 rather
 * than NaN, so clearing it before typing never writes a nonsense balance. */
function parseQuantity(raw: string): number {
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

/** A quantity input in boxes + loose. One plain field at `boxSize: 1`, boxes +
 * loose above it — the same control either way, because the split degrades to
 * "everything loose" on its own (`domain/packs.ts`). Both fields write one
 * number: what is stored is always units, never a box count, so nothing
 * downstream has to know a carton size to read the figure.
 *
 * It began module-local to the storeroom, which is where the ledger's manual
 * count is typed. The load screen types the same kind of quantity off the same
 * shelf — "two boxes and six" is how the operator counts either way — so the
 * control moved here rather than being written twice. Machine screens stay in
 * loose units throughout: a vending slot contains no boxes. */
export function QuantityField({
  item, units, onChange,
}: {
  item: Item
  units: number
  onChange: (units: number) => void
}) {
  const { boxes, loose } = toBoxesAndLoose(units, item.boxSize)

  if (item.boxSize <= 1) {
    return (
      <input
        aria-label={`${item.name} units`}
        type="number"
        inputMode="numeric"
        min={0}
        className="w-full border-2 border-ink bg-paper px-1.5 py-1 text-right text-[18px] font-extrabold tabular-nums outline-none"
        value={units}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(parseQuantity(e.target.value))}
      />
    )
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        aria-label={`${item.name} boxes`}
        type="number"
        inputMode="numeric"
        min={0}
        className="w-[34px] border-2 border-ink bg-paper px-1 py-1 text-right text-[17px] font-extrabold tabular-nums outline-none"
        value={boxes}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) =>
          onChange(fromBoxesAndLoose(parseQuantity(e.target.value), loose, item.boxSize))}
      />
      <span className="whitespace-nowrap text-[10px] font-medium text-neutral-700">
        ×{item.boxSize} +
      </span>
      <input
        aria-label={`${item.name} loose`}
        type="number"
        inputMode="numeric"
        min={0}
        className="w-[34px] border-2 border-ink bg-paper px-1 py-1 text-right text-[17px] font-extrabold tabular-nums outline-none"
        value={loose}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) =>
          onChange(fromBoxesAndLoose(boxes, parseQuantity(e.target.value), item.boxSize))}
      />
    </div>
  )
}
