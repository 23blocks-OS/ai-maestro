import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { missingWorkingDirectory } from '@/services/agents-core-service'

describe('missingWorkingDirectory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-cwd-'))

  it('accepts an existing folder', () => {
    expect(missingWorkingDirectory(root)).toBeNull()
  })

  it('refuses a folder that does not exist, and says tmux would use home', () => {
    const msg = missingWorkingDirectory(path.join(root, 'agents', 'tct-gm'))
    expect(msg).toContain('does not exist')
    expect(msg).toContain('home folder')
  })

  it('refuses a path that is a file', () => {
    const f = path.join(root, 'file.txt')
    fs.writeFileSync(f, 'x')
    expect(missingWorkingDirectory(f)).toContain('not a folder')
  })
})
