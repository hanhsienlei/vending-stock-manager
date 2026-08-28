import { createContext, useContext, type ReactNode } from 'react'

export type TabName = 'machines' | 'items' | 'storeroom' | 'history'

export const NavContext = createContext<{
  active: TabName
  go: (tab: TabName) => void
}>({ active: 'machines', go: () => {} })

const TABS: { name: TabName; label: string }[] = [
  { name: 'machines', label: 'Machines' },
  { name: 'items', label: 'Items' },
  { name: 'storeroom', label: 'Storeroom' },
  { name: 'history', label: 'History' },
]

/** Header, then the sticky tab bar, then the screen. The four tabs are flush
 * left with a 20px gap and are NOT stretched to equal widths — the previous
 * bar's four centred, equal-width buttons with no active state is defect #3
 * ("the navigation bar is in the button, very weird"). */
export function ScreenLayout({
  header, children,
}: {
  header: ReactNode
  children: ReactNode
}) {
  const { active, go } = useContext(NavContext)
  return (
    <>
      {header}
      <nav className="sticky top-0 z-10 flex gap-5 border-b-2 border-rule-strong bg-ground px-4">
        {TABS.map((tab) => (
          <button
            key={tab.name}
            type="button"
            aria-current={active === tab.name ? 'page' : undefined}
            onClick={() => go(tab.name)}
            className={`py-2.5 text-[13px] ${
              active === tab.name
                ? 'font-extrabold text-ink shadow-[inset_0_-3px_0_var(--color-accent)]'
                : 'font-medium text-neutral-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {children}
    </>
  )
}
