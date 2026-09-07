import { useCallback, useState } from 'react'

/** The one collapsible section bar, and the state that remembers which
 * sections are shut.
 *
 * Four screens group their rows by tray — the item list, the storeroom, the
 * stock matrix and a run's receipt — and the operator asked for all four to
 * fold. Building it once is the point: a section that toggles one way here
 * and another way there is four controls to learn instead of one.
 *
 * The bar is the section bar `tokens.md` already specifies — `bg-surface` at
 * `8px 16px`, 9.5px/700 uppercase, heading flush left — with the state
 * marker and the hidden count as the only additions. No chevron icon set and
 * no second colour: the marker is a `−` / `+` glyph in the same neutral as
 * the heading, which is one character wider than the bar was and nothing
 * else.
 *
 * The bar deliberately renders only the button, not the section around it.
 * The stock matrix is a `<table>`, where a `<section>` wrapper is invalid and
 * would break the column alignment; it puts this same button inside a
 * `<th colSpan>` instead, and the other three wrap it in a `<section>`.
 */
export function SectionBar({
  heading, open, count, onToggle, className = '',
}: {
  heading: string
  open: boolean
  /** Rows in the section — reported when it is shut, so a collapsed tray
   * never reads as an empty one. */
  count: number
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={`flex w-full items-center gap-2 bg-surface px-4 py-2 text-left text-[9.5px] font-bold uppercase tracking-[0.12em] text-neutral-700 ${className}`}
    >
      {/* Everything packs to the left, and the count and the marker sit
          against the heading rather than out at the right edge. Two reasons,
          both about width. A long heading with `min-w-0` + `truncate` cannot
          push them off a 393px screen — and on the stock matrix the bar is as
          wide as the table (722px at minimum), so a marker aligned right
          would sit off the side of a portrait phone, and the count of what a
          shut tray is holding would go with it. */}
      <span className="min-w-0 truncate">{heading}</span>
      {!open && (
        <span className="shrink-0 tabular-nums">
          {count} hidden
        </span>
      )}
      {/* A glyph, not an icon: `−` when the section is open (tap to close it)
          and `+` when it is shut. `aria-hidden` because `aria-expanded`
          already says the same thing to a screen reader, and a bare minus
          sign read aloud says nothing. */}
      <span aria-hidden className="w-3 shrink-0 text-center text-[13px] leading-none">
        {open ? '−' : '+'}
      </span>
    </button>
  )
}

/** Which sections are shut, per screen, kept across launches.
 *
 * `localStorage`, like `useOrderPreferences` — a preference, not a record,
 * so it is not worth a Dexie table or the migration that comes with one
 * (design §3.9). Every read and write is guarded the same way and for the
 * same reason: private-mode Safari throws on access, and a screen that will
 * not render because it could not remember a fold is a worse failure than
 * forgetting the fold.
 *
 * **Collapsed is the stored state, so the default is open.** An unseen key —
 * a new tray, a cleared store, a phone that refuses storage — reads as open,
 * and the operator never meets a screen that looks empty because it
 * remembered something they have never done.
 */
export function useCollapsedSections(storageKey: string) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => read(storageKey))

  const toggle = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      // `delete` reports whether it removed anything, so this is "shut it if
      // it is open, open it if it is shut" in one pass.
      if (!next.delete(key)) next.add(key)
      write(storageKey, next)
      return next
    })
  }, [storageKey])

  const isOpen = useCallback((key: string) => !collapsed.has(key), [collapsed])

  return { isOpen, toggle }
}

function read(storageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey)
    const parsed: unknown = raw === null ? null : JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((key): key is string => typeof key === 'string'))
  } catch {
    // Unreadable, or not JSON any more. Everything open is the safe reading.
    return new Set()
  }
}

function write(storageKey: string, collapsed: Set<string>) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...collapsed]))
  } catch { /* see `read` */ }
}
