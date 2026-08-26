/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const FORBIDDEN = ['dexie', 'react', '../data/', './data/', 'node:fs']

describe('domain purity', () => {
  it('imports nothing that performs I/O', () => {
    const dir = join(process.cwd(), 'src/domain')
    const offenders: string[] = []

    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
      const source = readFileSync(join(dir, file), 'utf8')
      for (const bad of FORBIDDEN) {
        if (source.includes(`from '${bad}`)) offenders.push(`${file} -> ${bad}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
