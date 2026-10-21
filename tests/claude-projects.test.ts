import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { claudeProjectFolders, encodeClaudeProjectDir } from '../lib/claude-projects'

const dirs: string[] = []
function root() { const d = mkdtempSync(path.join(os.tmpdir(), 'maestro-cp-')); dirs.push(d); return d }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true }) })

it('turns every character that is not a letter or digit into a dash', () => {
  expect(encodeClaudeProjectDir('/Users/a b/my_repo.v2')).toBe('-Users-a-b-my-repo-v2')
})

it('finds the folder of a working directory and ignores folders that are not there', () => {
  const r = root()
  mkdirSync(path.join(r, '-work-app'))
  mkdirSync(path.join(r, '-work-other'))
  expect(claudeProjectFolders(r, ['/work/app', '/work/missing'])).toEqual([path.join(r, '-work-app')])
})

it('finds the folder of a path past the length limit by its first 200 characters', () => {
  const r = root()
  const cwd = '/' + 'segment/'.repeat(40) + 'app'
  const encoded = encodeClaudeProjectDir(cwd)
  expect(encoded.length).toBeGreaterThan(200)
  const stored = encoded.slice(0, 200) + '-1a2b3c'
  mkdirSync(path.join(r, stored))
  mkdirSync(path.join(r, 'unrelated'))
  expect(claudeProjectFolders(r, [cwd])).toEqual([path.join(r, stored)])
})

it('does not fail when the projects folder does not exist', () => {
  expect(claudeProjectFolders('/nonexistent-dir-xyz', ['/a/b'])).toEqual([])
  expect(claudeProjectFolders('/nonexistent-dir-xyz', ['/' + 'x'.repeat(250)])).toEqual([])
})
