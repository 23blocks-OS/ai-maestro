import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// The AI Maestro Claude Code hook must stay byte-identical across the three
// places it ships from. They historically drifted into two implementations and
// every fix had to be applied twice. Canonical is scripts/claude-hooks/…; the
// two plugin copies are produced by scripts/sync-plugin-hook.sh. If this fails,
// someone edited one copy without syncing — run: bash scripts/sync-plugin-hook.sh
const ROOT = process.cwd()
const CANONICAL = 'scripts/claude-hooks/ai-maestro-hook.cjs'
const COPIES = [
  'plugin/src/scripts/ai-maestro-hook.cjs',
  'plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs',
]

const sha = (rel: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex')

describe('ai-maestro-hook.cjs single source of truth', () => {
  it('canonical hook exists', () => {
    expect(fs.existsSync(path.join(ROOT, CANONICAL))).toBe(true)
  })

  for (const copy of COPIES) {
    it(`${copy} is in sync with the canonical hook`, () => {
      expect(fs.existsSync(path.join(ROOT, copy))).toBe(true)
      expect(sha(copy)).toBe(sha(CANONICAL)) // out of sync → run scripts/sync-plugin-hook.sh
    })
  }
})
