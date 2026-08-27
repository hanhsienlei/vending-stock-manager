import type { Machine } from '../../domain/types'

/** The seed writes a machine's label as `Level ${level}` — the same
 * information as the bold "L{level}" chip shown next to it everywhere in
 * the UI. Spec §4.1 still defines a machine as being *at a location*
 * (`L7 · Lift lobby`), so the field itself is never removed — only a label
 * that is genuinely distinct from the level is worth rendering.
 * (devs/debug/machine-list-page-no-need-location.png) */
export function distinctLabel(machine: Machine): string | undefined {
  return machine.label === `Level ${machine.level}` ? undefined : machine.label
}
