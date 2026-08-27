/** The operator's local calendar day, `yyyy-mm-dd` — never UTC.
 *
 * `Date.prototype.toISOString` always reports UTC. This app runs on one
 * operator's phone at a fixed location (Australia/Adelaide, UTC+9:30 per the
 * design doc) and real restock runs start before 09:30 local. Before then,
 * the UTC calendar day is still yesterday, so `toISOString().slice(0, 10)`
 * silently points every run/visit lookup at the wrong day for the whole
 * first stretch of the morning (fix-plan 2026-08-27, item 1 — critical: with
 * the spec §7 amendment that made `getOrCreateRun`/`openVisit` return
 * existing records instead of throwing, this used to fail loudly and now
 * fails silently, upserting real counts over last night's test data inside
 * the wrong run).
 *
 * `toLocaleDateString('en-CA')` reads the device's own local calendar day —
 * whatever the operator's wall clock and phone timezone say — and that
 * locale happens to format as `yyyy-mm-dd`. */
export function today(): string {
  return new Date().toLocaleDateString('en-CA')
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** A stored run date (`yyyy-mm-dd`) as a label, e.g. `Thu 27 Aug 2026`.
 *
 * The parts are split by hand and fed to the local-time `Date` constructor
 * rather than passed as a string. `new Date('2026-08-27')` is specified to
 * parse a date-only string as UTC midnight, so in any zone behind UTC it
 * renders as the 26th — the same class of bug as `today()` above, one screen
 * over, and just as silent.
 *
 * The names are spelled out rather than taken from `toLocaleDateString` so
 * the label cannot change with the device's locale: this is a stored
 * calendar date, not a moment being presented to a reader in their own
 * conventions. */
export function formatRunDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const local = new Date(year, month - 1, day)
  return `${WEEKDAYS[local.getDay()]} ${day} ${MONTHS[month - 1]} ${year}`
}
