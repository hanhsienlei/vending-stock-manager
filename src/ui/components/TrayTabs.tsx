import { TRAYS } from '../../domain/trays'

export function TrayTabs({
  active, onSelect, present,
}: {
  active: number
  onSelect: (tray: number) => void
  present: Set<number>
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b bg-white p-2">
      {TRAYS.filter((t) => present.has(t)).map((tray) => (
        <button
          key={tray}
          type="button"
          onClick={() => onSelect(tray)}
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            tray === active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}
        >
          {tray}
        </button>
      ))}
    </div>
  )
}
