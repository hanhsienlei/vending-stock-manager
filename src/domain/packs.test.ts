import { describe, it, expect } from 'vitest'
import { toBoxesAndLoose, fromBoxesAndLoose } from './packs'

describe('pack and loose counting', () => {
  it('splits units into boxes and what is left over', () => {
    expect(toBoxesAndLoose(137, 24)).toEqual({ boxes: 5, loose: 17 })
  })

  it('adds them back up', () => {
    expect(fromBoxesAndLoose(5, 17, 24)).toBe(137)
  })

  // Every seeded item currently has boxSize 1, so the control has to degrade
  // to plain units on its own rather than showing "137 boxes + 0".
  it('reports everything as loose when a box holds one', () => {
    expect(toBoxesAndLoose(137, 1)).toEqual({ boxes: 0, loose: 137 })
    expect(fromBoxesAndLoose(0, 137, 1)).toBe(137)
  })

  it('treats a nonsensical box size as loose rather than dividing by zero', () => {
    expect(toBoxesAndLoose(137, 0)).toEqual({ boxes: 0, loose: 137 })
  })

  it('handles an exact number of boxes', () => {
    expect(toBoxesAndLoose(48, 24)).toEqual({ boxes: 2, loose: 0 })
  })
})
