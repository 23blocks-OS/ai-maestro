/** B043: SECURITY.md must not drift back to claims that contradict the design (docs/SPEC-SECURITY-POSTURE.md A.4) */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const sec = fs.readFileSync('SECURITY.md', 'utf-8')
const claude = fs.readFileSync('CLAUDE.md', 'utf-8')

describe('SECURITY.md', () => {
  it('has no stale version table or localhost-only advice', () => {
    expect(sec).not.toMatch(/\|\s*1\.0\.x\s*\|/)
    expect(sec).not.toMatch(/127\.0\.0\.1:3000|:3000\b/)
    // split so tests/no-unsafe-tmux-kill.test.ts does not read this line as a call
    expect(sec).not.toContain(['tmux', 'kill-' + 'server'].join(' '))
  })
  it('names only CLAUDE.md sections that exist', () => {
    const headings = new Set([...claude.matchAll(/^#+\s+(.+)$/gm)].map(m => m[1].trim()))
    for (const m of sec.matchAll(/CLAUDE\.md,?\s+"([^"]+)"/g)) expect(headings.has(m[1])).toBe(true)
  })
})
