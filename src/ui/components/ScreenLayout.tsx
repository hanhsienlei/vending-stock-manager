import {
  createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode,
} from 'react'

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
  header, stickyExtra, fullScreenInLandscape = false, children,
}: {
  header: ReactNode
  /** Bars a screen wants stuck directly beneath the tab row — the run
   * screen's tray tabs and column header (§3.7). Positioned below the tab
   * bar by measuring the tab bar's own rendered height rather than a
   * hard-coded pixel offset, so it tracks the tab bar's real height instead
   * of guessing it (and drifting the moment that height changes). Rendered
   * as `nav`'s own sticky sibling, not a wrapper around it, so `nav` keeps
   * its existing place directly under the shell's own container — nothing
   * here changes what `nav`'s parent is. */
  stickyExtra?: ReactNode
  /** Hands the whole landscape viewport to the screen's body, by hiding the
   * context header, the tab bar and `stickyExtra` when the phone is turned.
   *
   * The stock sheet is the only thing that needs this: its chrome costs
   * ~203px of a 393px-tall landscape screen, over half, leaving room for six
   * rows of a sixty-row table. Rotating back to portrait restores everything
   * — which is deliberately the ONLY way out, because a control that hides
   * the chrome would have to sit somewhere on top of the sheet, and a screen
   * whose exit can be hidden is a screen the operator can get stuck on. */
  fullScreenInLandscape?: boolean
  children: ReactNode
}) {
  const { active, go } = useContext(NavContext)
  const navRef = useRef<HTMLElement>(null)
  const [navHeight, setNavHeight] = useState(0)

  // Layout effect, not a plain effect: a plain effect runs after paint, so
  // there would be one visible frame on every screen entry where
  // `stickyExtra` renders at `top: 0` and overlaps `nav` before the height
  // lands. This screen is entered many times a run — that flash would read
  // as breakage, not as a one-off.
  useLayoutEffect(() => {
    const el = navRef.current
    if (!el) return
    const measure = () => setNavHeight(el.getBoundingClientRect().height)
    measure()
    // ResizeObserver isn't implemented in jsdom; the window-resize fallback
    // still keeps this correct across a real orientation change or a
    // dynamic-type font bump, just without the finer-grained callback.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const hideInLandscape = fullScreenInLandscape ? 'landscape:hidden' : ''

  return (
    <>
      <div className={hideInLandscape}>{header}</div>
      <nav
        ref={navRef}
        className={`sticky top-0 z-10 flex gap-5 border-b-2 border-rule-strong bg-ground px-4 ${hideInLandscape}`}
      >
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
      {stickyExtra && (
        <div
          className={`sticky z-[5] bg-ground ${hideInLandscape}`}
          style={{ top: navHeight }}
        >
          {stickyExtra}
        </div>
      )}
      {children}
    </>
  )
}
