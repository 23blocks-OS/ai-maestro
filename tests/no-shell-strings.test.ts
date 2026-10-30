/**
 * These files ran external commands through a shell string; a session name in one of them is the
 * pattern behind a past command-injection advisory. They now use execFile with an argument list,
 * and this keeps a shell string from coming back.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const FILES = [
  'scripts/setup-agent-amp.mjs',
  'scripts/register-agent-from-session.mjs',
  'services/config-service.ts',
  'services/hosts-service.ts',
  'services/agents-docker-service.ts',
]

describe('no shell strings', () => {
  for (const file of FILES) {
    it(`${file} runs commands with argv only`, () => {
      const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
      expect(src).not.toMatch(/\bexecSync\s*\(/)
      expect(src).not.toMatch(/\bexecAsync\s*\(/)
      expect(src).not.toMatch(/import\s*\{[^}]*\bexec\b[^}]*\}\s*from\s*'child_process'/)
    })
  }
})
