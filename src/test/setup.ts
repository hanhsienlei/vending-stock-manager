import { afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'

/** Clear `localStorage` between tests, where there is one to clear.
 *
 * The jsdom environment is fresh per FILE, not per test, so `localStorage`
 * survives from one test to the next. Two features persist there rather than
 * in Dexie because they are preferences and not records: which tray sections
 * are folded (`CollapsibleSections`) and the order screen's column choices
 * (`useOrderPreferences`). A test that folds Tray 1 therefore leaves it
 * folded for every test after it in the same file, and a later assertion on
 * an item inside that tray fails to find text the component never rendered.
 *
 * This hid for as long as it did because of a second-order accident. On
 * Node 25 `globalThis.localStorage` is an empty plain object with no
 * `getItem` or `setItem` at all, so `CollapsibleSections`'s try/catch
 * swallows every read and write, nothing persists, and the suite is green by
 * luck rather than by hygiene. On Node 20, which is what CI runs, the storage
 * works — and the pollution surfaced as seven failures across three files
 * that had passed locally for weeks.
 *
 * The guard is what makes this work on both: calling `clear()` unconditionally
 * throws `clear is not a function` on the Node 25 shim and fails all 820
 * tests. Feature-detect, clear when it is real, and no-op where there is
 * nothing that could have been written in the first place. */
afterEach(() => {
  const store: Storage | undefined = globalThis.localStorage
  if (typeof store?.clear === 'function') store.clear()
})
