import { describe, it, expect } from 'vitest'
import { compactHint, COMPACT_SOON_TOKENS, COMPACT_NOW_TOKENS } from '@/lib/context-hint'
import fs from 'fs'
import path from 'path'

describe('compactHint: the same rule as the terminal status line', () => {
  it('is none below the soon line, soon from 150k, now from 200k', () => {
    expect(compactHint(0)).toBe('none')
    expect(compactHint(149_999)).toBe('none')
    expect(compactHint(150_000)).toBe('soon')
    expect(compactHint(199_999)).toBe('soon')
    expect(compactHint(200_000)).toBe('now')
    expect(compactHint(950_000)).toBe('now')
  })

  it('treats unknown or invalid sizes as no recommendation', () => {
    expect(compactHint(NaN)).toBe('none')
    expect(compactHint(-5)).toBe('none')
  })

  it('lets the soon line move, never the now line', () => {
    expect(compactHint(100_000, 80_000)).toBe('soon')
    expect(compactHint(199_999, 300_000)).toBe('none')
    expect(compactHint(200_000, 300_000)).toBe('now')
  })

  // The plugin builder is a submodule: skipped where it is not checked out
  const scriptPath = path.join(process.cwd(), 'plugin/plugins/ai-maestro/scripts/amp-statusline.sh')
  it.skipIf(!fs.existsSync(scriptPath))('uses the thresholds the status line script uses (they must not drift)', () => {
    const script = fs.readFileSync(scriptPath, 'utf-8')
    // `COMPACT_AT="${AMP_STATUSLINE_COMPACT_AT:-150000}"` and the 200000 line
    expect(script).toContain(`AMP_STATUSLINE_COMPACT_AT:-${COMPACT_SOON_TOKENS}`)
    expect(script).toContain(`"$CTX_TOKENS" -ge ${COMPACT_NOW_TOKENS}`)
  })
})
