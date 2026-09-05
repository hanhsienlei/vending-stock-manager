/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const FORBIDDEN = ['dexie', 'react', '../data/', './data/', 'node:fs']

/** Phase 3 design §3.1. `CountLine.touched` is not trustworthy on any visit
 * finalized on or before 2026-09-04: wherever `Fill tray to par` was used it
 * was persisted `true` for slots nobody counted (fixed by `4cad94e`), and a
 * false positive is indistinguishable on disk from a real per-slot Fill,
 * which sets the same flag. It under-reports too — `setAfter` does not add
 * its key to `touched`, so a hand-typed after-count reads as untouched.
 *
 * No figure is affected: `before`, `after`, the sales residual and the
 * carried-forward levels never read it. So the forecast is built from
 * levels, dates and adjustments, all of which are sound — and reaching for
 * `touched` to mean "observed" is the natural move and the wrong one, which
 * is why this is a mechanical guard and not a matter of memory.
 *
 * The one file below predates the rule and is accepted as it stands — it is
 * the field's own declaration. **Nothing new joins this list.** */
const TOUCHED_MAY_APPEAR_IN = ['types.ts']

describe('domain purity', () => {
  it('imports nothing that performs I/O', () => {
    const offenders: string[] = []

    for (const [file, source] of domainSources()) {
      for (const bad of FORBIDDEN) {
        if (source.includes(`from '${bad}`)) offenders.push(`${file} -> ${bad}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the forecast away from CountLine.touched', () => {
    const offenders: string[] = []

    for (const [file, source] of domainSources()) {
      if (TOUCHED_MAY_APPEAR_IN.includes(file)) continue
      if (/\btouched\b/.test(source)) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })
})

function domainSources(): [string, string][] {
  const dir = join(process.cwd(), 'src/domain')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => [file, readFileSync(join(dir, file), 'utf8')])
}
