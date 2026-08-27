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
